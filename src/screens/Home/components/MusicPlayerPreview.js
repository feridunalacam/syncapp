import React, { useMemo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { formatTime } from '../../../utils/timeFormatters';

// Fallback track data when no music is selected
const FALLBACK_TRACK = {
  title: 'Ready to play',
  artist: 'No music selected',
  album: 'Sync App',
  duration: 0,
  coverUrl: 'https://via.placeholder.com/85/1f2937/ffffff?text=Music',
};

export const MusicPlayerPreview = ({ 
  track, 
  musicProgress, 
  selectedRoutine, 
  currentRound, 
  currentPhase
}) => {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  // Determine what should be displayed based on current round and phase
  const displayTrack = useMemo(() => {
    // Priority 1: If there's an actual track playing from the platform, use that
    if (track) {
      return track;
    }

    // Priority 2: If no track is playing, show what should be playing from the round configuration
    if (selectedRoutine && currentRound && currentPhase) {
      const roundData = selectedRoutine.roundsData?.[currentRound - 1];
      if (!roundData) {
        return FALLBACK_TRACK;
      }

      // Check for song in current phase
      const phaseSong = currentPhase === 'work' ? roundData.workSong : roundData.restSong;
      if (phaseSong) {
        return {
          title: phaseSong.name || phaseSong.title || 'Unknown Song',
          artist: phaseSong.artist || 'Unknown Artist',
          album: phaseSong.album || 'Unknown Album',
          duration: phaseSong.duration || 0,
          coverUrl: phaseSong.image || phaseSong.coverUrl || null,
        };
      }

      // Check for playlist in current phase
      const phasePlaylist = currentPhase === 'work' 
        ? (roundData.workPlaylistName ? { 
            name: roundData.workPlaylistName, 
            tracksCount: roundData.workPlaylistTracksCount || 0,
            image: roundData.workPlaylistImage || null,
          } : null)
        : (roundData.restPlaylistName ? { 
            name: roundData.restPlaylistName, 
            tracksCount: roundData.restPlaylistTracksCount || 0,
            image: roundData.restPlaylistImage || null,
          } : null);
      
      if (phasePlaylist) {
        return {
          title: phasePlaylist.name,
          artist: 'Playlist',
          album: `${phasePlaylist.tracksCount || 0} tracks`,
          duration: 0,
          coverUrl: phasePlaylist.image || null,
        };
      }

      // Check for global playlists
      if (currentPhase === 'work' && selectedRoutine.workoutPlaylistName) {
        return {
          title: selectedRoutine.workoutPlaylistName,
          artist: 'Work Playlist',
          album: 'Global',
          duration: 0,
          coverUrl: null,
        };
      }

      if (currentPhase === 'rest' && selectedRoutine.restPlaylistName) {
        return {
          title: selectedRoutine.restPlaylistName,
          artist: 'Rest Playlist',
          album: 'Global',
          duration: 0,
          coverUrl: null,
        };
      }
    }

    // Fallback
    return FALLBACK_TRACK;
  }, [track, selectedRoutine, currentRound, currentPhase]);

  const displayDuration = displayTrack.duration || 0;
  const displayCoverUrl = displayTrack.coverUrl || 'https://via.placeholder.com/85/1f2937/ffffff?text=Music';

  // Calculate progress percentage for the progress bar
  const progressPercentage = displayDuration > 0 
    ? Math.min(100, Math.max(0, (musicProgress / displayDuration) * 100))
    : 0;

  // Format time helper - handles edge cases
  const formatTimeDisplay = (seconds) => {
    if (!seconds || seconds < 0) return '0:00';
    return formatTime(seconds);
  };

  return (
    <View style={[styles.musicPlayer, { marginTop: 12, position: 'relative' }]}>
      <View style={styles.musicAlbumArt}>
        <Image
          source={{ uri: displayCoverUrl }}
          style={{ width: '100%', height: '100%', borderRadius: 14 }}
          resizeMode="cover"
          onError={() => {}}
        />
      </View>
      <View style={styles.musicTrackInfo}>
        <Text 
          style={[
            styles.musicTrackTitle,
            displayTrack.title === 'Ready to play' && styles.musicTrackTitleFallback
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >{displayTrack.title}</Text>
        <Text 
          style={styles.musicTrackArtist}
          numberOfLines={1}
          ellipsizeMode="tail"
        >{displayTrack.artist}</Text>
        <Text 
          style={styles.musicTrackAlbum}
          numberOfLines={1}
          ellipsizeMode="tail"
        >{displayTrack.album}</Text>
        <View style={styles.musicProgressBar}>
          <View style={[styles.musicProgressFill, { width: `${progressPercentage}%` }]} />
        </View>
        <View style={styles.musicTimeInfo}>
          <Text style={styles.musicTimeText}>{formatTimeDisplay(musicProgress)}</Text>
          <Text style={styles.musicTimeText}>{formatTimeDisplay(displayDuration)}</Text>
        </View>
      </View>
    </View>
  );
};

// Component-specific styles
const createStyles = (theme) => StyleSheet.create({
  musicPlayer: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing['2xl'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  musicAlbumArt: {
    width: 113,
    height: 113,
    borderRadius: 14,
    backgroundColor: theme.cardSecondary,
    overflow: 'hidden',
    ...theme.shadow.lg,
  },
  musicTrackInfo: {
    flex: 1,
  },
  musicTrackTitle: {
    fontSize: 19,
    fontWeight: theme.fontWeight.semibold,
    color: theme.text,
    marginBottom: theme.spacing.xs,
  },
  musicTrackTitleFallback: {
    color: theme.text,
  },
  musicTrackArtist: {
    fontSize: 17,
    color: theme.text,
    marginBottom: 2,
  },
  musicTrackAlbum: {
    fontSize: theme.fontSize.base,
    color: theme.text,
  },
  musicProgressBar: {
    height: 4,
    backgroundColor: theme.border,
    borderRadius: 2,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    width: '100%',
  },
  musicProgressFill: {
    height: '100%',
    backgroundColor: theme.success,
    borderRadius: 1.75,
    width: '0%',
  },
  musicTimeInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.xs,
  },
  musicTimeText: {
    fontSize: theme.fontSize.base,
    color: theme.textSecondary,
  },
});
