import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useIsFocused } from '@react-navigation/native';
import { useAppleMusicConnection } from '../../context/AppleMusicConnectionContext';
import { useTheme } from '../../context/ThemeContext';
import MusicArtwork from './MusicArtwork';
import Surface from './Surface';

const messageOf = (failure) =>
  failure?.userMessage || failure?.message || 'Routine music could not be started. Try again.';

export default function RoutineSoundtrackControl({
  soundtrack,
  routineName,
  onChange,
  editable = false,
  style,
}) {
  const apple = useAppleMusicConnection();
  const { theme } = useTheme();
  const isFocused = useIsFocused();
  const player = apple.player || {};
  const selection =
    soundtrack?.platform === 'appleMusic' && ['track', 'playlist'].includes(soundtrack.kind)
      ? soundtrack
      : null;
  const latest = useRef(null);
  latest.current = { routineName, onChange, editable, isFocused };
  const alive = useRef(true);
  const picker = useRef(null);
  const pickerVersion = useRef(0);
  const actionVersion = useRef(0);
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const canEdit = editable && typeof onChange === 'function';
  const retirePicker = useCallback(() => {
    pickerVersion.current++;
    const cancel = picker.current;
    picker.current = null;
    cancel?.();
  }, []);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      actionVersion.current++;
      retirePicker();
    };
  }, [retirePicker]);
  useEffect(() => {
    retirePicker();
    actionVersion.current++;
    lock.current = false;
    setBusy(false);
    setError(null);
  }, [
    routineName,
    canEdit,
    selection?.id,
    selection?.kind,
    selection?.shuffle,
    isFocused,
    retirePicker,
  ]);
  const choose = () => {
    if (
      !canEdit ||
      !isFocused ||
      !apple.ready ||
      apple.connecting ||
      typeof apple.openSoundtrackPicker !== 'function'
    )
      return;
    retirePicker();
    setError(null);
    const version = ++pickerVersion.current;
    const name = routineName;
    try {
      const cancel = apple.openSoundtrackPicker({
        routineName,
        selection,
        onSelect(item, shuffle) {
          if (
            !alive.current ||
            version !== pickerVersion.current ||
            latest.current.routineName !== name ||
            !latest.current.editable ||
            !latest.current.isFocused ||
            typeof latest.current.onChange !== 'function'
          )
            return;
          picker.current = null;
          pickerVersion.current++;
          latest.current.onChange(item, shuffle);
        },
      });
      if (version === pickerVersion.current)
        picker.current = typeof cancel === 'function' ? cancel : null;
      else if (typeof cancel === 'function') cancel();
    } catch (failure) {
      if (alive.current && version === pickerVersion.current) setError(messageOf(failure));
    }
  };
  const run = async (operation) => {
    if (!operation || !alive.current || !latest.current.isFocused || lock.current) return;
    const version = ++actionVersion.current;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await operation();
      if (result === false || result?.success === false)
        throw new Error(result?.error || 'Routine music could not be started. Try again.');
    } catch (failure) {
      if (alive.current && version === actionVersion.current) setError(messageOf(failure));
    } finally {
      if (alive.current && version === actionVersion.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  if ((!selection && !canEdit) || (!selection && !apple.companionAvailable)) return null;
  const blocked =
    !isFocused ||
    !apple.companionAvailable ||
    !apple.ready ||
    !apple.connected ||
    apple.connecting ||
    busy ||
    player.busy ||
    player.reserved ||
    player.previousOwnerPending ||
    typeof player.playSoundtrack !== 'function';
  const button = (label, icon, onPress, disabled = false, selected = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          backgroundColor: selected ? theme.accentLight : theme.cardSecondary,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Ionicons name={icon} size={17} color={theme.accent} />
      <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  return (
    <Surface variant="card" style={[styles.card, style]}>
      <Text style={[styles.caption, { color: theme.textSecondary }]}>
        ROUTINE MUSIC · APPLE MUSIC
      </Text>
      <Text style={[styles.detail, { color: theme.textSecondary }]}>
        {canEdit ? 'Selected for' : 'Saved for'} {routineName || 'this routine'}
      </Text>
      <View style={styles.row}>
        <MusicArtwork
          item={selection}
          size={48}
          icon={selection?.kind === 'playlist' ? 'albums-outline' : 'musical-notes'}
        />
        <View style={styles.metadata}>
          <Text numberOfLines={2} style={{ color: theme.text, fontSize: 15, fontWeight: '600' }}>
            {selection?.name || 'No routine music selected'}
          </Text>
          {!!selection?.artist && (
            <Text numberOfLines={1} style={[styles.detail, { color: theme.textSecondary }]}>
              {selection.artist}
            </Text>
          )}
          {selection?.kind === 'playlist' && (
            <Text style={[styles.detail, { color: theme.textSecondary }]}>
              Shuffle {selection.shuffle ? 'On' : 'Off'}
            </Text>
          )}
        </View>
        {busy && (
          <ActivityIndicator color={theme.accent} accessibilityLabel="Updating routine music" />
        )}
      </View>
      <Text style={[styles.detail, { color: theme.textSecondary }]}>
        Continuous music, independent of round assignments. Saving a choice does not start playback.
        {canEdit ? ' Save the routine to remember this choice.' : ''}
      </Text>
      {!!error && (
        <Text
          accessibilityRole="alert"
          style={[styles.detail, { color: theme.error || theme.text }]}
        >
          {error}
        </Text>
      )}
      {!apple.companionAvailable && (
        <Text style={[styles.detail, { color: theme.textSecondary }]}>
          Apple Music playback is unavailable on this device.
        </Text>
      )}
      <View style={styles.actions}>
        {canEdit &&
          button(
            selection ? 'Change routine music' : 'Choose routine music',
            'albums-outline',
            choose,
            !isFocused ||
              !apple.companionAvailable ||
              !apple.ready ||
              apple.connecting ||
              typeof apple.openSoundtrackPicker !== 'function',
          )}
        {selection &&
          button(
            'Play routine music',
            'play',
            () => run(() => player.playSoundtrack(selection)),
            !!blocked,
          )}
        {selection &&
          apple.companionAvailable &&
          !apple.connected &&
          button(
            'Connect Apple Music',
            'musical-notes',
            () => run(apple.connect),
            !apple.ready || apple.connecting || busy || typeof apple.connect !== 'function',
          )}
        {selection?.kind === 'playlist' &&
          canEdit &&
          button(
            `Shuffle routine playlist: ${selection.shuffle ? 'On' : 'Off'}`,
            'shuffle',
            () => {
              retirePicker();
              onChange(selection, !selection.shuffle);
            },
            false,
            !!selection.shuffle,
          )}
        {selection &&
          canEdit &&
          button('Remove routine music', 'close', () => {
            retirePicker();
            onChange(null, false);
          })}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 10 },
  caption: { fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  detail: { fontSize: 12, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metadata: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  button: {
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 12,
  },
});
