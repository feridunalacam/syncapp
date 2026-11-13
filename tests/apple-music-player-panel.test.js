import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { musicArtworkUrls } from '../src/domain/musicArtwork.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const artworkHookScript = new Script(
  readFileSync(new URL('../src/hooks/usePlaylistArtwork.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace('export default function', 'function') +
    '\nglobalThis.usePlaylistArtwork = usePlaylistArtwork;',
);
const source = readFileSync(
  new URL('../src/components/common/AppleMusicPlayerPanel.js', import.meta.url),
  'utf8',
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
  .replace('export default function AppleMusicPlayerPanel', 'function AppleMusicPlayerPanel')
  .replace('export function AppleMusicMiniPlayer', 'function AppleMusicMiniPlayer');
const compiled = transformSync(
  `${source}\nglobalThis.Panel = AppleMusicPlayerPanel;\nglobalThis.Mini = AppleMusicMiniPlayer;`,
  { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] },
).code;
const song = {
  id: 'song-1',
  uri: 'apple-music:song:song-1',
  name: 'First Song',
  artists: [{ name: 'First Artist' }, { name: 'Guest Artist' }],
  album: { images: [{ url: 'https://example.com/first-artwork.jpg' }] },
  duration_ms: 180000,
};
const playlist = {
  id: 'list-1',
  name: 'Full Playlist',
  images: [{ url: 'https://example.com/playlist.jpg' }],
};
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const textOf = (node) => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node?.children || []).map(textOf).join('');
};

async function mount(t, { connection = {}, player: playerOverrides = {}, mini = false } = {}) {
  const events = [];
  const requests = [];
  const timers = new Map();
  const artworkRenders = [];
  let timerId = 0;
  const read = (kind, ...args) => {
    const pending = deferred();
    requests.push({ kind, args, ...pending });
    return pending.promise;
  };
  const action = (name) => async (value) => {
    events.push({ name, value });
    return { success: true };
  };
  const player = {
    visible: true,
    busy: false,
    reserved: false,
    ownsQueue: false,
    previousOwnerPending: false,
    playing: false,
    track: null,
    progress: 0,
    error: null,
    shuffle: false,
    repeat: 'off',
    open: action('open'),
    close: action('close'),
    playTrack: action('playTrack'),
    playPlaylist: action('playPlaylist'),
    pause: action('pause'),
    resume: action('resume'),
    next: action('next'),
    previous: action('previous'),
    setShuffle: action('shuffle'),
    setRepeat: action('repeat'),
    clear: action('clear'),
    ...playerOverrides,
  };
  const apple = {
    available: true,
    companionAvailable: true,
    timedAvailable: false,
    connected: true,
    connecting: false,
    ready: true,
    error: null,
    connect: action('connect'),
    disconnect: action('disconnect'),
    search: (...args) => read('search', ...args),
    getPlaylists: (...args) => read('library', ...args),
    getPlaylistTracks: (...args) => read('tracks', ...args),
    getPlaylistArtwork: (...args) => read('artwork', ...args),
    ...connection,
    player,
  };
  // Model a bounded native FlatList window rather than eagerly rendering its data.
  // Tests can move that window just as a scroll would reveal later cells.
  const FlatList = React.forwardRef(function VirtualizedList(props, ref) {
    const [firstIndex, setFirstIndex] = React.useState(0);
    React.useImperativeHandle(ref, () => ({ scrollToOffset: () => setFirstIndex(0) }), []);
    const limit = props.initialNumToRender;
    assert.ok(Number.isInteger(limit) && limit > 0, 'FlatList initial window is explicit');
    return React.createElement(
      'FlatList',
      { ...props, testScrollToIndex: setFirstIndex },
      props.ListHeaderComponent,
      props.data.slice(firstIndex, firstIndex + limit).map((item, offset) => {
        const index = firstIndex + offset;
        return React.createElement(
          React.Fragment,
          { key: props.keyExtractor(item, index) },
          props.renderItem({ item, index }),
        );
      }),
      props.ListFooterComponent,
    );
  });
  const context = {
    ...React,
    React,
    musicArtworkUrls,
    useAppleMusicConnection: () => apple,
    useTheme: () => ({
      theme: { text: '#111', textSecondary: '#555', accent: '#345', error: '#f00' },
    }),
    ActivityIndicator: 'ActivityIndicator',
    FlatList,
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
    Ionicons: 'Icon',
    MusicArtwork: (props) => {
      artworkRenders.push(props.item?.id);
      return React.createElement('MusicArtwork', props);
    },
    StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
    Sheet: ({ visible, onClose, children }) =>
      React.createElement('Sheet', { visible, onClose }, visible ? children : null),
    setTimeout(callback) {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  artworkHookScript.runInNewContext(context);
  new Script(compiled).runInNewContext(context);
  const Component = mini ? context.Mini : context.Panel;
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Component));
  });
  let unmounted = false;
  const unmount = async () => {
    if (unmounted) return;
    unmounted = true;
    await act(async () => renderer.unmount());
  };
  t.after(unmount);
  const ui = {
    events,
    requests,
    timers,
    artworkRenders,
    apple,
    player,
    unmount,
    text: () => textOf(renderer.toJSON()),
    output: () => renderer.toJSON(),
    button: (label) =>
      renderer.root
        .findAllByType('Pressable')
        .find((node) => node.props.accessibilityLabel === label),
    nodes: (type) => renderer.root.findAllByType(type),
    async press(label) {
      await act(async () => {
        const button = ui.button(label);
        assert.ok(button, `Missing button: ${label}`);
        if (!button.props.disabled) void button.props.onPress();
      });
    },
    async fill(value) {
      await act(async () =>
        renderer.root
          .findByProps({ accessibilityLabel: 'Search Apple Music' })
          .props.onChangeText(value),
      );
    },
    async scrollListTo(index) {
      await act(async () => renderer.root.findByType('FlatList').props.testScrollToIndex(index));
    },
    async viewable(...indices) {
      await act(async () => {
        const list = renderer.root.findByType('FlatList');
        list.props.onViewableItemsChanged({
          viewableItems: indices.map((index) => ({
            item: list.props.data[index],
            isViewable: true,
          })),
        });
      });
    },
    async failArtwork(id) {
      await act(async () =>
        renderer.root
          .findAllByType('MusicArtwork')
          .find((node) => node.props.item?.id === id || node.props.fallbackItem?.id === id)
          .props.onUnavailable(),
      );
    },
    async tick() {
      const pending = [...timers.entries()];
      await act(async () => {
        for (const [id, callback] of pending) {
          if (!timers.delete(id)) continue;
          void callback();
        }
      });
    },
    async resolve(index, result) {
      await act(async () => requests[index].resolve(result));
    },
    async reject(index, error) {
      await act(async () => requests[index].reject(error));
    },
    async update(values = {}, playerValues = {}) {
      Object.assign(apple, values);
      Object.assign(player, playerValues);
      await act(async () => renderer.update(React.createElement(Component)));
    },
    async closeSheet() {
      await act(async () => renderer.root.findByType('Sheet').props.onClose());
    },
  };
  return ui;
}

test('guest companion searches both catalog kinds and only explicit Play starts a selected full track', async (t) => {
  const ui = await mount(t);
  assert.match(ui.text(), /Available without a Sync account/);
  assert.match(ui.text(), /independently of round assignments/);
  assert.match(ui.text(), /chosen alerts pause music/);
  await ui.fill('First');
  assert.equal(ui.requests.length, 0);
  assert.match(ui.text(), /Searching Apple Music/);
  await ui.tick();
  assert.equal(ui.requests[0].kind, 'search');
  assert.equal(ui.requests[0].args[0], 'First');
  assert.deepEqual(Array.from(ui.requests[0].args[1]), ['track', 'playlist']);
  assert.equal(ui.requests[0].args[2], 30);
  await ui.resolve(0, { tracks: { items: [song] }, playlists: { items: [playlist] } });
  assert.match(ui.text(), /First Artist, Guest Artist/);
  assert.ok(
    ui
      .nodes('MusicArtwork')
      .some((node) => node.props.item.album?.images[0].url === song.album.images[0].url),
  );
  await ui.press('Select track First Song');
  assert.deepEqual(ui.events, []);
  await ui.press('Play track');
  assert.equal(ui.events.length, 1);
  assert.equal(ui.events[0].name, 'playTrack');
  assert.equal(ui.events[0].value.id, song.id);
  assert.equal(ui.events[0].value.duration_ms, 180000);
});

test('browsing a library playlist and its tracks never starts playback; Play receives the full playlist', async (t) => {
  const ui = await mount(t);
  await ui.press('My playlists');
  assert.equal(ui.requests[0].kind, 'library');
  assert.match(ui.text(), /Loading playlists/);
  await ui.resolve(0, [playlist]);
  await ui.press('Select playlist Full Playlist');
  assert.equal(ui.requests[1].kind, 'tracks');
  assert.equal(ui.requests[1].args[0], playlist.id);
  assert.deepEqual(ui.events, []);
  await ui.resolve(1, { items: [song] });
  await ui.press('Play playlist');
  assert.equal(ui.events[0].name, 'playPlaylist');
  assert.equal(ui.events[0].value.id, playlist.id);
  assert.equal(ui.events[0].value.name, playlist.name);
  await ui.press('Select track First Song');
  assert.equal(ui.events.length, 1);
  await ui.press('Play track');
  assert.equal(ui.events[1].name, 'playTrack');
});

test('large libraries and playlists keep all items reachable through one bounded virtualized list', async (t) => {
  const ui = await mount(t, { player: { ownsQueue: true, track: song } });
  const playlists = Array.from({ length: 1000 }, (_, index) => ({
    ...playlist,
    id: `large-playlist-${index}`,
    name: `Playlist ${index}`,
  }));
  await ui.press('My playlists');
  await ui.resolve(0, playlists);
  assert.equal(ui.nodes('FlatList').length, 1);
  assert.equal(ui.nodes('ScrollView').length, 0);
  const list = ui.nodes('FlatList')[0];
  assert.equal(list.props.data.length, 1000, 'virtualization never truncates the library');
  assert.equal(list.props.initialNumToRender, 8);
  assert.equal(list.props.maxToRenderPerBatch, 8);
  assert.equal(list.props.windowSize, 5);
  const visibleRows = (kind) =>
    ui
      .nodes('Pressable')
      .filter((node) => node.props.accessibilityLabel?.startsWith(`Select ${kind} `));
  assert.equal(visibleRows('playlist').length, 8);
  assert.equal(ui.button('Select playlist Playlist 999'), undefined);
  const libraryArtworkRenders = () =>
    ui.artworkRenders.filter((id) => id?.startsWith('large-playlist-')).length;
  assert.equal(libraryArtworkRenders(), 8);
  await ui.update({}, { progress: 25 });
  await ui.update({}, { progress: 26 });
  assert.equal(
    libraryArtworkRenders(),
    8,
    'playback polling does not rerender unchanged artwork rows',
  );
  await ui.scrollListTo(992);
  assert.equal(visibleRows('playlist').length, 8);
  await ui.press('Select playlist Playlist 999');
  assert.deepEqual(ui.events, [], 'revealing and selecting a late item never starts music');
  assert.equal(ui.requests[1].args[0], 'large-playlist-999');
  await ui.press('Play playlist');
  assert.equal(ui.events[0].name, 'playPlaylist');
  assert.equal(ui.events[0].value.id, 'large-playlist-999');
  const tracks = Array.from({ length: 1000 }, (_, index) => ({
    ...song,
    id: `large-track-${index}`,
    name: `Track ${index}`,
  }));
  await ui.resolve(1, tracks);
  assert.equal(ui.nodes('FlatList')[0].props.data.length, 1000);
  assert.equal(visibleRows('track').length, 8);
  await ui.scrollListTo(992);
  await ui.press('Select track Track 999');
  assert.equal(ui.events.length, 1);
  assert.equal(visibleRows('track').length, 8);
  await ui.press('Play track');
  assert.equal(ui.events[1].name, 'playTrack');
  assert.equal(ui.events[1].value.id, 'large-track-999');
});

test('repeated playlist songs have unique occurrence keys and remain selectable without changing full-playlist playback', async (t) => {
  const ui = await mount(t);
  await ui.press('My playlists');
  await ui.resolve(0, [playlist]);
  await ui.press('Select playlist Full Playlist');
  await ui.resolve(1, [song, { ...song, id: 'other-song', name: 'Other Song' }, song]);
  const list = ui.nodes('FlatList')[0];
  assert.deepEqual(
    Array.from(list.props.data, (item) => item.id),
    ['song-1', 'other-song', 'song-1'],
  );
  const keys = Array.from(list.props.data, (item, index) => list.props.keyExtractor(item, index));
  assert.equal(keys.length, 3);
  assert.equal(new Set(keys).size, 3, 'each song occurrence has its own virtualized cell key');
  const repeatedRows = ui
    .nodes('Pressable')
    .filter((node) => node.props.accessibilityLabel === 'Select track First Song');
  assert.equal(repeatedRows.length, 2);
  assert.deepEqual(ui.events, []);
  await ui.press('Play playlist');
  assert.equal(ui.events[0].name, 'playPlaylist');
  assert.equal(ui.events[0].value.id, playlist.id);
  await act(async () => repeatedRows[1].props.onPress());
  assert.equal(ui.events.length, 1, 'selecting the repeated occurrence does not auto-play');
  await ui.press('Play track');
  assert.equal(ui.events[1].name, 'playTrack');
  assert.equal(ui.events[1].value.id, song.id);
  assert.equal(ui.nodes('FlatList')[0].props.data.length, 3, 'no song occurrence is removed');
});

test('playback polling preserves the list header search field, query and explicit selection', async (t) => {
  const ui = await mount(t, { player: { ownsQueue: true, track: song } });
  const input = ui.nodes('TextInput')[0];
  await ui.fill('First');
  await ui.tick();
  await ui.resolve(0, { tracks: [song] });
  await ui.press('Select track First Song');
  const header = ui.nodes('FlatList')[0].props.ListHeaderComponent;
  assert.equal(
    React.isValidElement(header),
    true,
    'header is an element, not a remounting component factory',
  );
  await ui.update({}, { progress: 20, track: { ...song, name: 'Current metadata update' } });
  await ui.update({}, { progress: 21 });
  assert.equal(
    ui.nodes('TextInput')[0],
    input,
    'polling preserves the mounted native search field',
  );
  assert.equal(input.props.value, 'First');
  assert.ok(ui.button('Play track'));
  assert.equal(ui.requests.length, 1, 'polling does not restart a completed catalog read');
  assert.deepEqual(ui.events, []);
  await ui.press('Play track');
  assert.equal(
    ui.events[0].value.name,
    'First Song',
    'explicit selection survives current-track metadata changes',
  );
});

test('visible library cover enrichment matches exact IDs and never alters playlist order or explicit playback selection', async (t) => {
  const ui = await mount(t);
  const rows = [
    { id: 'p.one', name: 'Same playlist' },
    { id: 'p.two', name: 'Same playlist' },
    { id: 'purchased', name: 'Purchased Music' },
  ];
  await ui.press('My playlists');
  await ui.resolve(0, rows);
  const callback = ui.nodes('FlatList')[0].props.onViewableItemsChanged;
  await ui.viewable(0, 2);
  await ui.tick();
  assert.equal(ui.requests[1].kind, 'artwork');
  assert.deepEqual(Array.from(ui.requests[1].args[0]), ['p.one']);
  await ui.resolve(1, [
    { id: 'p.two', image: 'https://example.test/wrong.jpg' },
    { id: 'p.one', image: 'https://example.test/found.jpg', name: 'Wrong title' },
  ]);
  const cover = ui.nodes('MusicArtwork').find((node) => node.props.fallbackItem?.id === 'p.one');
  assert.equal(cover.props.item.image, 'https://example.test/found.jpg');
  assert.ok(
    ui
      .nodes('MusicArtwork')
      .some((node) => node.props.item?.id === 'p.two' && !node.props.item.image),
  );
  assert.deepEqual(
    Array.from(ui.nodes('FlatList')[0].props.data, (item) => item.id),
    ['p.one', 'p.two', 'purchased'],
  );
  assert.equal(ui.nodes('FlatList')[0].props.onViewableItemsChanged, callback);
  assert.deepEqual(
    ui.requests.map((request) => request.kind),
    ['library', 'artwork'],
    'enrichment never fetches playlist tracks or searches the catalog',
  );
  assert.deepEqual(ui.events, []);
  await ui.press('Select playlist Same playlist');
  await ui.press('Play playlist');
  assert.equal(ui.events[0].name, 'playPlaylist');
  assert.equal(ui.events[0].value.id, 'p.one');
  assert.equal(ui.events[0].value.name, 'Same playlist');
  assert.equal(
    ui.events[0].value.image,
    undefined,
    'the memory-only cover never changes the selected native item',
  );
});

test('failed existing library URLs can request one replacement while optional old-binary artwork stays silent', async (t) => {
  const ui = await mount(t);
  await ui.press('My playlists');
  await ui.resolve(0, [
    { id: 'p.broken', name: 'Broken cover', image: 'https://example.test/broken.jpg' },
  ]);
  await ui.viewable(0);
  await ui.tick();
  assert.equal(ui.requests.length, 1);
  await ui.failArtwork('p.broken');
  await ui.tick();
  assert.deepEqual(Array.from(ui.requests[1].args[0]), ['p.broken']);
  await ui.resolve(1, []);
  await ui.failArtwork('p.broken');
  await ui.viewable(0);
  await ui.tick();
  assert.equal(ui.requests.length, 2, 'empty optional results cannot cause an automatic retry');
  const older = await mount(t, { connection: { getPlaylistArtwork: undefined } });
  await older.press('My playlists');
  await older.resolve(0, [{ id: 'p.old', name: 'Old binary playlist' }]);
  await older.viewable(0);
  await older.tick();
  assert.equal(older.requests.length, 1);
  assert.deepEqual(older.events, []);
});

test('closing the player retires queued enrichment without a native artwork request', async (t) => {
  const ui = await mount(t);
  await ui.press('My playlists');
  await ui.resolve(0, [{ id: 'p.one', name: 'Library playlist' }]);
  await ui.viewable(0);
  await ui.closeSheet();
  await ui.update({}, { visible: false });
  await ui.tick();
  assert.deepEqual(
    ui.requests.map((request) => request.kind),
    ['library'],
  );
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['close'],
  );
});

test('a newer query wins over slow search results and duplicate tab presses keep its request alive', async (t) => {
  const ui = await mount(t);
  await ui.fill('old');
  await ui.tick();
  await ui.fill('new');
  await ui.tick();
  await ui.press('Search catalog');
  await ui.resolve(1, { tracks: [{ ...song, name: 'Newest result' }] });
  await ui.resolve(0, { tracks: [{ ...song, name: 'Stale result' }] });
  assert.match(ui.text(), /Newest result/);
  assert.doesNotMatch(ui.text(), /Stale result/);
  assert.deepEqual(ui.events, []);
});

test('closing retires pending search and browsing reads without stopping or clearing an owned queue', async (t) => {
  const ui = await mount(t, { player: { ownsQueue: true, track: song, playing: true } });
  await ui.fill('old');
  await ui.tick();
  await ui.closeSheet();
  await ui.update({}, { visible: false });
  await ui.resolve(0, { tracks: [{ ...song, name: 'Closed result' }] });
  assert.equal(ui.text(), '');
  await ui.update({}, { visible: true });
  assert.doesNotMatch(ui.text(), /Closed result/);
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['close'],
  );
  await ui.press('My playlists');
  await ui.resolve(1, { items: [playlist] });
  await ui.press('Select playlist Full Playlist');
  await ui.press('Back to results');
  await ui.resolve(2, [song]);
  assert.equal(ui.button('Select track First Song'), undefined);
  await ui.unmount();
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['close'],
  );
});

test('search failure is readable and retry ignores the failed request generation', async (t) => {
  const ui = await mount(t);
  await ui.fill('Song');
  await ui.tick();
  await ui.reject(0, { userMessage: 'Apple Music is offline. Try again.' });
  assert.match(ui.text(), /Apple Music is offline/);
  assert.ok(ui.nodes('Text').some((node) => node.props.accessibilityRole === 'alert'));
  await ui.press('Try again');
  assert.match(ui.text(), /Searching Apple Music/);
  await ui.tick();
  await ui.resolve(1, { tracks: [song] });
  assert.match(ui.text(), /First Song/);
  assert.doesNotMatch(ui.text(), /offline/);
});

test('denied access and subscription failures remain actionable without an account or Pro gate', async (t) => {
  const ui = await mount(t, {
    connection: {
      connected: false,
      error: 'Allow Music access for Sync in Settings to connect Apple Music.',
    },
  });
  assert.match(ui.text(), /Allow Music access/);
  assert.match(ui.text(), /Apple Music subscription and Music access required/);
  assert.ok(ui.button('Connect Apple Music'));
  assert.equal(ui.requests.length, 0);
  await ui.press('Connect Apple Music');
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['connect'],
  );
  await ui.update({
    error: 'An active Apple Music subscription is required to play catalog songs.',
  });
  assert.match(ui.text(), /active Apple Music subscription/);
  assert.equal(ui.button('Connect Apple Music').props.disabled, false);
  await ui.update({ connecting: true });
  assert.match(ui.text(), /Connecting to Apple Music/);
  assert.equal(ui.button('Connect Apple Music'), undefined);
});

test('owned queue standard controls use companion actions and repeat modes with no automatic transport', async (t) => {
  const ui = await mount(t, {
    player: { ownsQueue: true, track: song, playing: true, progress: 47 },
  });
  assert.deepEqual(ui.events, []);
  const progress = ui.nodes('View').find((node) => node.props.accessibilityRole === 'progressbar');
  assert.equal(progress.props.accessibilityValue.now, 47);
  await ui.press('Previous track');
  await ui.press('Pause Apple Music');
  await ui.update({}, { playing: false });
  await ui.press('Resume Apple Music');
  await ui.press('Next track');
  await ui.press('Turn shuffle on');
  await ui.press('Repeat: Off');
  await ui.update({}, { repeat: 'context', shuffle: true });
  await ui.press('Turn shuffle off');
  await ui.press('Repeat: All');
  await ui.update({}, { repeat: 'track' });
  await ui.press('Repeat: One');
  await ui.press('Stop and clear');
  await ui.press('Disconnect Apple Music');
  assert.deepEqual(
    ui.events.map((event) => event.name),
    [
      'previous',
      'pause',
      'resume',
      'next',
      'shuffle',
      'repeat',
      'shuffle',
      'repeat',
      'repeat',
      'clear',
      'disconnect',
    ],
  );
  assert.deepEqual(
    ui.events.filter((event) => event.name === 'repeat').map((event) => event.value),
    ['context', 'track', 'off'],
  );
  assert.deepEqual(
    ui.events.filter((event) => event.name === 'shuffle').map((event) => event.value),
    [true, false],
  );
});

test('busy queues disable transport and explicit Play while Stop and clear can cancel preparation', async (t) => {
  const ui = await mount(t);
  await ui.fill('First');
  await ui.tick();
  await ui.resolve(0, { tracks: [song] });
  await ui.press('Select track First Song');
  await ui.update({}, { reserved: true, busy: true });
  assert.match(ui.text(), /Preparing music/);
  assert.equal(ui.button('Next track').props.disabled, true);
  assert.equal(ui.button('Play track').props.disabled, true);
  assert.equal(ui.button('Stop and clear').props.disabled, false);
  await ui.press('Next track');
  await ui.press('Play track');
  await ui.press('Stop and clear');
  await ui.press('Disconnect Apple Music');
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['clear', 'disconnect'],
  );
});

test('library and playlist failures can retry while disconnect retires pending library results', async (t) => {
  const ui = await mount(t);
  await ui.press('My playlists');
  await ui.reject(0, { userMessage: 'Your playlists could not be loaded.' });
  assert.match(ui.text(), /Your playlists could not be loaded/);
  await ui.press('Try again');
  await ui.resolve(1, { items: [playlist] });
  await ui.press('Select playlist Full Playlist');
  await ui.reject(2, { userMessage: 'Playlist tracks are unavailable.' });
  assert.match(ui.text(), /Playlist tracks are unavailable/);
  await ui.press('Try again');
  await ui.resolve(3, [song]);
  assert.ok(ui.button('Select track First Song'));
  await ui.press('Back to results');
  await ui.press('Disconnect Apple Music');
  await ui.update({ connected: false });
  await ui.resolve(4, [{ ...playlist, name: 'Disconnected playlist' }]);
  assert.doesNotMatch(ui.text(), /Disconnected playlist/);
  assert.ok(ui.button('Connect Apple Music'));
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['disconnect'],
  );
});

test('a rejected explicit playback request surfaces its message and allows retry', async (t) => {
  const ui = await mount(t, {
    player: {
      playTrack: async () => {
        throw { userMessage: 'This song is unavailable in your region.' };
      },
    },
  });
  await ui.fill('First');
  await ui.tick();
  await ui.resolve(0, { tracks: [song] });
  await ui.press('Select track First Song');
  await ui.press('Play track');
  assert.match(ui.text(), /unavailable in your region/);
  assert.equal(ui.button('Play track').props.disabled, false);
});

test('mini player remains visible for a paused owned queue and its controls only invoke companion playback', async (t) => {
  const ui = await mount(t, {
    mini: true,
    player: { ownsQueue: true, playing: false, track: song },
  });
  assert.match(ui.text(), /APPLE MUSICFirst SongFirst Artist, Guest Artist/);
  await ui.press('Resume Apple Music');
  await ui.update({}, { playing: true });
  await ui.press('Pause Apple Music');
  await ui.press('Open Apple Music player');
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['resume', 'pause', 'open'],
  );
  await ui.update({}, { ownsQueue: false, reserved: true, busy: true, track: null });
  assert.match(ui.text(), /Preparing music/);
  assert.equal(ui.button('Resume Apple Music'), undefined);
  await ui.update({}, { reserved: false, busy: false });
  assert.equal(ui.output(), null);
  await ui.unmount();
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['resume', 'pause', 'open'],
  );
});

test('disconnected or unready owned and reserved queues can be cleared without reconnecting', async (t) => {
  for (const ownership of ['ownsQueue', 'reserved']) {
    const ui = await mount(t, {
      connection: { connected: false, ready: ownership === 'ownsQueue' },
      player: { [ownership]: true, track: song, busy: ownership === 'reserved' },
    });
    assert.equal(ui.requests.length, 0);
    assert.equal(ui.button('Stop and clear').props.disabled, false);
    assert.equal(ui.button('Resume Apple Music').props.disabled, true);
    await ui.press('Resume Apple Music');
    await ui.press('Stop and clear');
    assert.deepEqual(
      ui.events.map((event) => event.name),
      ['clear'],
    );
  }
});

test('mini action errors are retired when a new track or a new playback reservation replaces the queue', async (t) => {
  const ui = await mount(t, {
    mini: true,
    player: {
      ownsQueue: true,
      track: song,
      resume: async () => ({ success: false, error: 'The previous resume failed.' }),
    },
  });
  await ui.press('Resume Apple Music');
  assert.match(ui.text(), /previous resume failed/);
  const replacement = { ...song, id: 'song-2', name: 'Second Song' };
  await ui.update({}, { track: replacement, playing: true, error: null });
  assert.match(ui.text(), /Second Song/);
  assert.doesNotMatch(ui.text(), /previous resume failed/);
  await ui.update({}, { playing: false });
  await ui.press('Resume Apple Music');
  assert.match(ui.text(), /previous resume failed/);
  await ui.update({}, { reserved: true, busy: true });
  await ui.update({}, { reserved: false, busy: false, playing: true });
  assert.doesNotMatch(ui.text(), /previous resume failed/);
  assert.equal(ui.button('Pause Apple Music').props.disabled, false);
});

test('a late mini action failure cannot replace metadata or lock controls on a newer queue', async (t) => {
  const oldResume = deferred();
  const ui = await mount(t, {
    mini: true,
    player: { ownsQueue: true, track: song, resume: () => oldResume.promise },
  });
  await ui.press('Resume Apple Music');
  assert.equal(ui.button('Resume Apple Music'), undefined);
  await ui.update({}, { track: { ...song, id: 'song-new', name: 'New Song' }, playing: true });
  assert.ok(ui.button('Pause Apple Music'));
  await act(async () => oldResume.resolve({ success: false, error: 'Obsolete resume failed.' }));
  assert.match(ui.text(), /New Song/);
  assert.doesNotMatch(ui.text(), /Obsolete resume failed/);
  await ui.press('Pause Apple Music');
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['pause'],
  );
});

test('the disconnected panel offers neutral previous queue recovery without old metadata', async (t) => {
  const ui = await mount(t, {
    connection: { connected: false },
    player: { previousOwnerPending: true, track: song, error: 'First Song failed.' },
  });
  assert.match(ui.text(), /previous Apple Music queue still needs to be cleared/);
  assert.doesNotMatch(ui.text(), /First Song|First Artist|Guest Artist/);
  assert.equal(ui.nodes('MusicArtwork').length, 0);
  assert.equal(ui.requests.length, 0);
  assert.equal(ui.button('Resume Apple Music'), undefined);
  assert.equal(ui.button('Stop and clear').props.disabled, false);
  await ui.update({ connected: true });
  assert.equal(ui.button('Search catalog'), undefined);
  assert.equal(ui.nodes('MusicArtwork').length, 0);
  await ui.press('Stop and clear');
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['clear'],
  );
});

test('previous queue mini player exposes Open and Clear without reconnecting or revealing metadata', async (t) => {
  const ui = await mount(t, {
    mini: true,
    connection: { connected: false, ready: false },
    player: { previousOwnerPending: true, busy: true, track: song, error: 'First Song failed.' },
  });
  assert.match(ui.text(), /previous Apple Music queue still needs to be cleared/);
  assert.doesNotMatch(ui.text(), /First Song|First Artist|Guest Artist/);
  assert.equal(ui.nodes('MusicArtwork').length, 0);
  assert.equal(ui.button('Resume Apple Music'), undefined);
  assert.equal(ui.button('Stop and clear').props.disabled, false);
  await ui.press('Open Apple Music player');
  await ui.press('Stop and clear');
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['open', 'clear'],
  );
  await ui.update({}, { previousOwnerPending: false, busy: false });
  assert.equal(ui.output(), null);
});

test('companion availability gates both surfaces independently of the legacy timed path', async (t) => {
  const panel = await mount(t, {
    connection: { companionAvailable: false, available: true, timedAvailable: true },
  });
  assert.equal(panel.output(), null);
  assert.equal(panel.requests.length, 0);
  const mini = await mount(t, {
    mini: true,
    connection: { companionAvailable: false, timedAvailable: true },
    player: { ownsQueue: true },
  });
  assert.equal(mini.output(), null);
  await panel.update({ companionAvailable: true, available: false, timedAvailable: false });
  assert.ok(panel.button('Search catalog'));
  assert.deepEqual(panel.events, []);
});
