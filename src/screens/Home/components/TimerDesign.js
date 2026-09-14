import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../context/ThemeContext';

export const TimerDesign = ({
  timeRemaining,
  currentPhase,
  currentRound,
  selectedRoutine,
  isWorkoutRunning,
  isPaused,
  progress = 0,
}) => {
  const { theme } = useTheme();
  const rest = currentPhase === 'rest';
  const color = rest ? theme.info : theme.accent;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = String(timeRemaining % 60).padStart(2, '0');
  const phase = isPaused
    ? 'Paused'
    : currentPhase === 'beforeStart'
      ? 'Get ready'
      : rest
        ? 'Rest'
        : 'Work';
  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <View style={[styles.badge, { backgroundColor: theme.accentLight }]}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>
            {isWorkoutRunning ? phase : 'Ready'}
          </Text>
        </View>
        <Text style={{ color: theme.textSecondary, fontSize: 12, fontVariant: ['tabular-nums'] }}>
          {currentRound} / {selectedRoutine?.rounds || 1} rounds
        </Text>
      </View>
      <Text
        accessibilityLabel={`Timer ${minutes}:${seconds}`}
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[styles.time, { color: theme.text }]}
      >
        {String(minutes).padStart(2, '0')}
        <Text style={{ color: theme.textTertiary }}>:</Text>
        {seconds}
      </Text>
      <View style={[styles.track, { backgroundColor: theme.border }]}>
        <View
          style={{
            height: '100%',
            width: `${Math.max(0, Math.min(1, 1 - progress)) * 100}%`,
            backgroundColor: color,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  time: {
    fontSize: 94,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    letterSpacing: -6,
    textAlign: 'center',
    marginVertical: 12,
  },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
});
