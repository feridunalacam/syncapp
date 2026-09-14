import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { normalizeRoutine } from '../../domain/routines';

// A compact preview of actual work/rest proportions; never invents activity data.
export default function IntervalPreview({ routine, height = 20 }) {
  const { theme } = useTheme();
  const normalized = normalizeRoutine(routine);
  return (
    <View
      accessibilityLabel={`${normalized.rounds} rounds`}
      style={[styles.track, { height, gap: normalized.rounds > 20 ? 1 : 3 }]}
    >
      {normalized.roundsData.map((round, index) => (
        <React.Fragment key={index}>
          <View
            style={{
              flex: round.workSec,
              minWidth: 0.5,
              height: '100%',
              borderRadius: 3,
              backgroundColor: theme.accent,
              opacity: 0.85,
            }}
          />
          {index < normalized.rounds - 1 && round.restSec > 0 && (
            <View
              style={{
                flex: round.restSec,
                minWidth: 0.5,
                height: '100%',
                borderRadius: 3,
                backgroundColor: theme.textSecondary,
                opacity: 0.25,
              }}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  track: { flexDirection: 'row', gap: 3, overflow: 'hidden', alignItems: 'center' },
});
