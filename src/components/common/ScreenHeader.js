import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import GlassSurface from './GlassSurface';
export default function ScreenHeader({ title, subtitle, icon = 'add', actionLabel, onAction }) {
  const { theme } = useTheme();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      </View>
      {onAction && (
        <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel}>
          <GlassSurface interactive style={styles.action}>
            <Ionicons name={icon} size={23} color={theme.accent} />
          </GlassSurface>
        </Pressable>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.9 },
  subtitle: { fontSize: 9, fontWeight: '700', letterSpacing: 1.8 },
  action: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
