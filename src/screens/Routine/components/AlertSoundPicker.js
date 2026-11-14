import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Sheet from '../../../components/common/Sheet';
import { useTheme } from '../../../context/ThemeContext';
import { resolveAlertSound } from '../../../domain/alerts';

const cue = (id, name, duration) => ({
  id,
  name,
  uri: `voices://${id}`,
  type: 'voice',
  platform: 'voices',
  duration,
});
const OPTIONS = [
  { id: 'none', name: 'None', sound: null, icon: 'volume-mute-outline' },
  ...[
    cue('cue_gong', 'Gong', 1.85),
    cue('cue_boxing_bell', 'Boxing bell', 1),
    cue('cue_tick', 'Beep', 0.1),
    cue('cue_chime', 'Chime', 0.65),
  ].map((sound) => ({
    id: sound.id,
    name: sound.name,
    sound,
    icon: sound.id === 'cue_tick' ? 'pulse-outline' : 'notifications-outline',
  })),
];

export default function AlertSoundPicker({
  visible,
  title,
  selected,
  onClose,
  onSelect,
  onCustom,
}) {
  const { theme } = useTheme();
  const currentSound = resolveAlertSound(selected);
  const custom = currentSound && !OPTIONS.some(({ sound }) => sound?.uri === currentSound.uri);
  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
        {custom && (
          <View style={[styles.custom, { backgroundColor: theme.cardSecondary }]}>
            <Ionicons name="musical-note-outline" size={19} color={theme.textSecondary} />
            <View style={{ flex: 1 }}>
              <Text
                numberOfLines={1}
                style={{ color: theme.text, fontSize: 13, fontWeight: '500' }}
              >
                {currentSound.name || 'Custom sound'}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 3 }}>
                Current sound
              </Text>
            </View>
            <Ionicons name="checkmark" size={19} color={theme.accent} />
          </View>
        )}
        {OPTIONS.map((option) => {
          const active = option.sound ? currentSound?.uri === option.sound.uri : !currentSound;
          return (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.sound)}
              accessibilityRole="button"
              accessibilityLabel={`Use ${option.name.toLowerCase()}`}
              accessibilityState={{ selected: active }}
              style={[styles.option, { borderColor: theme.border }]}
            >
              <Ionicons
                name={option.icon}
                size={19}
                color={active ? theme.accent : theme.textSecondary}
              />
              <Text
                style={{
                  flex: 1,
                  color: active ? theme.accent : theme.text,
                  fontSize: 14,
                  fontWeight: active ? '600' : '400',
                }}
              >
                {option.name}
              </Text>
              {option.detail && (
                <Text style={{ color: theme.textSecondary, fontSize: 10 }}>{option.detail}</Text>
              )}
              {active && <Ionicons name="checkmark" size={19} color={theme.accent} />}
            </Pressable>
          );
        })}
        <Pressable
          onPress={onCustom}
          accessibilityRole="button"
          accessibilityLabel="Choose a custom alert sound"
          style={[styles.import, { backgroundColor: theme.cardSecondary }]}
        >
          <Ionicons name="add" size={20} color={theme.accent} />
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '500' }}>
            Choose a custom sound
          </Text>
          <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
  },
  custom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: 14,
    marginBottom: 8,
  },
  import: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    marginTop: 14,
    paddingHorizontal: 12,
  },
});
