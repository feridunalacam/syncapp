import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import PlaybackProgress from './PlaybackProgress';
import { useTheme } from '../../../context/ThemeContext';

export const MusicPlayerPreview = ({
  track,
  musicProgress = 0,
  isMusicPlaying = false,
  isWorkoutRunning = false,
  selectedRoutine,
  currentRound,
  currentPhase,
}) => {
  const { theme } = useTheme();
  const round = selectedRoutine?.roundsData?.[currentRound - 1];
  const song = currentPhase === 'rest' ? round?.restSong : round?.workSong;
  const name = track?.title || song?.name || song?.title;
  const artist = track?.artist || song?.artist;
  const artwork = track?.coverUrl || song?.image;
  const duration = track?.duration || song?.duration || 0;
  return (
    <View style={styles.row}>
      <View style={[styles.artwork, { backgroundColor: theme.cardSecondary }]}>
        {artwork ? (
          <Image source={{ uri: artwork }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <Ionicons name="musical-notes-outline" size={22} color={theme.textSecondary} />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>
          {name || 'No music selected'}
        </Text>
        {artist && (
          <Text
            numberOfLines={1}
            style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}
          >
            {artist}
          </Text>
        )}
        {!name && (
          <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
            Add audio to this routine
          </Text>
        )}
        {duration > 0 && (
          <PlaybackProgress
            position={musicProgress}
            duration={duration}
            playing={isMusicPlaying}
            playbackKey={`${isWorkoutRunning}:${selectedRoutine?.id}:${currentRound}:${currentPhase}:${track?.id || song?.uri || name || ''}`}
          />
        )}
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  artwork: {
    width: 46,
    height: 46,
    borderRadius: 13,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
