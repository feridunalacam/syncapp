import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Audio Controller Hook - Platform Agnostic Music Controller
 * 
 * Bu hook tüm müzik platformlarıyla konuşan merkezi beyindir.
 * Platform-specific detayları bilmez, sadece standart interface kullanır.
 * 
 * Her platform service şu interface'i implement etmeli:
 * - getCurrentPlayback(accessToken, refreshCallback)
 * - play(accessToken, deviceId?)
 * - pause(accessToken, refreshCallback)
 * - playPlaylist(accessToken, playlistId, deviceId, shuffle)
 * - playTrack(accessToken, trackUri, deviceId)
 * - getActiveDevice(accessToken, refreshCallback)
 * 
 * @param {Object} params
 * @param {Object} params.musicPlayer - Platform service instance (implements PlatformMusicService interface)
 * @param {string} params.selectedPlatform - Currently selected platform ID
 * @param {Object} params.connectedPlatforms - Map of connected platforms
 * @param {Function} params.refreshToken - Generic token refresh function (platformId) => Promise<string>
 * @param {Object} params.selectedRoutine - Currently selected workout routine
 * @param {Object} params.services - All available platform services (spotify, device, etc.)
 */
export const useAudioController = ({
  musicPlayer,
  selectedPlatform,
  connectedPlatforms,
  refreshToken,
  selectedRoutine,
  services,
}) => {
  // Platform-agnostic music state
  const [accessToken, setAccessToken] = useState(null);
  const [track, setTrack] = useState(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicProgress, setMusicProgress] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRestShuffled, setIsRestShuffled] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [currentPlayingPlatform, setCurrentPlayingPlatform] = useState(null); // ✅ Track which platform is actually playing
  
  const playlistStartedRef = useRef(false);
  const progressTimerRef = useRef(null);

  // Initialize Token
  useEffect(() => {
    // Device platform is always available
    if (selectedPlatform === 'device') {
      setAccessToken('device');
      return;
    }
    
    const platformData = connectedPlatforms?.[selectedPlatform];
    if (platformData?.connected && platformData?.accessToken) {
      setAccessToken(platformData.accessToken);
    } else if (!platformData?.connected) {
      setAccessToken(null);
      setTrack(null);
    }
  }, [connectedPlatforms, selectedPlatform]);

  // Fetch Playback Status (Platform Agnostic)
  // This function normalizes platform-specific playback responses to a common format
  const fetchPlayback = useCallback(async () => {
    if (!musicPlayer || !selectedPlatform) return;
    
    // Device platform doesn't need accessToken check
    if (selectedPlatform !== 'device' && !accessToken) return;
    
    const refreshCallback = refreshToken && selectedPlatform !== 'device' 
      ? () => refreshToken(selectedPlatform) 
      : null;
    const playback = await musicPlayer.getCurrentPlayback(accessToken || 'device', refreshCallback);
    
    // Normalize platform-specific response to common format
    // Platform services should return: { item: { name, artists, album, duration_ms }, progress_ms, is_playing }
    if (playback && playback.item) {
        // Handle different platform response formats
        const progressMs = playback.progress_ms || playback.progressMs || 0;
        const progressSeconds = Math.floor(progressMs / 1000);
        
        const item = playback.item;
        const trackName = item.name || item.title || 'Unknown Track';
        const artistName = item.artists?.[0]?.name || item.artist || 'Unknown Artist';
        const albumName = item.album?.name || item.album || 'Unknown Album';
        const durationMs = item.duration_ms || item.durationMs || 0;
        const coverUrl = item.album?.images?.[0]?.url || item.image || item.coverUrl || null;
        
        // Only update if track actually changed to avoid progress jumps
        const currentTrackId = track?.title + track?.artist;
        const newTrackId = trackName + artistName;
        
        setTrack({
            title: trackName,
            artist: artistName,
            album: albumName,
            duration: Math.floor(durationMs / 1000),
            coverUrl: coverUrl,
        });
        
        // Reset progress if track changed, otherwise use current playback position
        if (currentTrackId !== newTrackId) {
          setMusicProgress(0);
        } else {
          setMusicProgress(progressSeconds);
        }
        
        // ✅ FIX: Sync isMusicPlaying state with actual playback
        const actualPlayingState = playback.is_playing !== undefined ? playback.is_playing : playback.isPlaying;
        setIsMusicPlaying(actualPlayingState);
    } else if (!playback) {
      // No playback - reset state
      setTrack(null);
      setMusicProgress(0);
      setIsMusicPlaying(false);
    }
  }, [accessToken, musicPlayer, refreshToken, selectedPlatform, track]);

  // Smooth progress timer - updates every second when music is playing
  useEffect(() => {
    // Clear any existing timer
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    // Only start timer if music is playing and we have a track
    if (isMusicPlaying && track && track.duration) {
      progressTimerRef.current = setInterval(() => {
        setMusicProgress((prev) => {
          // Increment by 1 second, but don't exceed track duration
          const maxDuration = track.duration || 0;
          const newProgress = prev + 1;
          if (newProgress >= maxDuration) {
            // Track finished, stop incrementing
            if (progressTimerRef.current) {
              clearInterval(progressTimerRef.current);
              progressTimerRef.current = null;
            }
            return maxDuration;
          }
          return newProgress;
        });
      }, 1000); // Update every second for smooth progress
    } else if (!isMusicPlaying) {
      // Music paused, stop the timer
      setMusicProgress((prev) => prev); // Keep current progress when paused
    }

    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, [isMusicPlaying, track]);

  // Helper function to detect platform from music source
  const detectPlatformFromSource = useCallback((source, routine) => {
    if (source?.platform) return source.platform;
    if (routine?.platform) return routine.platform;
    
    if (source?.uri) {
      if (source.uri.startsWith('spotify:')) return 'spotify';
      if (source.uri.startsWith('file:') || source.uri.startsWith('device:')) return 'device';
    }
    
    return null;
  }, []);

  // Helper function to check if platform is connected and ready
  const isPlatformReady = useCallback((platformId) => {
    if (!platformId || platformId === 'device') return true; // Device is always available
    const platformData = connectedPlatforms?.[platformId];
    return platformData?.connected && platformData?.accessToken;
  }, [connectedPlatforms]);

  // Main Phase Change Logic - Platform Agnostic
  // 
  // IMPORTANT: Each music source (work/rest, song/playlist) can come from ANY platform
  // Examples:
  //   - Round 1: work = Spotify playlist, rest = Device file
  //   - Round 2: work = Device file, rest = Spotify track
  //   - Round 3: work = YouTube playlist, rest = SoundCloud track
  // 
  // Platform detection priority for each source:
  //   1. source.platform (explicitly saved)
  //   2. URI scheme detection (spotify:, file:, device:, etc.)
  //   3. User's selected platform
  //   4. Default to 'device'
  const handlePhaseChange = useCallback(async (phase, roundNum) => {
      if (!selectedRoutine) return false;

      const routine = selectedRoutine;
      const roundData = routine.roundsData?.[roundNum - 1];
      
      // Find music source for this phase
      let musicSource = null;
      let sourceType = null;
      let detectedPlatform = null;

      // Check for round-level song
      const roundSong = phase === 'work' ? roundData?.workSong : roundData?.restSong;
      if (roundSong) {
        musicSource = roundSong;
        sourceType = 'roundSong';
        detectedPlatform = detectPlatformFromSource(roundSong, routine) || selectedPlatform || 'device';
      }
      
      // Check for round-level playlist
      if (!musicSource) {
        const roundPlaylistId = phase === 'work' ? roundData?.workPlaylistId : roundData?.restPlaylistId;
        const roundPlaylist = phase === 'work' ? roundData?.workPlaylist : roundData?.restPlaylist;
        const roundPlaylistPlatform = phase === 'work' ? roundData?.workPlaylistPlatform : roundData?.restPlaylistPlatform;

        if (roundPlaylistId || roundPlaylist) {
          musicSource = roundPlaylist || { 
            id: roundPlaylistId,
            name: phase === 'work' ? roundData?.workPlaylistName : roundData?.restPlaylistName,
            image: phase === 'work' ? roundData?.workPlaylistImage : roundData?.restPlaylistImage,
            tracksCount: phase === 'work' ? roundData?.workPlaylistTracksCount : roundData?.restPlaylistTracksCount,
            platform: roundPlaylistPlatform
          };
          sourceType = 'roundPlaylist';
          detectedPlatform = roundPlaylistPlatform || detectPlatformFromSource(musicSource, routine) || selectedPlatform || 'device';
        }
      }
      
      // Check for routine-level playlist
      if (!musicSource) {
        if (phase === 'work' && routine.workoutPlaylistId) {
          musicSource = { id: routine.workoutPlaylistId };
          sourceType = 'routinePlaylist';
          detectedPlatform = detectPlatformFromSource(routine, routine) || routine.platform || selectedPlatform || 'device';
        } else if (phase === 'rest' && routine.restPlaylistId) {
          musicSource = { id: routine.restPlaylistId };
          sourceType = 'routinePlaylist';
          detectedPlatform = detectPlatformFromSource(routine, routine) || routine.platform || selectedPlatform || 'device';
        }
      }

      // If no music source found, return false (workout continues without music)
      if (!musicSource) return false;

      // Check if platform is connected and ready
      if (!isPlatformReady(detectedPlatform)) {
        console.warn(`❌ Platform "${detectedPlatform}" is not connected or ready`);
        return false;
      }

      // Get the correct platform service for this music source
      const platformMusicPlayer = services?.[detectedPlatform];
      
      // Check if platform service is available
      if (!platformMusicPlayer) {
        console.warn(`❌ No music player service available for platform "${detectedPlatform}"`);
        return false;
      }

      // Get access token for detected platform
      // Device platform doesn't need accessToken
      const platformAccessToken = detectedPlatform === 'device' 
        ? 'device' 
        : connectedPlatforms?.[detectedPlatform]?.accessToken;
      
      if (!platformAccessToken && detectedPlatform !== 'device') {
        console.warn(`No access token for platform ${detectedPlatform}`);
        return false;
      }

      // Create refresh callback for this platform (device doesn't need refresh)
      const refreshCallback = refreshToken && detectedPlatform !== 'device' 
        ? () => refreshToken(detectedPlatform) 
        : null;

      try {
        // Device platform doesn't need deviceId lookup
        const deviceId = detectedPlatform === 'device' 
          ? 'device' 
          : await platformMusicPlayer.getActiveDevice(platformAccessToken, refreshCallback);
        
        if (!deviceId && detectedPlatform !== 'device') {
          console.warn('No active music device found for phase change');
          return false;
        }

        let playbackTriggered = false;

        if (sourceType === 'roundPlaylist' && musicSource.id) {
          const shuffleState = phase === 'work' ? isShuffled : isRestShuffled;
          const response = await platformMusicPlayer.playPlaylist(
            platformAccessToken,
            musicSource.id,
            deviceId,
            shuffleState,
          );
          if (response && response.success) {
            await platformMusicPlayer.setShuffle(platformAccessToken, shuffleState, deviceId);
          }
          playbackTriggered = response?.success !== false;
          playlistStartedRef.current = false;
        } else if (sourceType === 'roundSong' && musicSource.uri) {
          // For device platform, set track metadata before playing
          if (detectedPlatform === 'device' && platformMusicPlayer.setTrackMetadata && musicSource) {
            platformMusicPlayer.setTrackMetadata({
              name: musicSource.name || musicSource.title,
              artist: musicSource.artist,
              album: musicSource.album,
              image: musicSource.image || musicSource.coverUrl,
            });
          }
          
          const result = await platformMusicPlayer.playTrack(platformAccessToken, musicSource.uri, deviceId);
          playbackTriggered = result?.success !== false;
          playlistStartedRef.current = false;
        } else if (sourceType === 'routinePlaylist' && musicSource.id) {
          if (phase === 'work' && !playlistStartedRef.current) {
            const response = await platformMusicPlayer.playPlaylist(
              platformAccessToken,
              musicSource.id,
              deviceId,
              routine.shuffleMode || false,
            );
            if (response && response.success && routine.shuffleMode) {
              await platformMusicPlayer.setShuffle(platformAccessToken, true, deviceId);
            }
            playbackTriggered = response?.success !== false;
            playlistStartedRef.current = playbackTriggered;
          } else if (phase === 'rest') {
            const response = await platformMusicPlayer.playPlaylist(
              platformAccessToken,
              musicSource.id,
              deviceId,
              isRestShuffled,
            );
            playbackTriggered = response?.success !== false;
          }
        }

        // Reset progress when new music starts
        if (playbackTriggered) {
          setMusicProgress(0);
          setTrack(null);
          setCurrentPlayingPlatform(detectedPlatform);
        }

        // Update accessToken state if platform changed
        if (detectedPlatform === selectedPlatform && playbackTriggered) {
          setTimeout(() => fetchPlayback(), 500);
        }
        
        return playbackTriggered;
      } catch (error) {
        console.error('Error handling music phase change:', error);
        return false;
      }
  }, [
    selectedRoutine, 
    connectedPlatforms,
    refreshToken, 
    fetchPlayback, 
    isRestShuffled, 
    isShuffled,
    selectedPlatform,
    detectPlatformFromSource,
    isPlatformReady,
    services,
  ]);

  const togglePlayPause = useCallback(async () => {
      if (!musicPlayer || !selectedPlatform) return;
      
      // Device platform doesn't need accessToken check
      if (selectedPlatform !== 'device' && !accessToken) return;
      
      const refreshCallback = refreshToken && selectedPlatform !== 'device' 
        ? () => refreshToken(selectedPlatform) 
        : null;
      
      if (isMusicPlaying) {
          await musicPlayer.pause(accessToken || 'device', refreshCallback);
          setIsMusicPlaying(false);
      } else {
          await musicPlayer.play(accessToken || 'device');
          setIsMusicPlaying(true);
      }
  }, [accessToken, musicPlayer, isMusicPlaying, refreshToken, selectedPlatform]);

  // Explicit pause - uses the platform that's actually playing music
  const pauseMusic = useCallback(async () => {
      const platform = currentPlayingPlatform || selectedPlatform;
      const service = services?.[platform];
      const token = platform === 'device' ? 'device' : connectedPlatforms?.[platform]?.accessToken;
      
      if (!service || (platform !== 'device' && !token)) return;
      
      const refreshCb = refreshToken && platform !== 'device' ? () => refreshToken(platform) : null;
      await service.pause(token, refreshCb);
      setIsMusicPlaying(false);
  }, [currentPlayingPlatform, selectedPlatform, services, connectedPlatforms, refreshToken]);

  // Explicit resume - uses the platform that's actually playing music
  const resumeMusic = useCallback(async () => {
      const platform = currentPlayingPlatform || selectedPlatform;
      const service = services?.[platform];
      const token = platform === 'device' ? 'device' : connectedPlatforms?.[platform]?.accessToken;
      
      if (!service || (platform !== 'device' && !token)) return;
      
      await service.play(token);
      setIsMusicPlaying(true);
  }, [currentPlayingPlatform, selectedPlatform, services, connectedPlatforms]);

  const skipNext = useCallback(async () => {
      if (!musicPlayer || !selectedPlatform) return;
      if (selectedPlatform !== 'device' && !accessToken) return;
      
      // Device platform doesn't support skip (single track playback)
      if (selectedPlatform === 'device') {
        console.warn('Skip not supported for device platform');
        return;
      }
      
      const refreshCallback = refreshToken ? () => refreshToken(selectedPlatform) : null;
      // Reset progress when skipping
      setMusicProgress(0);
      await musicPlayer.next(accessToken, refreshCallback);
      setTimeout(() => fetchPlayback(), 500);
  }, [accessToken, musicPlayer, refreshToken, selectedPlatform, fetchPlayback]);

  const skipPrevious = useCallback(async () => {
      if (!musicPlayer || !selectedPlatform) return;
      if (selectedPlatform !== 'device' && !accessToken) return;
      
      // Device platform doesn't support skip (single track playback)
      if (selectedPlatform === 'device') {
        console.warn('Skip not supported for device platform');
        return;
      }
      
      const refreshCallback = refreshToken ? () => refreshToken(selectedPlatform) : null;
      // Reset progress when skipping
      setMusicProgress(0);
      await musicPlayer.previous(accessToken, refreshCallback);
      setTimeout(() => fetchPlayback(), 500);
  }, [accessToken, musicPlayer, refreshToken, selectedPlatform, fetchPlayback]);

  const toggleShuffle = useCallback(async () => {
      if (!accessToken || !musicPlayer) return;
      const newShuffle = !isShuffled;
      setIsShuffled(newShuffle);
      await musicPlayer.setShuffle(accessToken, newShuffle);
  }, [accessToken, musicPlayer, isShuffled]);

  const toggleRepeat = useCallback(async () => {
      if (!musicPlayer || !selectedPlatform) return;
      // Device platform doesn't need accessToken check
      if (selectedPlatform !== 'device' && !accessToken) return;
      
      const newRepeat = !isRepeating;
      setIsRepeating(newRepeat);
      
      // Call platform API to set repeat mode
      // Most platforms support: 'off', 'context' (playlist/album), 'track' (single song)
      // We'll use simple toggle: off <-> context (repeat all)
      if (musicPlayer.setRepeat) {
        const repeatMode = newRepeat ? 'context' : 'off';
        await musicPlayer.setRepeat(accessToken || 'device', repeatMode);
      }
  }, [accessToken, musicPlayer, isRepeating, selectedPlatform]);

  // Stop and cleanup music completely
  const stopMusic = useCallback(async () => {
      const platform = currentPlayingPlatform || selectedPlatform;
      const service = services?.[platform];
      const token = platform === 'device' ? 'device' : connectedPlatforms?.[platform]?.accessToken;
      
      if (!service) return;
      
      const refreshCb = refreshToken && platform !== 'device' ? () => refreshToken(platform) : null;
      
      if (isMusicPlaying) await service.pause(token, refreshCb);
      if (platform === 'device' && service.cleanup) await service.cleanup();
      
      setIsMusicPlaying(false);
      setTrack(null);
      setMusicProgress(0);
      setCurrentPlayingPlatform(null);
      playlistStartedRef.current = false;
  }, [currentPlayingPlatform, selectedPlatform, services, connectedPlatforms, isMusicPlaying, refreshToken]);

  // Set volume (0-100)
  const setVolume = useCallback(async (volumePercent) => {
      if (!musicPlayer || !selectedPlatform) return;
      if (selectedPlatform !== 'device' && !accessToken) return;
      if (volumePercent < 0 || volumePercent > 100) return;
      
      if (musicPlayer.setVolume) {
        await musicPlayer.setVolume(accessToken || 'device', volumePercent);
      }
  }, [musicPlayer, selectedPlatform, accessToken]);

  return {
      accessToken,
      track,
      isMusicPlaying,
      musicProgress,
      setMusicProgress,
      isShuffled,
      isRestShuffled, // exposed if needed for UI
      isRepeating,
      fetchPlayback,
      handlePhaseChange,
      togglePlayPause,
      pauseMusic, // ✅ NEW: Explicit pause (no state checking)
      resumeMusic, // ✅ NEW: Explicit resume (no state checking)
      skipNext,
      skipPrevious,
      toggleShuffle,
      toggleRepeat,
      stopMusic, // ✅ NEW: Complete music stop with cleanup
      setVolume, // ✅ NEW: Volume control
      setRestShuffled: setIsRestShuffled,
      setIsMusicPlaying // manual override if needed
  };
};

