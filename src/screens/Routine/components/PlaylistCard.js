import Surface from '../../../components/common/Surface';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, AppState } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { usePlatformContext } from '../../../context/PlatformContext';
import { useMusicSearch } from '../../../hooks/useMusicSearch';
import Sheet from '../../../components/common/Sheet';
import { useFocusEffect } from '@react-navigation/native';
import { createAutoRefresh } from '../../../lib/autoRefresh';
import { Artwork, SearchField, MusicRow, PickerState } from './musicSearch/MusicPickerParts';

function ShuffleAction({ label, accessibilityLabel, onPress, loading, disabled }) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => ({
        minWidth: 44,
        minHeight: 44,
        paddingHorizontal: label ? 12 : 0,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        borderRadius: 13,
        backgroundColor: label ? theme.cardSecondary : 'transparent',
        opacity: disabled ? 0.35 : pressed ? 0.65 : 1,
      })}
    >
      {loading ? (
        <ActivityIndicator size="small" color={theme.accent} />
      ) : (
        <Ionicons name="shuffle" size={18} color={theme.accent} />
      )}
      {!!label && (
        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      )}
    </Pressable>
  );
}

export const PlaylistCard = ({
  roundsOrder,
  onShuffleForWork,
  onShuffleForRest,
  onConnect,
  connecting = false,
  platformId = 'spotify',
}) => {
  const { theme } = useTheme();
  const platform = usePlatformContext();
  const music = useMusicSearch(platform);
  const providerName = platformId === 'appleMusic' ? 'Apple Music' : 'Spotify';
  const connected = !!platform.connectedPlatforms[platformId]?.connected;
  const [phase, setPhase] = useState('work');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(null);
  const [feedback, setFeedback] = useState('');
  const lock = useRef(false);
  const version = useRef(0);
  const loadLibrary = useRef(music.loadPlaylists);
  loadLibrary.current = music.loadPlaylists;
  const autoRefresh = useRef(null);
  if (!autoRefresh.current) {
    autoRefresh.current = createAutoRefresh(() =>
      loadLibrary.current(platformId, { preserveItems: true }),
    );
  }
  useEffect(() => {
    if (!connected) music.reset();
  }, [connected, music.reset]);
  useFocusEffect(
    useCallback(() => {
      const syncActivity = (state) =>
        autoRefresh.current.setActive(connected && state === 'active');
      syncActivity(AppState.currentState);
      const subscription = AppState.addEventListener('change', syncActivity);
      return () => {
        subscription.remove();
        autoRefresh.current.setActive(false);
      };
    }, [connected]),
  );
  useEffect(() => {
    version.current++;
    return () => {
      version.current++;
    };
  }, [roundsOrder]);
  useEffect(() => {
    if (!connected) return;
    music.clearSearch();
    const timer = setTimeout(() => music.searchMusic(query, platformId, ['playlist']), 300);
    return () => clearTimeout(timer);
  }, [query, connected, music.searchMusic, music.clearSearch]);
  const shuffle = async (playlist) => {
    if (lock.current) return;
    const targets = phase === 'rest' ? roundsOrder.slice(0, -1) : roundsOrder;
    if (!targets.length) return;
    lock.current = true;
    setBusy(playlist.id);
    setFeedback('');
    const ticket = version.current;
    try {
      const songs = await music.shufflePlaylistForRounds(playlist.id, platformId, targets);
      if (ticket !== version.current) return;
      if (!songs) {
        setFeedback('No playable tracks loaded. Try again.');
        return;
      }
      if (phase === 'work') onShuffleForWork(playlist, songs);
      else onShuffleForRest(playlist, songs);
      setFeedback(
        `${playlist.name} · ${targets.length} ${phase} ${targets.length === 1 ? 'round' : 'rounds'} updated`,
      );
    } finally {
      lock.current = false;
      setBusy(null);
    }
  };
  const open = (playlist) => {
    setDetail(playlist);
    music.loadPlaylistTracks(playlist.id, platformId);
  };
  const list = query.trim() ? music.searchResults : music.playlists;
  const loading = query.trim() ? music.isSearching : music.loadingPlaylists;
  const error = query.trim() ? music.searchError : music.playlistError;
  return (
    <View style={{ marginBottom: 16 }}>
      {!connected ? (
        <Surface
          variant="card"
          style={{
            borderRadius: 19,
            padding: 16,
            backgroundColor: theme.card,
            flexDirection: 'row',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <Artwork size={42} icon="albums-outline" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '500' }}>
              {providerName} playlists
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 4 }}>
              Connect to browse and shuffle
            </Text>
          </View>
          <Pressable onPress={onConnect} disabled={connecting} accessibilityRole="button">
            <Text style={{ color: theme.accent, fontSize: 12, fontWeight: '600' }}>
              {connecting ? 'Connecting…' : 'Connect'}
            </Text>
          </Pressable>
        </Surface>
      ) : (
        <>
          <Text style={{ color: theme.textSecondary, fontSize: 12, marginBottom: 6 }}>
            {providerName} playlists
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <SearchField
                compact
                value={query}
                onChange={setQuery}
                placeholder="Search playlists"
              />
            </View>
            <View style={{ flexDirection: 'row' }}>
              {['work', 'rest'].map((value) => (
                <Pressable
                  key={value}
                  onPress={() => {
                    setPhase(value);
                    setFeedback('');
                  }}
                  disabled={!!busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Assign playlist to ${value} rounds`}
                  accessibilityState={{ selected: phase === value, disabled: !!busy }}
                  style={{ minHeight: 44, width: 46, justifyContent: 'center' }}
                >
                  <View
                    style={{
                      alignItems: 'center',
                      paddingVertical: 8,
                      borderRadius: 10,
                      backgroundColor: phase === value ? theme.cardSecondary : 'transparent',
                    }}
                  >
                    <Text
                      style={{
                        color: phase === value ? theme.accent : theme.textSecondary,
                        fontSize: 12,
                        fontWeight: '600',
                      }}
                    >
                      {value === 'work' ? 'Work' : 'Rest'}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
          {!list.length ? (
            <PickerState
              loading={loading}
              error={error}
              title={
                query ? 'No playlists found' : `Your ${providerName} playlists will appear here.`
              }
              onRetry={
                error
                  ? () =>
                      query
                        ? music.searchMusic(query, platformId, ['playlist'])
                        : music.loadPlaylists(platformId)
                  : undefined
              }
            />
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              snapToInterval={176}
              decelerationRate="fast"
              contentContainerStyle={{ gap: 8, paddingVertical: 2, paddingRight: 10 }}
            >
              {list.map((playlist) => (
                <Surface
                  variant="card"
                  key={playlist.id}
                  style={{
                    width: 168,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    padding: 6,
                    borderRadius: 14,
                    backgroundColor: theme.card,
                  }}
                >
                  <Pressable
                    onPress={() => open(playlist)}
                    disabled={!!busy}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${playlist.name} tracks`}
                    style={{
                      flex: 1,
                      minHeight: 44,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 7,
                    }}
                  >
                    <Artwork item={playlist} size={28} icon="albums-outline" />
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={2}
                        style={{
                          color: theme.text,
                          fontSize: 12,
                          fontWeight: '600',
                          lineHeight: 16,
                        }}
                      >
                        {playlist.name}
                      </Text>
                    </View>
                  </Pressable>
                  <ShuffleAction
                    accessibilityLabel={`Shuffle ${playlist.name} into ${phase} rounds`}
                    onPress={() => shuffle(playlist)}
                    loading={busy === playlist.id}
                    disabled={!!busy || (phase === 'rest' && roundsOrder.length < 2)}
                  />
                </Surface>
              ))}
            </ScrollView>
          )}
          {!!error && list.length > 0 && (
            <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 8 }}>
              Could not update playlists. Retrying automatically.
            </Text>
          )}
          {phase === 'rest' && roundsOrder.length < 2 && (
            <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 9 }}>
              Add a second round to use rest music.
            </Text>
          )}
          {!!feedback && (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: theme.accent, fontSize: 11, lineHeight: 16, marginTop: 10 }}
            >
              {feedback}
            </Text>
          )}
        </>
      )}
      <Sheet visible={!!detail} title={detail?.name || 'Playlist'} onClose={() => setDetail(null)}>
        <ScrollView style={{ maxHeight: 320 }}>
          {music.loadingPlaylistTracks || music.tracksError || !music.playlistTracks.length ? (
            <PickerState
              loading={music.loadingPlaylistTracks}
              error={music.tracksError}
              title="No playable tracks"
              onRetry={
                music.tracksError
                  ? () => music.loadPlaylistTracks(detail.id, platformId)
                  : undefined
              }
            />
          ) : (
            music.playlistTracks.map((track, index) => (
              <MusicRow
                key={`${track.id}-${index}`}
                item={track}
                disabled
                actionIcon="musical-note"
              />
            ))
          )}
        </ScrollView>
        <View style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <ShuffleAction
            label={`Shuffle for ${phase}`}
            onPress={() => shuffle(detail)}
            loading={!!busy}
            disabled={!music.playlistTracks.length || (phase === 'rest' && roundsOrder.length < 2)}
          />
          {!!feedback && (
            <Text style={{ color: theme.accent, fontSize: 12, marginTop: 12 }}>{feedback}</Text>
          )}
        </View>
      </Sheet>
    </View>
  );
};
