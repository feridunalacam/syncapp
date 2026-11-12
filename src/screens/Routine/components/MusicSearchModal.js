import Surface from '../../../components/common/Surface';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '../../../context/ThemeContext';
import { usePlatformContext } from '../../../context/PlatformContext';
import { useMusicSearch } from '../../../hooks/useMusicSearch';
import { loadDeviceMusic } from '../../../services/deviceMusicLibrary';
import GlassSurface from '../../../components/common/GlassSurface';
import { DEFAULT_VOICES } from './musicSearch/constants';
import { useDeviceMediaPicker } from './musicSearch/useDeviceMediaPicker';
import useSpotifyConnection from '../../Profile/hooks/useSpotifyConnection';
import { useAppleMusicConnection } from '../../../context/AppleMusicConnectionContext';
import BrowserAudioPanel from './musicSearch/BrowserAudioPanel';
import {
  Artwork,
  PickerTabs,
  SearchField,
  MusicRow,
  PickerState,
  PrimaryAction,
} from './musicSearch/MusicPickerParts';

export const MusicSearchModal = ({
  visible,
  onClose,
  attachSongToRound,
  attachPlaylistToRound,
  selectedRoundForSong,
  songType,
  roundWorkSongs = {},
  roundRestSongs = {},
  roundWorkPlaylists = {},
  roundRestPlaylists = {},
  isForCountdownSound = false,
}) => {
  const { theme } = useTheme();
  const spotify = useSpotifyConnection();
  const apple = useAppleMusicConnection();
  const platforms = usePlatformContext();
  const defaultSource =
    platforms.selectedPlatform &&
    platforms.connectedPlatforms[platforms.selectedPlatform]?.connected
      ? platforms.selectedPlatform
      : platforms.connectedPlatforms.appleMusic?.connected
        ? 'appleMusic'
        : platforms.connectedPlatforms.spotify?.connected
          ? 'spotify'
          : 'device';
  const music = useMusicSearch({ ...platforms, loadDeviceMusic });
  const [source, setSource] = useState(isForCountdownSound ? 'voices' : defaultSource);
  const isRemote = source === 'spotify' || source === 'appleMusic';
  const connected = !!platforms.connectedPlatforms[source]?.connected;
  const connection = source === 'appleMusic' ? apple : spotify;
  const providerName = source === 'appleMusic' ? 'Apple Music' : 'Spotify';
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('track');
  const [playlist, setPlaylist] = useState(null);
  const [deviceLoaded, setDeviceLoaded] = useState(false);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const reset = music.reset;
  useEffect(() => {
    reset();
    setQuery('');
    setPlaylist(null);
    setDeviceLoaded(false);
    setCategory('track');
    if (visible) setSource(isForCountdownSound ? 'voices' : defaultSource);
  }, [visible, isForCountdownSound, selectedRoundForSong, reset]);
  useEffect(() => {
    if (visible && isRemote && connected) music.loadPlaylists(source);
  }, [visible, source, connected, music.loadPlaylists]);
  useEffect(() => {
    if (!visible || !isRemote || !connected) return;
    music.clearSearch();
    const timer = setTimeout(
      () =>
        music.searchMusic(
          query,
          source,
          category === 'all' ? ['track', 'playlist', 'episode'] : [category],
        ),
      300,
    );
    return () => clearTimeout(timer);
  }, [query, category, source, visible, connected, music.searchMusic, music.clearSearch]);
  const changeSource = (value) => {
    music.reset();
    setSource(value);
    setQuery('');
    setPlaylist(null);
    setDeviceLoaded(false);
    setCategory('track');
  };
  const close = () => {
    music.reset();
    onClose();
  };
  const choose = useCallback(
    (item) => {
      if (!visibleRef.current) return;
      if (item.type === 'playlist') attachPlaylistToRound(selectedRoundForSong, item, songType);
      else attachSongToRound(selectedRoundForSong, item, songType);
      onClose();
    },
    [attachSongToRound, attachPlaylistToRound, selectedRoundForSong, songType, onClose],
  );
  const picker = useDeviceMediaPicker({ onSongSelected: choose, active: visible });
  const selectedSong = (songType === 'rest' ? roundRestSongs : roundWorkSongs)?.[
    selectedRoundForSong
  ];
  const selectedPlaylist = (songType === 'rest' ? roundRestPlaylists : roundWorkPlaylists)?.[
    selectedRoundForSong
  ];
  const openPlaylist = (item) => {
    setPlaylist(item);
    music.loadPlaylistTracks(item.id, source);
  };
  const renderTrack = (item, index) => (
    <MusicRow
      key={`${item.id || item.uri}-${index}`}
      item={item}
      selected={
        item.type === 'playlist'
          ? selectedPlaylist?.id === item.id &&
            (!selectedPlaylist.platform || selectedPlaylist.platform === item.platform)
          : selectedSong?.uri === item.uri
      }
      actionIcon={item.type === 'playlist' ? 'chevron-forward' : 'add'}
      onPress={() => (item.type === 'playlist' ? openPlaylist(item) : choose(item))}
    />
  );
  const sources = isForCountdownSound
    ? [
        { id: 'voices', label: 'Sounds', icon: 'volume-medium-outline' },
        { id: 'device', label: 'Device', icon: 'phone-portrait-outline' },
      ]
    : [
        { id: 'device', label: 'Device', icon: 'phone-portrait-outline' },
        ...(spotify.available
          ? [{ id: 'spotify', label: 'Spotify', icon: 'musical-notes-outline' }]
          : []),
        ...(apple.available
          ? [{ id: 'appleMusic', label: 'Apple Music', icon: 'logo-apple' }]
          : []),
        { id: 'browser', label: 'Browser', icon: 'globe-outline' },
      ];
  const deviceTracks = music.popularSongs.filter((item) =>
    [item.name, item.artist].some((text) =>
      text?.toLowerCase().includes(query.toLowerCase().trim()),
    ),
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.overlay, { backgroundColor: theme.modalOverlay }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={close}
          accessibilityLabel="Dismiss music picker"
        />
        <Surface variant="sheet" style={[styles.sheet, { backgroundColor: theme.modalBackground }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: theme.text, fontSize: 25, fontWeight: '600', letterSpacing: -0.6 }}
              >
                {isForCountdownSound
                  ? 'Choose a sound'
                  : `${songType === 'rest' ? 'Rest' : 'Work'} music`}
              </Text>
              {!isForCountdownSound && (
                <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 5 }}>
                  Round {String(selectedRoundForSong || 1).padStart(2, '0')}
                </Text>
              )}
            </View>
            <Pressable
              onPress={close}
              accessibilityRole="button"
              accessibilityLabel="Close music picker"
            >
              <GlassSurface interactive style={styles.close}>
                <Ionicons name="close" size={22} color={theme.text} />
              </GlassSurface>
            </Pressable>
          </View>
          <PickerTabs items={sources} value={source} onChange={changeSource} />
          {source === 'browser' ? (
            visible && <BrowserAudioPanel picker={picker} />
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
            >
              {source === 'voices' && (
                <View style={{ paddingTop: 12 }}>
                  {DEFAULT_VOICES.map((item, index) => (
                    <MusicRow
                      key={item.id}
                      item={item}
                      detail={`${item.duration}s · Built-in sound`}
                      onPress={() => choose(item)}
                      selected={selectedSong?.id === item.id}
                    />
                  ))}
                </View>
              )}
              {source === 'device' && (
                <>
                  <View style={styles.imports}>
                    {[
                      { label: 'Files', icon: 'folder-outline', action: picker.handlePickFile },
                      {
                        label: 'Videos',
                        icon: 'videocam-outline',
                        action: picker.handlePickFromCameraRoll,
                      },
                      {
                        label: 'Voice memo',
                        icon: 'mic-outline',
                        action: picker.handlePickVoiceMemo,
                      },
                    ].map((item) => (
                      <Pressable
                        key={item.label}
                        onPress={item.action}
                        accessibilityRole="button"
                        accessibilityLabel={`Import from ${item.label}`}
                        style={[styles.import, { backgroundColor: theme.cardSecondary }]}
                      >
                        <Ionicons name={item.icon} size={25} color={theme.accent} />
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 12,
                            fontWeight: '500',
                            marginTop: 10,
                          }}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text
                    style={{
                      color: theme.textSecondary,
                      fontSize: 12,
                      lineHeight: 18,
                      marginBottom: 18,
                    }}
                  >
                    Import a file or choose audio already used in your device library.
                  </Text>
                  {!deviceLoaded ? (
                    <PrimaryAction
                      label="Browse device library"
                      icon="albums-outline"
                      onPress={() => {
                        setDeviceLoaded(true);
                        music.loadSuggestedSongs('device');
                      }}
                    />
                  ) : (
                    <>
                      <SearchField
                        value={query}
                        onChange={setQuery}
                        placeholder="Search device library"
                      />
                      {music.loadingSongs || music.songsError || !deviceTracks.length ? (
                        <PickerState
                          loading={music.loadingSongs}
                          error={music.songsError}
                          title="No audio found. Import a file above."
                          onRetry={
                            music.songsError ? () => music.loadSuggestedSongs('device') : undefined
                          }
                        />
                      ) : (
                        deviceTracks.map(renderTrack)
                      )}
                    </>
                  )}
                </>
              )}
              {isRemote &&
                (!connected ? (
                  <PickerState
                    title={`Connect ${providerName} to choose songs and playlists.`}
                    error={connection.error}
                    onRetry={
                      connection.connecting || !connection.ready ? undefined : connection.connect
                    }
                    actionLabel={connection.connecting ? 'Connecting…' : `Connect ${providerName}`}
                  />
                ) : playlist ? (
                  <>
                    <Pressable
                      onPress={() => setPlaylist(null)}
                      style={{
                        flexDirection: 'row',
                        gap: 6,
                        alignItems: 'center',
                        paddingVertical: 15,
                      }}
                      accessibilityLabel={`Back to ${providerName} library`}
                    >
                      <Ionicons name="chevron-back" size={18} color={theme.accent} />
                      <Text style={{ color: theme.accent, fontSize: 13 }}>Library</Text>
                    </Pressable>
                    <View
                      style={{
                        flexDirection: 'row',
                        gap: 14,
                        alignItems: 'center',
                        marginBottom: 18,
                      }}
                    >
                      <Artwork item={playlist} size={68} icon="albums-outline" />
                      <Text
                        numberOfLines={2}
                        style={{ flex: 1, color: theme.text, fontSize: 19, fontWeight: '600' }}
                      >
                        {playlist.name}
                      </Text>
                    </View>
                    <PrimaryAction
                      label={
                        selectedPlaylist?.id === playlist.id
                          ? 'Playlist selected'
                          : 'Use this playlist'
                      }
                      icon="albums-outline"
                      disabled={selectedPlaylist?.id === playlist.id}
                      onPress={() => choose({ ...playlist, type: 'playlist', platform: source })}
                    />
                    <View style={{ height: 10 }} />
                    {music.loadingPlaylistTracks ||
                    music.tracksError ||
                    !music.playlistTracks.length ? (
                      <PickerState
                        loading={music.loadingPlaylistTracks}
                        error={music.tracksError}
                        title="No playable tracks in this playlist."
                        onRetry={
                          music.tracksError
                            ? () => music.loadPlaylistTracks(playlist.id, source)
                            : undefined
                        }
                      />
                    ) : (
                      music.playlistTracks.map(renderTrack)
                    )}
                  </>
                ) : (
                  <>
                    <SearchField
                      value={query}
                      onChange={setQuery}
                      placeholder="Search songs and playlists"
                    />
                    <PickerTabs
                      items={[
                        { id: 'track', label: 'Songs' },
                        { id: 'playlist', label: 'Playlists' },
                        ...(source === 'spotify' ? [{ id: 'episode', label: 'Episodes' }] : []),
                      ]}
                      value={category}
                      onChange={setCategory}
                    />
                    {query.trim() ? (
                      music.isSearching || music.searchError || !music.searchResults.length ? (
                        <PickerState
                          loading={music.isSearching}
                          error={music.searchError}
                          title="No results. Try another search."
                          onRetry={
                            music.searchError
                              ? () => music.searchMusic(query, source, [category])
                              : undefined
                          }
                        />
                      ) : (
                        music.searchResults.map(renderTrack)
                      )
                    ) : (
                      <>
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 17,
                            fontWeight: '600',
                            marginTop: 22,
                            marginBottom: 12,
                          }}
                        >
                          Your playlists
                        </Text>
                        {music.loadingPlaylists ||
                        music.playlistError ||
                        !music.playlists.length ? (
                          <PickerState
                            loading={music.loadingPlaylists}
                            error={music.playlistError}
                            title="No saved playlists. Search for music above."
                            onRetry={
                              music.playlistError ? () => music.loadPlaylists(source) : undefined
                            }
                          />
                        ) : (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 14, paddingBottom: 16 }}
                          >
                            {music.playlists.map((item) => (
                              <Pressable
                                key={item.id}
                                onPress={() => openPlaylist(item)}
                                accessibilityLabel={`Browse ${item.name}`}
                                style={{ width: 112 }}
                              >
                                <Artwork item={item} size={112} icon="albums-outline" />
                                <Text
                                  numberOfLines={2}
                                  style={{
                                    color: theme.text,
                                    fontSize: 12,
                                    fontWeight: '500',
                                    marginTop: 10,
                                    lineHeight: 17,
                                  }}
                                >
                                  {item.name}
                                </Text>
                                {item.tracksCount != null && (
                                  <Text
                                    style={{
                                      color: theme.textSecondary,
                                      fontSize: 10,
                                      marginTop: 5,
                                    }}
                                  >
                                    {item.tracksCount} tracks
                                  </Text>
                                )}
                              </Pressable>
                            ))}
                          </ScrollView>
                        )}
                      </>
                    )}
                  </>
                ))}
            </ScrollView>
          )}
        </Surface>
      </KeyboardAvoidingView>
    </Modal>
  );
};
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    height: '88%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 30,
  },
  handle: { width: 34, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  close: {
    height: 42,
    width: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imports: { flexDirection: 'row', gap: 10, marginTop: 20, marginBottom: 14 },
  import: { flex: 1, paddingVertical: 22, borderRadius: 20, alignItems: 'center' },
});
