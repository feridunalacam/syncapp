import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';
import { formatTime } from '../../../utils/timeFormatters';

const FALLBACK_TRACK = {
  title: 'Ready to play',
  artist: 'No music selected',
  album: 'Sync App',
  duration: 0,
  coverUrl: 'https://via.placeholder.com/85/1f2937/ffffff?text=Music',
};

export const MusicPlayerPreview = ({ 
  track, 
  musicProgress = 0, 
  selectedRoutine, 
  currentRound, 
  currentPhase,
  isWorkoutRunning = false,
  isPaused = false,
}) => {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  
  // Smooth progress animation
  const [smoothProgress, setSmoothProgress] = useState(0);
  const lastProgressRef = useRef(0);
  const progressStartTimeRef = useRef(null);
  const rafIdRef = useRef(null);

  const displayTrack = useMemo(() => {
    if (track) return track;

    if (selectedRoutine && currentRound && currentPhase) {
      const roundData = selectedRoutine.roundsData?.[currentRound - 1];
      if (!roundData) return FALLBACK_TRACK;

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
    }

    return FALLBACK_TRACK;
  }, [track, selectedRoutine, currentRound, currentPhase]);

  const duration = displayTrack.duration || 0;
  const coverUrl = displayTrack.coverUrl || 'https://via.placeholder.com/85/1f2937/ffffff?text=Music';

  // Smooth progress animation using requestAnimationFrame
  useEffect(() => {
    // When musicProgress changes (from API), sync and start smooth animation
    const now = Date.now();
    
    // If progress jumped backward or to a very different value, reset immediately
    if (Math.abs(musicProgress - lastProgressRef.current) > 2) {
      setSmoothProgress(musicProgress);
      lastProgressRef.current = musicProgress;
      progressStartTimeRef.current = now;
    } else if (musicProgress !== lastProgressRef.current) {
      // Normal progress update - sync to API value
      lastProgressRef.current = musicProgress;
      progressStartTimeRef.current = now;
    }

    // Cancel any existing animation
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
    }

    // Don't animate if paused or not running
    if (isPaused || !isWorkoutRunning || duration <= 0) {
      setSmoothProgress(musicProgress);
      return;
    }

    const animate = () => {
      if (!progressStartTimeRef.current) {
        progressStartTimeRef.current = Date.now();
      }

      const elapsed = (Date.now() - progressStartTimeRef.current) / 1000;
      const newProgress = lastProgressRef.current + elapsed;
      
      // Don't exceed duration
      if (newProgress <= duration) {
        setSmoothProgress(newProgress);
        rafIdRef.current = requestAnimationFrame(animate);
      } else {
        setSmoothProgress(duration);
      }
    };

    rafIdRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [musicProgress, isPaused, isWorkoutRunning, duration]);

  // Progress bar percentage using smooth progress
  const percentage = duration > 0 ? Math.min(100, (smoothProgress / duration) * 100) : 0;

  const formatTimeDisplay = (seconds) => {
    if (!seconds || seconds < 0) return '0:00';
    return formatTime(Math.floor(seconds));
  };

  return (
    <View style={styles.musicPlayer}>
      <View style={styles.musicAlbumArt}>
        <Image
          source={{ uri: coverUrl }}
          style={{ width: '100%', height: '100%', borderRadius: 14 }}
          resizeMode="cover"
        />
      </View>
      <View style={styles.musicTrackInfo}>
        <Text style={styles.musicTrackTitle} numberOfLines={1}>{displayTrack.title}</Text>
        <Text style={styles.musicTrackArtist} numberOfLines={1}>{displayTrack.artist}</Text>
        <Text style={styles.musicTrackAlbum} numberOfLines={1}>{displayTrack.album}</Text>
        <View style={styles.musicProgressBar}>
          <View style={[styles.musicProgressFill, { width: `${percentage}%` }]} />
        </View>
        <View style={styles.musicTimeInfo}>
          <Text style={styles.musicTimeText}>{formatTimeDisplay(smoothProgress)}</Text>
          <Text style={styles.musicTimeText}>{formatTimeDisplay(duration)}</Text>
        </View>
      </View>
    </View>
  );
};

const createStyles = (theme) => StyleSheet.create({
  musicPlayer: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: theme.spacing.lg,
    marginTop: 12,
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
    overflow: 'hidden',
  },
  musicProgressFill: {
    height: '100%',
    backgroundColor: theme.success,
    borderRadius: 2,
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
