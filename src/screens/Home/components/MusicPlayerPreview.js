import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PlaybackProgress from './PlaybackProgress';
import { useTheme } from '../../../context/ThemeContext';
import MusicArtwork from '../../../components/common/MusicArtwork';
import { resolveRoundAudio } from '../../../domain/audio';

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
  const selection = resolveRoundAudio(
    selectedRoutine,
    currentPhase === 'beforeStart' || currentPhase === 'rest' ? currentPhase : 'work',
    currentRound || 1,
    selectedRoutine?.platform,
  );
  const song = selection?.source;
  const name = track?.title || song?.name || song?.title;
  const artist = track?.artist || song?.artist;
  const duration = track?.duration || song?.duration || 0;
  return (
    <View style={styles.row}>
      <MusicArtwork
        item={track}
        fallbackItem={song}
        size={46}
        icon={selection?.kind === 'playlist' ? 'albums-outline' : 'musical-notes-outline'}
        iconColor={theme.textSecondary}
      />
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
});
