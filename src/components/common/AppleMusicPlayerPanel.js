import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppleMusicConnection } from '../../context/AppleMusicConnectionContext';
import { useTheme } from '../../context/ThemeContext';
import MusicArtwork from './MusicArtwork';
import Sheet from './Sheet';
import usePlaylistArtwork from '../../hooks/usePlaylistArtwork';

const itemsOf = (value) => (Array.isArray(value) ? value : value?.items || []).filter(Boolean);
const titleOf = (item) => item?.name || item?.title || 'Untitled';
const detailOf = (item) =>
  item?.artists
    ?.map((artist) => artist.name)
    .filter(Boolean)
    .join(', ') ||
  item?.artist ||
  item?.owner?.display_name ||
  (item?.type === 'playlist' ? 'Playlist' : 'Apple Music');
const messageOf = (error, fallback) =>
  (typeof error === 'string' ? error : error?.userMessage || error?.message) || fallback;
const repeatLabels = { off: 'Off', context: 'All', track: 'One' };
const repeatNext = { off: 'context', context: 'track', track: 'off' };
const emptyItems = [];
const musicItemKey = (item, index) => `${item.type}:${item.id || item.uri || 'item'}:${index}`;
const artworkViewability = { itemVisiblePercentThreshold: 50, minimumViewTime: 100 };
const savedSelectionItem = (item) => (item ? { ...item, type: item.kind || item.type } : null);

// Each read belongs to one visible browser state. Retiring it never touches playback.
function useMusicList(enabled, request, dependencies, delay = 0) {
  const [state, setState] = useState({ items: [], loading: false, error: null });
  const generation = useRef(0);
  const requestRef = useRef(request);
  requestRef.current = request;
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    const ticket = ++generation.current;
    setState({ items: [], loading: !!enabled, error: null });
    if (!enabled) return;
    const load = async () => {
      try {
        const items = await requestRef.current();
        if (ticket === generation.current) setState({ items, loading: false, error: null });
      } catch (error) {
        if (ticket === generation.current)
          setState({
            items: [],
            loading: false,
            error: messageOf(error, 'Could not load Apple Music. Try again.'),
          });
      }
    };
    const timer = delay ? setTimeout(load, delay) : null;
    if (!delay) void load();
    return () => {
      generation.current++;
      if (timer !== null) clearTimeout(timer);
    };
  }, [enabled, delay, ...dependencies]);
  return { ...state, invalidate };
}

function MusicButton({
  label,
  icon,
  onPress,
  disabled = false,
  selected = false,
  compact = false,
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        compact && styles.compactButton,
        {
          backgroundColor: selected ? theme.accentLight : theme.cardSecondary,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {icon && <Ionicons name={icon} size={20} color={selected ? theme.accent : theme.text} />}
      {!compact && (
        <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      )}
    </Pressable>
  );
}

const MusicItem = React.memo(function MusicItem({
  item,
  artwork,
  onArtworkUnavailable,
  onSelect,
  selected,
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Select ${item.type === 'playlist' ? 'playlist' : 'track'} ${titleOf(item)}`}
      accessibilityState={{ selected }}
      onPress={() => onSelect(item)}
      style={[styles.item, { borderColor: theme.border }]}
    >
      <MusicArtwork
        item={artwork || item}
        fallbackItem={artwork ? item : undefined}
        onUnavailable={() => onArtworkUnavailable(item)}
        icon={item.type === 'playlist' ? 'albums-outline' : 'musical-note'}
      />
      <View style={styles.metadata}>
        <Text numberOfLines={2} style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>
          {titleOf(item)}
        </Text>
        <Text numberOfLines={1} style={[styles.detail, { color: theme.textSecondary }]}>
          {detailOf(item)}
        </Text>
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'chevron-forward'}
        size={20}
        color={theme.accent}
      />
    </Pressable>
  );
});

function NowPlaying({ player, runAction, disabled }) {
  const { theme } = useTheme();
  const hasQueue = !!(player.ownsQueue || player.reserved);
  if (player.previousOwnerPending)
    return (
      <View style={[styles.card, { backgroundColor: theme.cardSecondary }]}>
        <Text style={[styles.caption, { color: theme.textSecondary }]}>APPLE MUSIC</Text>
        <Text style={[styles.description, { color: theme.text }]}>
          A previous Apple Music queue still needs to be cleared.
        </Text>
        <MusicButton
          label="Stop and clear"
          icon="stop"
          onPress={() => runAction(player.clear, true)}
        />
      </View>
    );
  if (!hasQueue && !player.busy) return null;
  const progress = Math.max(0, Math.min(100, Number(player.progress) || 0));
  return (
    <View style={[styles.card, { backgroundColor: theme.cardSecondary }]}>
      <View style={styles.item}>
        <MusicArtwork item={player.track} size={56} />
        <View style={styles.metadata}>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>APPLE MUSIC</Text>
          <Text numberOfLines={2} style={{ color: theme.text, fontWeight: '700', fontSize: 16 }}>
            {player.track
              ? titleOf(player.track)
              : player.busy
                ? 'Preparing music…'
                : 'Apple Music queue'}
          </Text>
          <Text numberOfLines={1} style={[styles.detail, { color: theme.textSecondary }]}>
            {player.track ? detailOf(player.track) : player.playing ? 'Playing' : 'Paused'}
          </Text>
        </View>
        {player.busy && (
          <ActivityIndicator
            color={theme.accent}
            accessibilityLabel="Updating Apple Music playback"
          />
        )}
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Apple Music playback progress"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }}
        style={[styles.progress, { backgroundColor: theme.border }]}
      >
        <View style={{ width: `${progress}%`, height: '100%', backgroundColor: theme.accent }} />
      </View>
      <View style={styles.controls}>
        <MusicButton
          label="Previous track"
          icon="play-skip-back"
          compact
          disabled={disabled || !hasQueue}
          onPress={() => runAction(player.previous)}
        />
        <MusicButton
          label={player.playing ? 'Pause Apple Music' : 'Resume Apple Music'}
          icon={player.playing ? 'pause' : 'play'}
          compact
          disabled={disabled || !hasQueue}
          onPress={() => runAction(player.playing ? player.pause : player.resume)}
        />
        <MusicButton
          label="Next track"
          icon="play-skip-forward"
          compact
          disabled={disabled || !hasQueue}
          onPress={() => runAction(player.next)}
        />
        <MusicButton
          label={player.shuffle ? 'Turn shuffle off' : 'Turn shuffle on'}
          icon="shuffle"
          compact
          selected={!!player.shuffle}
          disabled={disabled || !hasQueue}
          onPress={() => runAction(() => player.setShuffle(!player.shuffle))}
        />
        <MusicButton
          label={`Repeat: ${repeatLabels[player.repeat] || 'Off'}`}
          icon={player.repeat === 'track' ? 'repeat' : 'repeat-outline'}
          compact
          selected={player.repeat && player.repeat !== 'off'}
          disabled={disabled || !hasQueue}
          onPress={() => runAction(() => player.setRepeat(repeatNext[player.repeat] || 'context'))}
        />
      </View>
      <Text style={[styles.detail, { color: theme.textSecondary, textAlign: 'center' }]}>
        Shuffle {player.shuffle ? 'On' : 'Off'} · Repeat {repeatLabels[player.repeat] || 'Off'}
      </Text>
      <MusicButton
        label="Stop and clear"
        icon="stop"
        onPress={() => runAction(player.clear, true)}
      />
    </View>
  );
}

export default function AppleMusicPlayerPanel() {
  const apple = useAppleMusicConnection();
  const { theme } = useTheme();
  const player = apple.player || {};
  const picker = apple.soundtrackPicker || null;
  const requestId = picker?.id;
  const pickerRef = useRef(picker);
  pickerRef.current = picker;
  const visible = !!(apple.companionAvailable && (player.visible || picker));
  const active =
    visible && apple.connected && apple.ready && (!!picker || !player.previousOwnerPending);
  const [tab, setTab] = useState('search');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [playlist, setPlaylist] = useState(null);
  const [retry, setRetry] = useState(0);
  const [actionError, setActionError] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectionShuffle, setSelectionShuffle] = useState(false);
  const actionGeneration = useRef(0);
  const actionLock = useRef(false);
  const listRef = useRef(null);
  useEffect(() => {
    setTab(picker ? 'library' : 'search');
    setQuery('');
    setSelected(savedSelectionItem(picker?.selection));
    setPlaylist(null);
    setSelectionShuffle(
      picker?.selection?.kind === 'playlist' && picker.selection.shuffle === true,
    );
    setActionError(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [requestId]);
  const search = useMusicList(
    active && tab === 'search' && !!query.trim() && !playlist,
    async () => {
      const result = await apple.search(query.trim(), ['track', 'playlist'], 30);
      if (Array.isArray(result)) return result.filter(Boolean);
      return [
        ...itemsOf(result?.tracks).map((item) => ({ ...item, type: 'track' })),
        ...itemsOf(result?.playlists).map((item) => ({ ...item, type: 'playlist' })),
      ];
    },
    [query, apple.search, retry, requestId],
    300,
  );
  const library = useMusicList(
    active && tab === 'library' && !playlist,
    async () => itemsOf(await apple.getPlaylists()).map((item) => ({ ...item, type: 'playlist' })),
    [apple.getPlaylists, retry, requestId],
  );
  const tracks = useMusicList(
    active && !!playlist,
    async () =>
      itemsOf(await apple.getPlaylistTracks(playlist.id)).map((item) => ({
        ...item,
        type: 'track',
      })),
    [playlist?.id, apple.getPlaylistTracks, retry, requestId],
  );
  const artwork = usePlaylistArtwork({
    active,
    enabled:
      active &&
      tab === 'library' &&
      !playlist &&
      !apple.connecting &&
      !library.loading &&
      !library.error,
    items: library.items,
    request: apple.getPlaylistArtwork,
    source: apple.getPlaylists,
  });
  const invalidateReads = useCallback(() => {
    search.invalidate();
    library.invalidate();
    tracks.invalidate();
  }, [search.invalidate, library.invalidate, tracks.invalidate]);
  useEffect(() => {
    if (!active) {
      setQuery('');
      if (!picker) setSelected(null);
      setPlaylist(null);
      setActionError(null);
    }
    actionGeneration.current++;
    actionLock.current = false;
    setActionBusy(false);
    return () => {
      actionGeneration.current++;
    };
  }, [active, requestId]);
  const runAction = async (action, interrupt = false) => {
    if (!action || (actionLock.current && !interrupt)) return;
    const ticket = ++actionGeneration.current;
    actionLock.current = true;
    setActionBusy(true);
    setActionError(null);
    try {
      const result = await action();
      if (result?.success === false && ticket === actionGeneration.current)
        setActionError(
          messageOf(result.error, 'Apple Music could not complete this request. Try again.'),
        );
    } catch (error) {
      if (ticket === actionGeneration.current)
        setActionError(messageOf(error, 'Apple Music could not complete this request. Try again.'));
    } finally {
      if (ticket === actionGeneration.current) {
        actionLock.current = false;
        setActionBusy(false);
      }
    }
  };
  const close = () => {
    invalidateReads();
    artwork.invalidate();
    actionGeneration.current++;
    if (picker) apple.cancelSoundtrackPicker?.(picker.id);
    else player.close?.();
  };
  const choose = useCallback(
    (item) => {
      setSelected(item);
      setActionError(null);
      if (item.type !== 'playlist') setSelectionShuffle(false);
      if (item.type === 'playlist') {
        invalidateReads();
        setPlaylist(item);
      }
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    },
    [invalidateReads],
  );
  const renderMusicItem = useCallback(
    ({ item }) => (
      <MusicItem
        item={item}
        artwork={artwork.artworkFor(item)}
        onArtworkUnavailable={artwork.onUnavailable}
        selected={selected?.id === item.id && selected?.type === item.type}
        onSelect={choose}
      />
    ),
    [choose, selected?.id, selected?.type, artwork.artworkFor, artwork.onUnavailable],
  );
  const changeTab = (value) => {
    if (value === tab && !playlist) return;
    invalidateReads();
    setTab(value);
    setSelected(null);
    setPlaylist(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  };
  const list = playlist ? tracks : tab === 'library' ? library : search;
  const browsing = active && !apple.connecting;
  const disabled =
    !apple.connected ||
    !apple.ready ||
    apple.connecting ||
    player.busy ||
    player.previousOwnerPending ||
    actionBusy;
  const selectionDisabled =
    !apple.connected ||
    !apple.ready ||
    apple.connecting ||
    actionBusy ||
    typeof apple.selectSoundtrackItem !== 'function';
  const error = picker
    ? actionError || (!apple.connected && apple.error)
    : player.previousOwnerPending
      ? actionError
        ? 'Could not clear the previous Apple Music queue. Try again.'
        : apple.error
      : actionError || player.error || apple.error;
  if (!apple.companionAvailable) return null;
  return (
    <Sheet visible={visible} title={picker ? 'Routine music' : 'Apple Music'} onClose={close}>
      <FlatList
        ref={listRef}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        data={browsing && !list.loading && !list.error ? list.items : emptyItems}
        renderItem={renderMusicItem}
        extraData={artwork.revision}
        onViewableItemsChanged={artwork.onViewableItemsChanged}
        viewabilityConfig={artworkViewability}
        keyExtractor={musicItemKey}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        ListHeaderComponent={
          <View style={styles.content}>
            <Text style={[styles.description, { color: theme.textSecondary }]}>
              {picker
                ? `Choose continuous Apple Music for ${picker.routineName || 'this routine'}. Use for routine returns your choice to the editor without starting playback or switching music at each round. Save the routine to remember it.`
                : 'Music plays independently of round assignments. Your chosen alerts pause music, play on their own, then let music continue.'}
            </Text>
            <Text style={[styles.detail, { color: theme.textSecondary }]}>
              Apple Music subscription and Music access required for catalog playback. Available
              without a Sync account.
            </Text>
            {!!error && (
              <Text
                accessibilityRole="alert"
                style={[styles.description, { color: theme.error || theme.text }]}
              >
                {messageOf(error)}
              </Text>
            )}
            {!picker && <NowPlaying player={player} runAction={runAction} disabled={disabled} />}
            {!apple.ready || apple.connecting ? (
              <View style={styles.loading}>
                <ActivityIndicator color={theme.accent} />
                <Text style={{ color: theme.textSecondary }}>
                  {apple.connecting ? 'Connecting to Apple Music…' : 'Preparing Apple Music…'}
                </Text>
              </View>
            ) : !apple.connected ? (
              <MusicButton
                label="Connect Apple Music"
                icon="musical-notes"
                onPress={() => runAction(apple.connect)}
                disabled={actionBusy}
              />
            ) : !picker && player.previousOwnerPending ? null : (
              <>
                <View style={styles.tabs}>
                  <MusicButton
                    label="Search catalog"
                    icon="search"
                    selected={tab === 'search'}
                    onPress={() => changeTab('search')}
                  />
                  <MusicButton
                    label="My playlists"
                    icon="albums-outline"
                    selected={tab === 'library'}
                    onPress={() => changeTab('library')}
                  />
                </View>
                {playlist ? (
                  <View style={styles.playlistHeader}>
                    <MusicButton
                      label="Back to results"
                      icon="arrow-back"
                      onPress={() => {
                        invalidateReads();
                        setPlaylist(null);
                        setSelected(null);
                        listRef.current?.scrollToOffset({ offset: 0, animated: false });
                      }}
                    />
                    <Text style={{ color: theme.text, fontWeight: '700', flex: 1 }}>
                      {titleOf(playlist)}
                    </Text>
                  </View>
                ) : tab === 'search' ? (
                  <TextInput
                    value={query}
                    onChangeText={(value) => {
                      if (value === query) return;
                      search.invalidate();
                      setQuery(value);
                      setSelected(null);
                    }}
                    placeholder="Search songs and playlists"
                    placeholderTextColor={theme.textSecondary}
                    accessibilityLabel="Search Apple Music"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    maxLength={200}
                    style={[
                      styles.search,
                      { color: theme.text, backgroundColor: theme.cardSecondary },
                    ]}
                  />
                ) : null}
                {selected && (
                  <View style={[styles.card, { backgroundColor: theme.cardSecondary }]}>
                    {picker && (
                      <Text style={[styles.caption, { color: theme.textSecondary }]}>
                        ROUTINE MUSIC SELECTION
                      </Text>
                    )}
                    <View style={styles.item}>
                      <MusicArtwork
                        item={artwork.artworkFor(selected) || selected}
                        fallbackItem={artwork.artworkFor(selected) ? selected : undefined}
                        size={52}
                        icon={selected.type === 'playlist' ? 'albums-outline' : 'musical-note'}
                      />
                      <View style={styles.metadata}>
                        <Text numberOfLines={2} style={{ color: theme.text, fontWeight: '700' }}>
                          {titleOf(selected)}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[styles.detail, { color: theme.textSecondary }]}
                        >
                          {detailOf(selected)}
                        </Text>
                      </View>
                    </View>
                    {picker && selected.type === 'playlist' && (
                      <MusicButton
                        label={`Shuffle routine playlist: ${selectionShuffle ? 'On' : 'Off'}`}
                        icon="shuffle"
                        selected={selectionShuffle}
                        onPress={() => setSelectionShuffle((value) => !value)}
                      />
                    )}
                    <MusicButton
                      label={
                        picker
                          ? 'Use for routine'
                          : selected.type === 'playlist'
                            ? 'Play playlist'
                            : 'Play track'
                      }
                      icon={picker ? 'checkmark' : 'play'}
                      disabled={picker ? selectionDisabled : disabled}
                      onPress={() => {
                        if (picker && pickerRef.current?.id !== picker.id) return;
                        return runAction(() =>
                          picker
                            ? apple.selectSoundtrackItem(
                                picker.id,
                                {
                                  ...selected,
                                  image: artwork.artworkFor(selected)?.image || selected.image,
                                },
                                selected.type === 'playlist' && selectionShuffle,
                              )
                            : selected.type === 'playlist'
                              ? player.playPlaylist(selected)
                              : player.playTrack(selected),
                        );
                      }}
                    />
                  </View>
                )}
                {list.loading ? (
                  <View style={styles.loading}>
                    <ActivityIndicator color={theme.accent} />
                    <Text style={{ color: theme.textSecondary }}>
                      {playlist
                        ? 'Loading playlist tracks…'
                        : tab === 'library'
                          ? 'Loading playlists…'
                          : 'Searching Apple Music…'}
                    </Text>
                  </View>
                ) : list.error ? (
                  <View style={styles.card}>
                    <Text accessibilityRole="alert" style={{ color: theme.error || theme.text }}>
                      {list.error}
                    </Text>
                    <MusicButton
                      label="Try again"
                      icon="refresh"
                      onPress={() => setRetry((value) => value + 1)}
                    />
                  </View>
                ) : !list.items.length ? (
                  <Text style={[styles.empty, { color: theme.textSecondary }]}>
                    {playlist
                      ? 'This playlist has no available tracks.'
                      : tab === 'library'
                        ? 'No playlists found in your Apple Music library.'
                        : query.trim()
                          ? 'No songs or playlists found.'
                          : picker
                            ? 'Search for a song or playlist, then choose Use for routine.'
                            : 'Search the Apple Music catalog, then select a song or playlist and tap Play.'}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        }
        ListFooterComponent={
          browsing ? (
            <View style={styles.footer}>
              <MusicButton
                label="Disconnect Apple Music"
                icon="log-out-outline"
                onPress={() => {
                  invalidateReads();
                  artwork.invalidate();
                  void runAction(apple.disconnect, true);
                }}
                disabled={apple.connecting}
              />
            </View>
          ) : null
        }
      />
    </Sheet>
  );
}

export function AppleMusicMiniPlayer() {
  const apple = useAppleMusicConnection();
  const { theme } = useTheme();
  const player = apple.player || {};
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const alive = useRef(true);
  const lock = useRef(false);
  const generation = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    generation.current++;
    lock.current = false;
    setPending(false);
    setError(null);
  }, [
    player.track?.id || player.track?.uri || player.track?.name || player.track?.title,
    player.ownsQueue,
    player.reserved,
    player.previousOwnerPending,
  ]);
  if (
    !apple.companionAvailable ||
    !(player.ownsQueue || player.reserved || player.busy || player.previousOwnerPending)
  )
    return null;
  const runAction = async (action, interrupt = false) => {
    if (!action || ((lock.current || player.busy) && !interrupt)) return;
    const ticket = ++generation.current;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (result?.success === false && alive.current && ticket === generation.current)
        setError(messageOf(result.error, 'Open Apple Music to try again.'));
    } catch (failure) {
      if (alive.current && ticket === generation.current)
        setError(messageOf(failure, 'Open Apple Music to try again.'));
    } finally {
      if (ticket === generation.current) {
        lock.current = false;
        if (alive.current) setPending(false);
      }
    }
  };
  if (player.previousOwnerPending)
    return (
      <View
        style={[
          styles.mini,
          styles.previousQueue,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <Text style={[styles.caption, { color: theme.textSecondary }]}>APPLE MUSIC</Text>
        <Text style={[styles.description, { color: theme.text }]}>
          A previous Apple Music queue still needs to be cleared.
        </Text>
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: theme.error || theme.text }}>
            Could not clear the previous queue. Try again.
          </Text>
        )}
        <View style={styles.tabs}>
          <MusicButton label="Open Apple Music player" icon="open-outline" onPress={player.open} />
          <MusicButton
            label="Stop and clear"
            icon="stop"
            onPress={() => runAction(player.clear, true)}
          />
        </View>
      </View>
    );
  return (
    <View style={[styles.mini, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Apple Music player"
        onPress={player.open}
        style={styles.miniOpen}
      >
        <MusicArtwork item={player.track} size={44} />
        <View style={styles.metadata}>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>APPLE MUSIC</Text>
          <Text numberOfLines={1} style={{ color: theme.text, fontWeight: '600', fontSize: 14 }}>
            {player.track
              ? titleOf(player.track)
              : player.busy
                ? 'Preparing music…'
                : 'Apple Music queue'}
          </Text>
          <Text numberOfLines={1} style={[styles.detail, { color: theme.textSecondary }]}>
            {error ||
              player.error ||
              (player.track
                ? detailOf(player.track)
                : player.playing
                  ? 'Playing independently'
                  : 'Paused')}
          </Text>
        </View>
      </Pressable>
      {player.busy || pending ? (
        <ActivityIndicator
          color={theme.accent}
          accessibilityLabel="Updating Apple Music playback"
        />
      ) : (
        <MusicButton
          label={player.playing ? 'Pause Apple Music' : 'Resume Apple Music'}
          icon={player.playing ? 'pause' : 'play'}
          compact
          disabled={!apple.connected || !apple.ready}
          onPress={() => runAction(player.playing ? player.pause : player.resume)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { flexShrink: 1 },
  listContent: { paddingBottom: 12 },
  content: { paddingBottom: 12, gap: 12 },
  footer: { paddingTop: 12 },
  description: { fontSize: 13, lineHeight: 20 },
  detail: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  caption: { fontSize: 10, letterSpacing: 1, fontWeight: '700', marginBottom: 4 },
  button: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
  },
  compactButton: { width: 44, paddingHorizontal: 0, flexShrink: 0 },
  card: { padding: 12, borderRadius: 18, gap: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  metadata: { flex: 1, minWidth: 0 },
  progress: { height: 4, overflow: 'hidden', borderRadius: 2 },
  controls: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  playlistHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  search: {
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    fontSize: 14,
  },
  loading: { flexDirection: 'row', gap: 10, paddingVertical: 16, alignItems: 'center' },
  empty: { fontSize: 13, lineHeight: 20, paddingVertical: 18 },
  mini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
  },
  miniOpen: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  previousQueue: { flexDirection: 'column', alignItems: 'stretch' },
});
