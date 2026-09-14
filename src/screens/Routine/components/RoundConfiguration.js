import Surface from '../../../components/common/Surface';
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { formatTime } from '../../../utils/timeFormatters';
import DurationField from './DurationField';

export const RoundConfiguration = ({
  workSec,
  restSec,
  onWorkSecChange,
  onRestSecChange,
  numberOfRounds,
  onRoundsChange,
  totalDurationSec,
}) => {
  const { theme } = useTheme();
  return (
    <Surface
      variant="card"
      style={[styles.card, { backgroundColor: 'transparent', borderWidth: 0 }]}
    >
      <View style={styles.header}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>Timing</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
          Total{' '}
          <Text style={{ color: theme.accent, fontWeight: '600' }}>
            {formatTime(totalDurationSec || 0)}
          </Text>
        </Text>
      </View>
      <View style={styles.fields}>
        <DurationField label="Work" value={workSec} onChange={onWorkSecChange} minimum={1} />
        <DurationField label="Rest" value={restSec} onChange={onRestSecChange} />
      </View>
      <View style={[styles.rounds, { borderColor: theme.border }]}>
        <Text style={{ color: theme.text, fontSize: 14 }}>Rounds</Text>
        <View style={styles.stepper}>
          {[-1, 1].map((delta, index) => (
            <React.Fragment key={delta}>
              {index === 1 && (
                <Text
                  accessibilityLabel="Number of rounds"
                  style={{
                    color: theme.text,
                    fontWeight: '600',
                    fontSize: 19,
                    minWidth: 28,
                    textAlign: 'center',
                  }}
                >
                  {numberOfRounds}
                </Text>
              )}
              <Pressable
                onPress={() => onRoundsChange(Math.min(50, Math.max(1, numberOfRounds + delta)))}
                disabled={delta === -1 ? numberOfRounds <= 1 : numberOfRounds >= 50}
                accessibilityLabel={delta === -1 ? 'Remove a round' : 'Add a round'}
                style={[styles.step, { backgroundColor: theme.cardSecondary }]}
              >
                <Ionicons name={delta === -1 ? 'remove' : 'add'} size={18} color={theme.accent} />
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      </View>
    </Surface>
  );
};
const styles = StyleSheet.create({
  card: { paddingVertical: 4, marginBottom: 18 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  fields: { flexDirection: 'row', gap: 10 },
  rounds: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    paddingTop: 12,
  },
  stepper: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  step: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
