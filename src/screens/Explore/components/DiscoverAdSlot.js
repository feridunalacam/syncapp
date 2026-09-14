import Surface from '../../../components/common/Surface';
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';

// Reserved placement only. AdMob can replace this interior later.
export default function DiscoverAdSlot() {
  const { theme } = useTheme();
  return (
    <Surface
      variant="card"
      accessibilityLabel="Advertisement placeholder"
      style={[styles.container, { borderColor: theme.border, backgroundColor: 'transparent' }]}
    >
      <View style={styles.icon}>
        <Ionicons name="megaphone-outline" size={17} color={theme.textTertiary} />
      </View>
      <Text style={{ flex: 1, color: theme.textTertiary, fontSize: 12 }}>Advertisement</Text>
      <View style={[styles.badge, { borderColor: theme.border }]}>
        <Text style={{ color: theme.textTertiary, fontSize: 9 }}>Ad</Text>
      </View>
    </Surface>
  );
}
const styles = StyleSheet.create({
  container: {
    minHeight: 56,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  icon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
});
