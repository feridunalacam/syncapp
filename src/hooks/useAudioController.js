import { useState, useCallback, useRef, useEffect } from 'react';
import { usePlatformAccessToken } from './audio/usePlatformAccessToken';
import { useMusicProgressTimer } from './audio/useMusicProgressTimer';
import { usePlatformDetection } from './audio/usePlatformDetection';
import { useStopAllMusic } from './audio/useStopAllMusic';

// Note: Device volume control requires a development build with react-native-volume-manager
// For now, volume control is disabled in Expo Go

/**
 * Audio Controller Hook - Platform Agnostic Music Controller
 *
 * Central brain that talks to every music platform. It does not know about
 * platform-specific details and only relies on a small, common interface.
 *
 * Every platform service must implement this interface:
 *  - getCurrentPlayback(accessToken, refreshCallback)
 *  - play(accessToken, deviceId?)
 *  - pause(accessToken, refreshCallback)
 *  - playPlaylist(accessToken, playlistId, deviceId, shuffle)
 *  - playTrack(accessToken, trackUri, deviceId)
 *  - getActiveDevice(accessToken, refreshCallback)
 * 
 * @param {Object} params
 * @param {Object} params.musicPlayer - Platform service instance (implements PlatformMusicService interface)
 * @param {string} params.selectedPlatform - Currently selected platform ID
 * @param {Object} params.connectedPlatforms - Map of connected platforms
 * @param {Function} params.refreshToken - Generic token refresh function (platformId) => Promise<string>
 * @param {Object} params.selectedRoutine - Currently selected workout routine
 * @param {Object} params.services - All available platform services (spotify, device, etc.)
 * @param {Object} params.countdownSoundPlayer - Optional player for countdown sounds
 */
export const useAudioController = ({
  musicPlayer,
  selectedPlatform,
  connectedPlatforms,
  refreshToken,
  selectedRoutine,
  services,
  countdownSoundPlayer = null, // Optional countdown sound player
}) => {
  // Platform-agnostic music state
  const [track, setTrack] = useState(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [musicProgress, setMusicProgress] = useState(0);
  const [isShuffled, setIsShuffled] = useState(false);
  const [isRestShuffled, setIsRestShuffled] = useState(false);
  const [isRepeating, setIsRepeating] = useState(false);
  const [currentPlayingPlatform, setCurrentPlayingPlatform] = useState(null);

  const playlistStartedRef = useRef(false);
  const originalVolumeRef = useRef(null);

  // Token resolution + auto-clear of the displayed track when the user
  // disconnects the active platform.
  const handlePlatformDisconnect = useCallback(() => setTrack(null), []);
  const { accessToken, setAccessToken } = usePlatformAccessToken({
    selectedPlatform,
    connectedPlatforms,
    onDisconnect: handlePlatformDisconnect,
  });

  // Mirror playback state into refs so handlePhaseChange can read the latest
  // value without listing them in its dependency array. Listing them would
  // re-create handlePhaseChange every time playback flips, which in turn
  // would re-run effects in HomeScreen on every tick.
  const isMusicPlayingRef = useRef(false);
  const currentPlayingPlatformRef = useRef(null);
  useEffect(() => {
    isMusicPlayingRef.current = isMusicPlaying;
  }, [isMusicPlaying]);
  useEffect(() => {
    currentPlayingPlatformRef.current = currentPlayingPlatform;
  }, [currentPlayingPlatform]);

  const { detectPlatformFromSource, isPlatformReady } = usePlatformDetection({ connectedPlatforms });

  // Fetch Playback Status (Platform Agnostic)
  const fetchPlayback = useCallback(async () => {
    const platformToUse = currentPlayingPlatform || selectedPlatform;
    const playerToUse = services?.[platformToUse] || musicPlayer;
    const tokenToUse = platformToUse === 'device' 
      ? 'device' 
      : connectedPlatforms?.[platformToUse]?.accessToken || accessToken;
    
    if (!playerToUse || !platformToUse) return;
    if (platformToUse !== 'device' && !tokenToUse) return;
    
    const refreshCallback = refreshToken && platformToUse !== 'device' 
      ? () => refreshToken(platformToUse) 
      : null;
    const playback = await playerToUse.getCurrentPlayback(tokenToUse, refreshCallback);
    
    if (playback && playback.item) {
        const progressMs = playback.progress_ms || playback.progressMs || 0;
        const item = playback.item;
        const durationMs = item.duration_ms || item.durationMs || 0;
        
        const currentTrackId = track?.title + track?.artist;
        const newTrackId = (item.name || item.title) + (item.artists?.[0]?.name || item.artist);
        
        setTrack({
            title: item.name || item.title || 'Unknown Track',
            artist: item.artists?.[0]?.name || item.artist || 'Unknown Artist',
            album: item.album?.name || item.album || 'Unknown Album',
            duration: Math.floor(durationMs / 1000),
            coverUrl: item.album?.images?.[0]?.url || item.image || item.coverUrl || null,
        });
        
        if (currentTrackId !== newTrackId) {
          setMusicProgress(0);
        } else {
          setMusicProgress(Math.floor(progressMs / 1000));
        }
        
        setIsMusicPlaying(playback.is_playing ?? playback.isPlaying ?? false);
    } else if (!playback && !track) {
      setMusicProgress(0);
      setIsMusicPlaying(false);
    }
  }, [accessToken, musicPlayer, refreshToken, selectedPlatform, track, currentPlayingPlatform, services, connectedPlatforms]);

  // Smooth interpolation between platform polls; the timer advances
  // `musicProgress` once per second while music is playing.
  useMusicProgressTimer({
    isMusicPlaying,
    trackDurationSec: track?.duration || 0,
    onTick: setMusicProgress,
  });

  // Main Phase Change Logic - Platform Agnostic
  // 
  // IMPORTANT: Each music source (work/rest/beforeStart, song/playlist) can come from ANY platform
  // Examples:
  //   - beforeStart = Spotify track (countdown sound)
  //   - Round 1: work = Spotify playlist, rest = Device file
  //   - Round 2: work = Device file, rest = Spotify track
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

      // Special handling for beforeStart phase - uses countdown sound
      if (phase === 'beforeStart') {
        const countdownSound = routine.countdownBeforeStartSound;
        console.log('🔊 beforeStart phase - countdownSound object:', JSON.stringify(countdownSound, null, 2));
        if (countdownSound && countdownSound.uri) {
          musicSource = countdownSound;
          sourceType = 'countdownSound';
          detectedPlatform = countdownSound.platform || detectPlatformFromSource(countdownSound, routine) || selectedPlatform || 'device';
          console.log('🔊 beforeStart phase - using countdown sound:', countdownSound.name, 'platform:', detectedPlatform);
        } else {
          console.log('🔊 beforeStart phase - no countdown sound configured');
          return false;
        }
      }

      // Check for round-level song (work/rest only)
      if (!musicSource && (phase === 'work' || phase === 'rest')) {
        const roundSong = phase === 'work' ? roundData?.workSong : roundData?.restSong;
        if (roundSong) {
          musicSource = roundSong;
          sourceType = 'roundSong';
          detectedPlatform = detectPlatformFromSource(roundSong, routine) || selectedPlatform || 'device';
        }
      }
      
      // Check for round-level playlist (work/rest only)
      if (!musicSource && (phase === 'work' || phase === 'rest')) {
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
      
      // Check for routine-level playlist (work/rest only)
      if (!musicSource && (phase === 'work' || phase === 'rest')) {
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

      // *** ALWAYS stop currently playing music before starting new music ***
      // Read from refs so we always see the latest playback state without
      // adding it to deps (which would invalidate this callback every tick).
      const playingPlatform = currentPlayingPlatformRef.current;
      if (isMusicPlayingRef.current && playingPlatform) {
        console.log(`🔄 Stopping current music on ${playingPlatform} before starting new music`);
        try {
          if (playingPlatform === 'voices') {
            await countdownSoundPlayer?.stop();
          } else if (playingPlatform === 'device') {
            await services?.device?.pause('device');
          } else {
            const token = connectedPlatforms?.[playingPlatform]?.accessToken;
            await services?.[playingPlatform]?.pause(token);
          }
        } catch (e) {
          console.log('⚠️ Error stopping current music:', e);
        }
      }

      // Special handling for "voices" platform - uses built-in countdown sound player
      if (detectedPlatform === 'voices' || musicSource.uri?.startsWith('voices://')) {
        console.log('🔊 Playing built-in voice sound:', musicSource.name);
        
        if (countdownSoundPlayer) {
          await countdownSoundPlayer.play(musicSource.uri);
        }
        
        // Set track for display
        const voiceName = musicSource.name || 'Countdown';
        setTrack({
          name: voiceName,
          title: voiceName,
          artist: 'Countdown Sound',
          image: musicSource.image || null,
          coverUrl: musicSource.image || null,
          uri: musicSource.uri,
          duration: musicSource.duration || 0,
        });
        setIsMusicPlaying(true);
        setCurrentPlayingPlatform('voices');
        return true;
      }

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
      const platformAccessToken = detectedPlatform === 'device' 
        ? 'device' 
        : connectedPlatforms?.[detectedPlatform]?.accessToken;
      
      if (!platformAccessToken && detectedPlatform !== 'device') {
        console.warn(`No access token for platform ${detectedPlatform}`);
        return false;
      }

      // Create refresh callback for this platform
      const refreshCallback = refreshToken && detectedPlatform !== 'device' 
        ? () => refreshToken(detectedPlatform) 
        : null;

      try {
        const deviceId = detectedPlatform === 'device' 
          ? 'device' 
          : await platformMusicPlayer.getActiveDevice(platformAccessToken, refreshCallback);
        
        if (!deviceId && detectedPlatform !== 'device') {
          console.warn('No active music device found for phase change');
          return false;
        }

        let playbackTriggered = false;

        // Handle countdown sound (beforeStart phase) for streaming platforms
        if (sourceType === 'countdownSound' && musicSource.uri) {
          console.log('🔊 Playing countdown sound from platform:', musicSource.name);
          
            // For platform tracks (Spotify, etc.), play normally
            if (detectedPlatform === 'device' && platformMusicPlayer.setTrackMetadata && musicSource) {
              platformMusicPlayer.setTrackMetadata({
                name: musicSource.name || musicSource.title,
                artist: musicSource.artist || 'Countdown',
                album: musicSource.album,
                image: musicSource.image || musicSource.coverUrl,
              });
            }
            
            // Set track for display (important for preview!)
            // Use both name/title and image/coverUrl for compatibility
            const trackName = musicSource.name || musicSource.title || 'Countdown';
            const trackImage = musicSource.image || musicSource.coverUrl || null;
            // Check multiple duration formats
            const trackDuration = musicSource.duration_ms 
              ? Math.floor(musicSource.duration_ms / 1000) 
              : (musicSource.durationMs ? Math.floor(musicSource.durationMs / 1000) : (musicSource.duration || 0));
            const trackInfo = {
              name: trackName,
              title: trackName, // MusicPlayerPreview uses title
              artist: musicSource.artist || 'Countdown Sound',
              image: trackImage,
              coverUrl: trackImage, // MusicPlayerPreview uses coverUrl
              uri: musicSource.uri,
              duration: trackDuration,
            };
            console.log('🎵 Setting track for beforeStart:', JSON.stringify(trackInfo));
            setTrack(trackInfo);
            
            const result = await platformMusicPlayer.playTrack(platformAccessToken, musicSource.uri, deviceId);
            playbackTriggered = result?.success !== false;
            
            if (playbackTriggered) {
              setIsMusicPlaying(true);
              setCurrentPlayingPlatform(detectedPlatform);
            }
        } else if (sourceType === 'roundPlaylist' && musicSource.id) {
          const shuffleState = phase === 'work' ? isShuffled : isRestShuffled;
          const response = await platformMusicPlayer.playPlaylist(
            platformAccessToken,
            musicSource.id,
            deviceId,
            shuffleState,
          );
          if (response?.notSupported) {
            console.warn(`⚠️ ${detectedPlatform} platform does not support playlist playback; skipping audio for this round.`);
          } else if (response && response.success) {
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
            if (response?.notSupported) {
              console.warn(`⚠️ ${detectedPlatform} platform does not support playlist playback; routine playlist will not play on this platform.`);
            } else if (response && response.success && routine.shuffleMode) {
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
        // But NOT for beforeStart - we already set the track above
        if (playbackTriggered && phase !== 'beforeStart') {
          setMusicProgress(0);
          // Don't reset track - let fetchPlayback update it naturally
          // setTrack(null) was causing track to disappear before fetchPlayback could update
          setIsMusicPlaying(true); // Start timer immediately
          setCurrentPlayingPlatform(detectedPlatform);
        }

        // Update accessToken state if platform changed
        // But NOT for beforeStart - don't fetch playback during countdown
        if (detectedPlatform === selectedPlatform && playbackTriggered && phase !== 'beforeStart') {
          fetchPlayback(); // No delay - immediate fetch
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
    countdownSoundPlayer,
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
      fetchPlayback(); // No delay - immediate fetch
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
      fetchPlayback(); // No delay - immediate fetch
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

  // Multi-platform pause/cleanup is delegated to the dedicated hook so this
  // file stays focused on orchestration. Local audio-controller state is
  // reset here on top of the shared stop flow.
  const stopAll = useStopAllMusic({ services, connectedPlatforms, refreshToken, countdownSoundPlayer });
  const stopMusic = useCallback(async () => {
    await stopAll();
    setIsMusicPlaying(false);
    setTrack(null);
    setMusicProgress(0);
    setCurrentPlayingPlatform(null);
    playlistStartedRef.current = false;
    originalVolumeRef.current = null;
  }, [stopAll]);

  // Set volume (0-100)
  const setVolume = useCallback(async (volumePercent) => {
      if (!musicPlayer || !selectedPlatform) return;
      if (selectedPlatform !== 'device' && !accessToken) return;
      if (volumePercent < 0 || volumePercent > 100) return;
      
      if (musicPlayer.setVolume) {
        await musicPlayer.setVolume(accessToken || 'device', volumePercent);
      }
  }, [musicPlayer, selectedPlatform, accessToken]);

  // Apply rest volume when entering rest phase
  // TODO: Implement device volume control when using development build
  const applyRestVolume = useCallback(async (restVolumePercent) => {
    console.log('🔈 applyRestVolume called:', restVolumePercent);
    
    if (restVolumePercent === undefined || restVolumePercent === 100) {
      console.log('🔈 Volume is 100 or undefined, skipping');
      return;
    }
    
    // Store the target volume for when we implement device volume control
    originalVolumeRef.current = { targetRestVolume: restVolumePercent };
    console.log('🔈 Rest volume target set to:', restVolumePercent, '% (device volume control requires dev build)');
  }, []);

  // Reset volume to original when entering work phase
  const resetVolume = useCallback(async () => {
    console.log('🔈 resetVolume called');
    
    if (originalVolumeRef.current !== null) {
      console.log('🔈 Volume would be restored (device volume control requires dev build)');
      originalVolumeRef.current = null;
    }
  }, []);

  // Play sound alert - supports built-in voices and Spotify for beforeStart
  const playCountdownSound = useCallback(async (soundType) => {
    console.log('🔊 playCountdownSound called:', soundType);
    
    if (!selectedRoutine) {
      console.log('🔊 No selectedRoutine, skipping');
      return;
    }
    
    // Get the sound for this type from routine settings
    // Note: beforeStart is now handled by handlePhaseChange, not here
    let sound = null;
    switch (soundType) {
      case 'beforeStart':
        // beforeStart is handled by handlePhaseChange as a "round"
        // This is kept for backward compatibility
        sound = selectedRoutine.countdownBeforeStartSound;
        break;
      case 'endWork':
        sound = selectedRoutine.endWorkSound;
        break;
      case 'endRest':
        sound = selectedRoutine.endRestSound;
        break;
      default:
        console.log('🔊 Unknown soundType:', soundType);
        return;
    }
    
    if (!sound || !sound.uri) {
      console.log('🔊 No sound or uri for', soundType);
      return;
    }
    
    console.log('🔊 Playing sound:', sound.name, 'platform:', sound.platform, 'uri:', sound.uri);
    
    try {
      const platform = sound.platform;
      
      // Built-in voices - use countdown sound player
      if (platform === 'voices' || sound.uri.startsWith('voices://')) {
        if (countdownSoundPlayer) {
          await countdownSoundPlayer.play(sound.uri);
        }
        return;
      }
      
      // Device/local files - use countdown sound player
      if (platform === 'device' || sound.uri.startsWith('file://')) {
        if (countdownSoundPlayer) {
          await countdownSoundPlayer.play(sound.uri);
        }
        return;
      }
      
      // Streaming platforms (Spotify, Apple Music, etc.) - only for beforeStart
      // (other sound types would interrupt current playback)
      if (soundType === 'beforeStart' && platform && services?.[platform]) {
        const platformService = services[platform];
        const token = connectedPlatforms?.[platform]?.accessToken;
        
        if (platformService && token) {
          try {
            const deviceId = await platformService.getActiveDevice?.(token, () => refreshToken?.(platform));
            if (deviceId && platformService.playTrack) {
              await platformService.playTrack(token, sound.uri, deviceId);
            }
          } catch (err) {
            console.error(`🔊 ${platform} playback failed:`, err);
          }
        }
        return;
      }
      
      // Fallback for unknown platforms during workout
      if (countdownSoundPlayer) {
        await countdownSoundPlayer.play('voices://beep_short');
      }
    } catch (error) {
      console.error('🔊 Error playing sound:', error);
    }
  }, [selectedRoutine, countdownSoundPlayer, services, connectedPlatforms, refreshToken]);

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
      pauseMusic, // ✅ Explicit pause (no state checking)
      resumeMusic, // ✅ Explicit resume (no state checking)
      skipNext,
      skipPrevious,
      toggleShuffle,
      toggleRepeat,
      stopMusic, // ✅ Complete music stop with cleanup
      setVolume, // ✅ Volume control
      applyRestVolume, // ✅ Apply rest volume (for rest phases)
      resetVolume, // ✅ Reset volume to 100% (for work phases)
      playCountdownSound, // ✅ Play countdown sound
      setRestShuffled: setIsRestShuffled,
      setIsMusicPlaying // manual override if needed
  };
};

