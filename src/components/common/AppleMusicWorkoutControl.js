import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppleMusicConnection } from '../../context/AppleMusicConnectionContext';
import { useTheme } from '../../context/ThemeContext';
import { AppleMusicMiniPlayer } from './AppleMusicPlayerPanel';
import Surface from './Surface';

export default function AppleMusicWorkoutControl({ style }) {
  const apple = useAppleMusicConnection();
  const { theme } = useTheme();
  if (!apple.companionAvailable) return null;
  const player = apple.player || {};
  const hasQueue =
    player.ownsQueue || player.reserved || player.busy || player.previousOwnerPending;
  const canOpen = typeof player.open === 'function';
  return (
    <View style={style}>
      {hasQueue ? (
        <AppleMusicMiniPlayer />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose Apple Music songs and playlists"
          accessibilityHint="Opens the Apple Music player. Music starts only when you tap Play."
          accessibilityState={{ disabled: !canOpen }}
          disabled={!canOpen}
          onPress={canOpen ? player.open : undefined}
          style={{ opacity: canOpen ? 1 : 0.5 }}
        >
          <Surface variant="card" style={styles.card}>
            <View style={[styles.icon, { backgroundColor: theme.accentLight }]}>
              <Ionicons name="musical-notes" size={22} color={theme.accent} />
            </View>
            <View style={styles.metadata}>
              <Text style={[styles.title, { color: theme.text }]}>Apple Music</Text>
              <Text style={[styles.action, { color: theme.accent }]}>
                Choose songs and playlists
              </Text>
              <Text style={[styles.detail, { color: theme.textSecondary }]}>
                Plays independently of the timer. Tap Play in the player to start.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
          </Surface>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  metadata: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: '600' },
  action: { fontSize: 13, fontWeight: '600', marginTop: 5 },
  detail: { fontSize: 12, lineHeight: 18, marginTop: 4 },
});
