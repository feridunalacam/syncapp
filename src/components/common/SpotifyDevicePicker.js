import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../context/ThemeContext';
import { usePlatformContext } from '../../context/PlatformContext';
import { canControlDevice } from '../../services/spotify/devices';
import Sheet from './Sheet';

export default function SpotifyDevicePicker() {
  const { theme } = useTheme();
  const { connectedPlatforms, getValidAccessToken, refreshToken, services } = usePlatformContext();
  const connected = connectedPlatforms.spotify?.connected;
  const [visible, setVisible] = useState(false);
  const [devices, setDevices] = useState([]);
  const [active, setActive] = useState(null);
  const [busy, setBusy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const revision = useRef(0);
  const focused = useRef(false);
  const refresh = useCallback(
    async (includeDevices) => {
      const version = ++revision.current;
      try {
        const token = await getValidAccessToken('spotify');
        if (!token) return;
        const renew = () => refreshToken('spotify');
        const [player, list] = await Promise.all([
          services.spotify.getCurrentPlayback(token, renew),
          includeDevices ? services.spotify.getDevices(token, renew) : Promise.resolve(null),
        ]);
        if (!focused.current || version !== revision.current) return;
        setActive(player?.device || null);
        if (includeDevices) {
          if (list?.success === false) setMessage(list.error || 'Could not load Spotify devices.');
          else {
            setDevices(list?.devices || []);
          }
        }
      } catch {
        if (focused.current && version === revision.current)
          setMessage('Could not refresh devices. Try again.');
      } finally {
        if (focused.current && version === revision.current) setLoading(false);
      }
    },
    [getValidAccessToken, refreshToken, services],
  );
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      if (!connected)
        return () => {
          focused.current = false;
        };
      if (visible) setLoading(true);
      refresh(visible);
      const timer = setInterval(() => refresh(visible), 5000);
      return () => {
        focused.current = false;
        revision.current++;
        clearInterval(timer);
      };
    }, [connected, visible, refresh]),
  );

  async function select(device) {
    if (busy || !canControlDevice(device)) return;
    if (active?.id === device.id) {
      setVisible(false);
      return;
    }
    setBusy(device.id);
    setMessage(null);
    try {
      const token = await getValidAccessToken('spotify');
      if (!token) throw new Error('Reconnect Spotify to choose a device.');
      const result = await services.spotify.selectPlaybackDevice(token, device.id, () =>
        refreshToken('spotify'),
      );
      if (!focused.current) return;
      if (result?.success === false) {
        setMessage(result.error);
        return;
      }
      setActive(result?.playback?.device || device);
      setVisible(false);
    } catch {
      if (focused.current)
        setMessage('Spotify could not switch devices. Open Spotify on that device and try again.');
    } finally {
      if (focused.current) setBusy(null);
    }
  }
  if (!connected) return null;
  const list =
    active?.id && !devices.some((d) => d.id === active.id) ? [active, ...devices] : devices;
  return (
    <>
      <Pressable
        onPress={() => {
          setMessage(null);
          setVisible(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Spotify playback device: ${active?.name || 'Choose device'}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 12,
          paddingHorizontal: 4,
        }}
      >
        <Ionicons name="hardware-chip-outline" size={17} color={theme.accent} />
        <Text numberOfLines={1} style={{ flex: 1, color: theme.textSecondary, fontSize: 12 }}>
          Spotify · {active?.name || 'Choose device'}
        </Text>
        <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
      </Pressable>
      <Sheet
        visible={visible}
        title="Playback device"
        onClose={() => {
          if (!busy) setVisible(false);
        }}
      >
        <Text
          style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 14 }}
        >
          Choose where Spotify plays. Your timer keeps running.
        </Text>
        <ScrollView style={{ maxHeight: 360 }}>
          {list.map((device) => {
            const enabled = canControlDevice(device);
            const selected = active?.id === device.id;
            const icon =
              device.type === 'Computer'
                ? 'laptop-outline'
                : device.type === 'Smartphone'
                  ? 'phone-portrait-outline'
                  : device.type === 'Tablet'
                    ? 'tablet-portrait-outline'
                    : 'volume-high-outline';
            return (
              <Pressable
                key={device.id || device.name}
                disabled={!enabled || !!busy}
                onPress={() => select(device)}
                accessibilityRole="button"
                accessibilityLabel={`${device.name || 'Spotify device'}${selected ? ', Current device' : ''}${!enabled ? ', Unavailable' : ''}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 16,
                  opacity: enabled ? 1 : 0.45,
                  borderBottomWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Ionicons name={icon} size={24} color={selected ? theme.accent : theme.text} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>
                    {device.name || 'Spotify device'}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 4 }}>
                    {!enabled
                      ? 'Unavailable for Spotify control'
                      : selected
                        ? 'Current device'
                        : 'Play here'}
                  </Text>
                </View>
                {busy === device.id ? (
                  <ActivityIndicator color={theme.accent} />
                ) : selected ? (
                  <Ionicons name="checkmark" size={21} color={theme.accent} />
                ) : null}
              </Pressable>
            );
          })}
          {!loading && list.length === 0 && (
            <Text style={{ color: theme.textSecondary, paddingVertical: 20, lineHeight: 20 }}>
              Open Spotify on the device you want to use, then refresh.
            </Text>
          )}
        </ScrollView>
        {loading && <ActivityIndicator color={theme.accent} style={{ margin: 12 }} />}
        {message && (
          <Text
            accessibilityRole="alert"
            style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 14 }}
          >
            {message}
          </Text>
        )}
        <Pressable
          disabled={!!busy}
          onPress={() => {
            setLoading(true);
            refresh(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Refresh Spotify devices"
          style={{ alignItems: 'center', padding: 16, marginTop: 8 }}
        >
          <Text style={{ color: theme.accent, fontWeight: '600' }}>Refresh devices</Text>
        </Pressable>
      </Sheet>
    </>
  );
}
