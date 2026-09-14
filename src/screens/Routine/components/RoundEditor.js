import Surface from '../../../components/common/Surface';
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import DurationField from './DurationField';

export const RoundEditor = ({
  roundNum,
  workSec,
  restSec,
  onWorkSecChange,
  onRestSecChange,
  workSong,
  restSong,
  workPlaylist,
  restPlaylist,
  onWorkMusicPress,
  onRestMusicPress,
  onRemoveWorkMusic,
  onRemoveRestMusic,
  onRemoveRound,
  isLast = false,
  canRemove = true,
}) => {
  const { theme } = useTheme();
  const phase = (label, time, onTime, song, playlist, onMusic, onRemove) => {
    const source = song || playlist;
    return (
      <View
        style={[
          styles.phase,
          label === 'Rest' && {
            borderLeftWidth: StyleSheet.hairlineWidth,
            borderLeftColor: theme.border,
            paddingLeft: 10,
          },
          label === 'Work' && !isLast && { paddingRight: 10 },
        ]}
      >
        <View style={styles.phaseHeader}>
          <Text
            style={{
              color: label === 'Work' ? theme.accent : theme.textSecondary,
              fontSize: 11,
              fontWeight: '600',
            }}
          >
            {label}
          </Text>
          <DurationField
            compact
            label={`Round ${roundNum} ${label.toLowerCase()}`}
            value={time}
            minimum={label === 'Work' ? 1 : 0}
            onChange={onTime}
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            onPress={onMusic}
            accessibilityRole="button"
            accessibilityLabel={`Choose round ${roundNum} ${label.toLowerCase()} audio`}
            style={styles.audioPress}
          >
            {!source && <Ionicons name="add" size={16} color={theme.textSecondary} />}
            <Text
              numberOfLines={2}
              style={{
                flex: 1,
                color: source ? theme.text : theme.textSecondary,
                fontSize: 11,
                lineHeight: 15,
              }}
            >
              {source?.name || source?.title || 'Add audio'}
            </Text>
          </Pressable>
          {source && (
            <Pressable
              onPress={onRemove}
              accessibilityRole="button"
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              accessibilityLabel={`Remove round ${roundNum} ${label.toLowerCase()} audio`}
            >
              <Ionicons name="close" size={15} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>
    );
  };
  return (
    <Surface
      variant="card"
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
    >
      <View style={styles.header}>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '600' }}>
          Round {String(roundNum).padStart(2, '0')}
        </Text>
        <Pressable
          onPress={onRemoveRound}
          disabled={!canRemove}
          accessibilityState={{ disabled: !canRemove }}
          accessibilityLabel={`Delete round ${roundNum}`}
          style={{
            width: 44,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: canRemove ? 1 : 0.3,
          }}
        >
          <Ionicons name="trash-outline" size={16} color={theme.textTertiary} />
        </Pressable>
      </View>
      <View style={[styles.phases, { borderColor: theme.border }]}>
        {phase(
          'Work',
          workSec,
          onWorkSecChange,
          workSong,
          workPlaylist,
          onWorkMusicPress,
          onRemoveWorkMusic,
        )}
        {!isLast &&
          phase(
            'Rest',
            restSec,
            onRestSecChange,
            restSong,
            restPlaylist,
            onRestMusicPress,
            onRemoveRestMusic,
          )}
      </View>
    </Surface>
  );
};
const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingBottom: 3,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phases: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  phase: { flex: 1, minWidth: 0 },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  audioPress: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
