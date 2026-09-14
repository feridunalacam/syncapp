import Surface from '../../../components/common/Surface';
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import Sheet from '../../../components/common/Sheet';
import { formatTime } from '../../../utils/timeFormatters';

export default function DurationField({ label, value, onChange, minimum = 0, compact = false }) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [minutes, setMinutes] = useState('0');
  const [seconds, setSeconds] = useState('0');
  const open = () => {
    const n = Number(value) || 0;
    setMinutes(String(Math.floor(n / 60)));
    setSeconds(String(n % 60));
    setVisible(true);
  };
  const apply = () => {
    onChange(String(Math.max(minimum, (Number(minutes) || 0) * 60 + (Number(seconds) || 0))));
    setVisible(false);
  };
  return (
    <>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatTime(Number(value) || 0)}`}
        style={[compact ? styles.compact : styles.field, { backgroundColor: theme.cardSecondary }]}
      >
        {!compact && (
          <Text style={{ color: theme.textSecondary, fontSize: 11, marginBottom: 8 }}>{label}</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            style={{
              color: theme.text,
              fontSize: compact ? 16 : 27,
              fontWeight: '600',
              fontVariant: ['tabular-nums'],
              letterSpacing: -0.6,
            }}
          >
            {formatTime(Number(value) || 0)}
          </Text>
          <Ionicons name="chevron-down" size={12} color={theme.textSecondary} />
        </View>
      </Pressable>
      <Sheet visible={visible} title={label} onClose={() => setVisible(false)}>
        <View style={styles.inputs}>
          {[
            [minutes, setMinutes, 'Minutes'],
            [seconds, setSeconds, 'Seconds'],
          ].map(([text, setter, title]) => (
            <Surface
              variant="inset"
              key={title}
              style={[styles.inputCard, { backgroundColor: theme.cardSecondary }]}
            >
              <TextInput
                value={text}
                onChangeText={(v) => setter(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                maxLength={title === 'Minutes' ? 3 : 2}
                selectTextOnFocus
                accessibilityLabel={title}
                style={{
                  color: theme.text,
                  fontSize: 42,
                  fontWeight: '500',
                  textAlign: 'center',
                  padding: 12,
                }}
              />
              <Text style={{ color: theme.textSecondary, textAlign: 'center', fontSize: 12 }}>
                {title}
              </Text>
            </Surface>
          ))}
        </View>
        <Pressable
          onPress={apply}
          style={[styles.apply, { backgroundColor: theme.accent }]}
          accessibilityRole="button"
        >
          <Text style={{ color: theme.accentText, fontWeight: '700', fontSize: 15 }}>Apply</Text>
        </Pressable>
      </Sheet>
    </>
  );
}
const styles = StyleSheet.create({
  field: { flex: 1, padding: 13, borderRadius: 17 },
  compact: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12 },
  inputs: { flexDirection: 'row', gap: 12 },
  inputCard: { flex: 1, borderRadius: 20, paddingBottom: 18 },
  apply: { padding: 17, alignItems: 'center', borderRadius: 17, marginTop: 20 },
});
