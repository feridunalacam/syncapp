import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { musicArtworkUrls } from '../src/domain/musicArtwork.js';
import { resolveRoundAudio } from '../src/domain/audio.js';
import { useMusicSearch } from '../src/hooks/useMusicSearch.js';
import { normalizeRoutine, validateRoutine } from '../src/domain/routines.js';
import { normalizeAlertConfig } from '../src/domain/alerts.js';
import { createAppleMusicService } from '../src/services/appleMusic/adapter.js';
import { createAutoRefresh } from '../src/lib/autoRefresh.js';

const { transformSync } = createRequire(import.meta.url)('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const template = 'https://is1-ssl.mzstatic.com/image/thumb/cover/{w}x{h}bb.{f}';
const repaired = 'https://is1-ssl.mzstatic.com/image/thumb/cover/88x88bb.jpg';
const fallback = 'https://is1-ssl.mzstatic.com/image/thumb/playlist/300x300bb.jpg';

function load(relative, name, overrides = {}) {
  const body = readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/^export default function/gm, 'function')
    .replace(/^export /gm, '');
  const code = transformSync(`${body}\nglobalThis.Component = ${name};`, {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
  const scope = {
    ...React,
    React,
    View: 'View',
    Text: 'Text',
    Image: 'Image',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    TextInput: 'TextInput',
    ActivityIndicator: 'ActivityIndicator',
    Modal: 'Modal',
    KeyboardAvoidingView: 'KeyboardAvoidingView',
    Platform: { OS: 'ios' },
    Ionicons: 'Icon',
    Surface: 'Surface',
    GlassSurface: 'GlassSurface',
    DurationField: 'DurationField',
    PlaybackProgress: 'PlaybackProgress',
    StyleSheet: { create: (value) => value, absoluteFillObject: { position: 'absolute' } },
    PixelRatio: { get: () => 2 },
    useTheme: () => ({ theme: {} }),
    musicArtworkUrls,
    WEB_MEDIA_IMPORT_AVAILABLE: true,
    resolveRoundAudio,
    normalizeRoutine,
    validateRoutine,
    normalizeAlertConfig,
    Alert: {
      alert: (title, message) => {
        throw new Error(`${title}: ${message}`);
      },
    },
    ...overrides,
  };
  new Script(code).runInNewContext(scope);
  return scope.Component;
}
const MusicArtwork = load('components/common/MusicArtwork.js', 'MusicArtwork');
const pickerParts = load(
  'screens/Routine/components/musicSearch/MusicPickerParts.js',
  '{ Artwork, MusicRow, PickerTabs, PickerState, PrimaryAction, SearchField }',
  { MusicArtwork },
);
async function mount(t, Component, props) {
  let root;
  await act(async () => {
    root = create(React.createElement(Component, props));
  });
  t.after(async () => act(async () => root.unmount()));
  return root;
}

test('artwork supports native, saved, and Spotify metadata without accepting empty values', () => {
  assert.deepEqual(
    musicArtworkUrls({ image: ' ', coverUrl: null, artwork: { url: template } }, 88),
    [repaired],
  );
  assert.deepEqual(musicArtworkUrls({ album: { images: [{ url: fallback }] } }), [fallback]);
  assert.deepEqual(musicArtworkUrls({ images: [{ url: fallback }], image: fallback }), [fallback]);
  assert.deepEqual(musicArtworkUrls({ image: { invalid: true } }), []);
});

test('artwork repairs MusicKit format tokens in already saved URLs and clamps requested dimensions', () => {
  assert.deepEqual(musicArtworkUrls('https://is1-ssl.mzstatic.com/300x300bb.%7Bf%7D'), [
    'https://is1-ssl.mzstatic.com/300x300bb.jpg',
  ]);
  assert.deepEqual(musicArtworkUrls(template, 99999), [
    'https://is1-ssl.mzstatic.com/image/thumb/cover/1200x1200bb.jpg',
  ]);
  assert.deepEqual(musicArtworkUrls(template.replaceAll('{', '%7B').replaceAll('}', '%7D'), 88), [
    repaired,
  ]);
});

test('a failed cover tries the playlist cover and keeps a placeholder; changing songs retries cleanly', async (t) => {
  const root = await mount(t, MusicArtwork, {
    item: { image: template },
    fallbackItem: { image: fallback },
  });
  assert.equal(root.root.findByType('Image').props.source.uri, repaired);
  const staleFailure = root.root.findByType('Image').props.onError;
  await act(async () => staleFailure());
  assert.equal(root.root.findByType('Image').props.source.uri, fallback);
  await act(async () => root.root.findByType('Image').props.onError());
  assert.equal(root.root.findAllByType('Image').length, 0);
  assert.equal(root.root.findAllByType('Icon').length, 1);
  await act(async () =>
    root.update(
      React.createElement(MusicArtwork, { item: { image: 'https://example.org/new.jpg' } }),
    ),
  );
  await act(async () => staleFailure());
  assert.equal(root.root.findByType('Image').props.source.uri, 'https://example.org/new.jpg');
});

test('round editor displays both shuffled song covers and selected playlist covers', async (t) => {
  const RoundEditor = load('screens/Routine/components/RoundEditor.js', 'RoundEditor', {
    MusicArtwork,
  });
  const root = await mount(t, RoundEditor, {
    roundNum: 1,
    workSec: 30,
    restSec: 10,
    workSong: { name: 'Song', image: template },
    restPlaylist: { name: 'Playlist', image: fallback },
  });
  assert.deepEqual(
    root.root.findAllByType('Image').map((node) => node.props.source.uri),
    ['https://is1-ssl.mzstatic.com/image/thumb/cover/56x56bb.jpg', fallback],
  );
});

test('player preview uses the selected playlist cover until current track artwork is available', async (t) => {
  const Preview = load('screens/Home/components/MusicPlayerPreview.js', 'MusicPlayerPreview', {
    MusicArtwork,
  });
  const root = await mount(t, Preview, {
    selectedRoutine: {
      roundAudioOnly: true,
      roundsData: [
        { workPlaylistId: 'p.1', workPlaylistName: 'Workout', workPlaylistImage: fallback },
      ],
    },
    currentRound: 1,
    currentPhase: 'work',
    track: { title: 'Playing song', coverUrl: template },
  });
  assert.equal(
    root.root.findByType('Image').props.source.uri,
    'https://is1-ssl.mzstatic.com/image/thumb/cover/92x92bb.jpg',
  );
  await act(async () => root.root.findByType('Image').props.onError());
  assert.equal(root.root.findByType('Image').props.source.uri, fallback);
});

test('Apple playlist shuffle preserves per-song artwork through saving and reopening a routine', async (t) => {
  const useRoutineForm = load('screens/Routine/hooks/useRoutineForm.js', 'useRoutineForm');
  let music, form, saved;
  function Harness({ routine }) {
    music = useMusicSearch({
      connectedPlatforms: { appleMusic: { connected: true, authentication: 'native' } },
      getValidAccessToken: async () => 'native:appleMusic',
      services: {
        appleMusic: {
          getPlaylistTracks: async () =>
            [1, 2].map((id) => ({
              id: String(id),
              uri: `apple-music:song:${id}`,
              name: `Song ${id}`,
              image: template,
            })),
        },
      },
    });
    form = useRoutineForm({
      templateRoutine: routine,
      updateRoutine: (value) => {
        saved = value;
      },
    });
    return null;
  }
  const root = await mount(t, Harness, {
    routine: normalizeRoutine({ id: 'artwork', name: 'Covers', rounds: 2 }),
  });
  let assignments;
  await act(async () => {
    assignments = await music.shufflePlaylistForRounds('p.1', 'appleMusic', [1, 2]);
  });
  await act(async () => form.handleShuffleForWork({ id: 'p.1' }, assignments));
  await act(async () => form.handleSaveRoutine());
  for (const round of saved.roundsData) {
    assert.equal(round.workSong.platform, 'appleMusic');
    assert.equal(musicArtworkUrls(round.workSong, 88)[0], repaired);
  }
  await act(async () => root.update(React.createElement(Harness, { routine: saved })));
  assert.equal(musicArtworkUrls(form.roundWorkSongs[1], 88)[0], repaired);
});

function applePickerFixture() {
  const playlist = {
    id: 'p.library',
    name: 'My workout',
    type: 'playlist',
    platform: 'appleMusic',
    image: fallback.replace('.jpg', '.%7Bf%7D'),
  };
  const songs = [1, 2].map((id) => ({
    id: String(id),
    name: `Song ${id}`,
    type: 'track',
    uri: `apple-music:song:${id}`,
    image: template.replace('cover/', `cover${id}/`),
  }));
  const service = createAppleMusicService({
    supported: true,
    getConnectionState: async () => ({ status: 'authorized', canPlayCatalogContent: true }),
    getUserPlaylists: async () => [playlist],
    getPlaylistTracks: async () => songs,
    search: async (_query, types) => ({
      tracks: types.includes('track') ? songs : [],
      playlists: types.includes('playlist') ? [playlist] : [],
    }),
  });
  const platform = {
    selectedPlatform: 'appleMusic',
    connectedPlatforms: { appleMusic: { connected: true, authentication: 'native' } },
    services: { appleMusic: service },
    getValidAccessToken: async () => (await service.getAccessToken()).accessToken,
  };
  let nextTimer = 0;
  const timers = new Map();
  const schedule = (callback, delay) => {
    timers.set(++nextTimer, { callback, delay });
    return nextTimer;
  };
  const cancel = (id) => timers.delete(id);
  return {
    playlist,
    songs,
    async search() {
      for (const [id, timer] of [...timers]) {
        if (timer.delay > 300) continue;
        timers.delete(id);
        await timer.callback();
      }
    },
    overrides: {
      ...pickerParts,
      usePlatformContext: () => platform,
      useMusicSearch,
      useSpotifyConnection: () => ({ available: false }),
      useAppleMusicConnection: () => ({ available: true, ready: true, connected: true }),
      useDeviceMediaPicker: () => ({}),
      loadDeviceMusic: async () => [],
      DEFAULT_VOICES: [],
      BrowserAudioPanel: 'BrowserAudioPanel',
      setTimeout: schedule,
      clearTimeout: cancel,
      useFocusEffect: (callback) => React.useEffect(callback, [callback]),
      AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
      createAutoRefresh: (refresh) => createAutoRefresh(refresh, { schedule, cancel }),
      Sheet: ({ visible, children }) =>
        visible ? React.createElement('Sheet', null, children) : null,
    },
  };
}

test('Apple music picker renders covers in song search, playlist search, library and playlist detail', async (t) => {
  const fixture = applePickerFixture();
  const Picker = load(
    'screens/Routine/components/MusicSearchModal.js',
    'MusicSearchModal',
    fixture.overrides,
  );
  let chosen;
  const props = {
    visible: true,
    selectedRoundForSong: 1,
    songType: 'work',
    onClose() {},
    attachSongToRound: (_round, item) => {
      chosen = item;
    },
    attachPlaylistToRound: (_round, item) => {
      chosen = item;
    },
  };
  const root = await mount(t, Picker, props);
  const images = () => root.root.findAllByType('Image').map((node) => node.props.source.uri);
  const press = (label) =>
    root.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === label)
      .props.onPress();
  assert.deepEqual(images(), [fallback], 'saved playlist cover is repaired before selection');
  await act(async () => press('Browse My workout'));
  assert.deepEqual(images(), [
    fallback,
    ...[1, 2].map((id) => `https://is1-ssl.mzstatic.com/image/thumb/cover${id}/88x88bb.jpg`),
  ]);
  await act(async () => root.root.findByType(pickerParts.PrimaryAction).props.onPress());
  assert.equal(chosen.id, 'p.library');
  assert.equal(musicArtworkUrls(chosen)[0], fallback);
  await act(async () => root.update(React.createElement(Picker, { ...props, visible: false })));
  await act(async () => root.update(React.createElement(Picker, props)));
  await act(async () => root.root.findByType(pickerParts.SearchField).props.onChange('workout'));
  await act(async () => fixture.search());
  assert.deepEqual(
    images(),
    [1, 2].map((id) => `https://is1-ssl.mzstatic.com/image/thumb/cover${id}/88x88bb.jpg`),
  );
  await act(async () => press('Choose Song 1'));
  assert.equal(chosen.uri, 'apple-music:song:1');
  assert.equal(chosen.platform, 'appleMusic');
  await act(async () =>
    root.root
      .findAllByType(pickerParts.PickerTabs)
      .find((node) => node.props.value === 'track')
      .props.onChange('playlist'),
  );
  await act(async () => fixture.search());
  assert.deepEqual(images(), [fallback], 'catalog playlist search uses the same repaired cover');
});

test('shuffle card renders library/search/detail covers and passes artwork to assigned rounds', async (t) => {
  const fixture = applePickerFixture();
  const Card = load(
    'screens/Routine/components/PlaylistCard.js',
    'PlaylistCard',
    fixture.overrides,
  );
  let assignments;
  const root = await mount(t, Card, {
    platformId: 'appleMusic',
    roundsOrder: [1, 2],
    onShuffleForWork: (_playlist, songs) => {
      assignments = songs;
    },
  });
  const press = (label) =>
    root.root
      .findAllByType('Pressable')
      .find((node) => node.props.accessibilityLabel === label)
      .props.onPress();
  assert.equal(root.root.findByType('Image').props.source.uri, fallback);
  await act(async () => root.root.findByType(pickerParts.SearchField).props.onChange('workout'));
  await act(async () => fixture.search());
  assert.equal(root.root.findByType('Image').props.source.uri, fallback);
  await act(async () => press('View My workout tracks'));
  assert.deepEqual(
    root.root.findAllByType('Image').map((node) => node.props.source.uri),
    [
      fallback,
      ...[1, 2].map((id) => `https://is1-ssl.mzstatic.com/image/thumb/cover${id}/88x88bb.jpg`),
    ],
  );
  await act(async () => press('Shuffle for work'));
  assert.equal(Object.keys(assignments).length, 2);
  assert.deepEqual(
    Object.values(assignments)
      .flatMap((song) => musicArtworkUrls(song, 88))
      .sort(),
    [1, 2].map((id) => `https://is1-ssl.mzstatic.com/image/thumb/cover${id}/88x88bb.jpg`),
  );
});
