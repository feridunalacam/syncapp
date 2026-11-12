import React, { useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ScrollView } from 'react-native';
import * as Linking from 'expo-linking';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { useWorkout } from '../../context/WorkoutContext';
import { useAppleMusicConnection } from '../../context/AppleMusicConnectionContext';
import { MUSIC_PROVIDERS, resolveMusicLink } from '../../services/music/providers';
import Sheet from './Sheet';

export default function MusicServicesPanel() {
  const { theme } = useTheme();
  const workout = useWorkout();
  const apple = useAppleMusicConnection();
  const [visible, setVisible] = useState(false);
  const [link, setLink] = useState('');
  const [error, setError] = useState(null);
  const [opening, setOpening] = useState(false);
  const lock = useRef(false);
  const busy = workout?.isWorkoutRunning || workout?.isMusicPlaying || workout?.isAudioSyncing;
  const open = async (id, input = '') => {
    if (lock.current) return;
    const resolved = resolveMusicLink(input, id);
    if (!resolved) {
      setError('Paste an HTTPS song or playlist link from one of the services below.');
      return;
    }
    lock.current = true;
    setOpening(true);
    setError(null);
    try {
      if (apple.player?.isActive?.()) {
        const cleared = await apple.player.clear();
        if (cleared?.success === false) throw new Error(cleared.error);
      }
      await Linking.openURL(resolved.url);
    } catch {
      setError(`${resolved.provider.name} could not be opened. Please try again.`);
    } finally {
      lock.current = false;
      setOpening(false);
    }
  };
  const row = (provider, detail, action, label, disabled = false) => (
    <Pressable
      key={provider.id}
      onPress={action}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${provider.name}`}
      accessibilityState={{ disabled }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 68,
        paddingVertical: 12,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Ionicons name={provider.icon} size={22} color={provider.color} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 15, fontWeight: '500' }}>{provider.name}</Text>
        <Text style={{ color: theme.textSecondary, fontSize: 11, lineHeight: 17, marginTop: 4 }}>
          {detail}
        </Text>
      </View>
      <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View>
      {row(
        MUSIC_PROVIDERS.appleMusic,
        apple.companionAvailable
          ? apple.connected
            ? 'Choose songs and playlists. Music plays independently of your timer.'
            : 'Open the player to connect. Apple Music subscription required.'
          : busy
            ? 'Finish your session before changing music connections.'
            : apple.available
              ? apple.connected
                ? 'Connected · songs and playlists for each round'
                : 'Songs and playlists · Apple Music subscription required'
              : 'Opens Apple Music. Playback stays in Apple Music.',
        apple.companionAvailable
          ? apple.player.open
          : apple.available
            ? apple.connected
              ? apple.disconnect
              : apple.connect
            : () => open('appleMusic'),
        apple.companionAvailable
          ? 'Open player'
          : apple.available
            ? apple.connecting
              ? 'Connecting…'
              : apple.connected
                ? 'Disconnect'
                : 'Connect'
            : 'Open',
        (!apple.companionAvailable && !!busy) || opening || (apple.available && !apple.ready),
      )}
      {!!apple.error && (
        <Text
          accessibilityRole="alert"
          style={{ color: theme.danger || theme.textSecondary, fontSize: 12, lineHeight: 18 }}
        >
          {apple.error}
        </Text>
      )}
      <Pressable
        onPress={() => {
          setError(null);
          setVisible(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Open other music services"
        style={{ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <Ionicons name="headset-outline" size={22} color={theme.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text, fontSize: 15, fontWeight: '500' }}>
            Other music apps
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4 }}>
            YouTube Music, TIDAL, SoundCloud and more
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </Pressable>
      {!visible && !!error && (
        <Text accessibilityRole="alert" style={{ color: theme.textSecondary, fontSize: 12 }}>
          {error}
        </Text>
      )}
      <Sheet visible={visible} title="Music apps" onClose={() => setVisible(false)}>
        <ScrollView keyboardShouldPersistTaps="handled">
          <Text
            style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 14 }}
          >
            Open a music app or a shared song or playlist link. These services play in their own
            app; Sync cannot switch their songs at each interval.
          </Text>
          <TextInput
            value={link}
            onChangeText={setLink}
            placeholder="Paste a song or playlist link"
            accessibilityLabel="Music service link"
            placeholderTextColor={theme.textSecondary}
            keyboardType="url"
            autoCorrect={false}
            autoCapitalize="none"
            maxLength={2048}
            style={{
              color: theme.text,
              backgroundColor: theme.cardSecondary,
              borderRadius: 12,
              padding: 14,
            }}
          />
          <Pressable
            onPress={() => open(null, link)}
            disabled={opening || !link.trim()}
            accessibilityRole="button"
            accessibilityLabel="Open music link"
            style={{
              minHeight: 44,
              justifyContent: 'center',
              opacity: opening || !link.trim() ? 0.4 : 1,
            }}
          >
            <Text style={{ color: theme.accent, fontWeight: '600' }}>
              {opening ? 'Opening…' : 'Open link'}
            </Text>
          </Pressable>
          {!!error && (
            <Text accessibilityRole="alert" style={{ color: theme.textSecondary, fontSize: 12 }}>
              {error}
            </Text>
          )}
          {Object.values(MUSIC_PROVIDERS)
            .filter((provider) => provider.mode === 'external')
            .map((provider) =>
              row(provider, 'Plays in its own app', () => open(provider.id), 'Open', opening),
            )}
        </ScrollView>
      </Sheet>
    </View>
  );
}
