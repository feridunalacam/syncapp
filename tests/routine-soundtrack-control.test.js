import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(
  new URL('../src/components/common/RoutineSoundtrackControl.js', import.meta.url),
  'utf8',
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
  .replace('export default function RoutineSoundtrackControl', 'function RoutineSoundtrackControl');
const compiled = transformSync(`${source}\nglobalThis.Control = RoutineSoundtrackControl;`, {
  configFile: false,
  babelrc: false,
  plugins: ['@babel/plugin-transform-react-jsx'],
}).code;
const soundtrack = {
  platform: 'appleMusic',
  kind: 'playlist',
  id: 'p.saved',
  name: 'Saved playlist',
  artist: 'A curator',
  image: 'https://example.com/saved.jpg',
  shuffle: true,
};
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const textOf = (node) =>
  typeof node === 'string'
    ? node
    : Array.isArray(node)
      ? node.map(textOf).join('')
      : (node?.children || []).map(textOf).join('');

async function mount(
  t,
  { props: overrides = {}, connection = {}, player: playerOverrides = {}, focused = true } = {},
) {
  const events = [];
  const requests = [];
  const changes = [];
  let isFocused = focused;
  let currentRequest = null;
  const action =
    (name) =>
    async (...args) => {
      events.push({ name, args });
      return { success: true };
    };
  const player = {
    busy: false,
    reserved: false,
    previousOwnerPending: false,
    ownsQueue: false,
    track: null,
    playing: false,
    playSoundtrack: action('playSoundtrack'),
    playTrack: action('playTrack'),
    playPlaylist: action('playPlaylist'),
    pause: action('pause'),
    resume: action('resume'),
    open: action('open'),
    clear: action('clear'),
    ...playerOverrides,
  };
  const apple = {
    companionAvailable: true,
    timedAvailable: false,
    ready: true,
    connected: true,
    connecting: false,
    connect: action('connect'),
    search: action('search'),
    getPlaylists: action('getPlaylists'),
    getPlaylistTracks: action('getPlaylistTracks'),
    openSoundtrackPicker(request) {
      const entry = { ...request, cancelled: false, cleanupCalls: 0 };
      requests.push(entry);
      currentRequest = entry;
      return () => {
        entry.cleanupCalls++;
        entry.cancelled = true;
        if (currentRequest === entry) currentRequest = null;
      };
    },
    ...connection,
    player,
  };
  let props = {
    routineName: 'Morning intervals',
    editable: true,
    onChange: (item, shuffle) => changes.push({ item, shuffle }),
    ...overrides,
  };
  const scope = {
    ...React,
    React,
    useAppleMusicConnection: () => apple,
    useTheme: () => ({
      theme: { text: '#111', textSecondary: '#555', accent: '#345', error: '#f00' },
    }),
    useIsFocused: () => isFocused,
    ActivityIndicator: 'ActivityIndicator',
    Pressable: 'Pressable',
    Text: 'Text',
    View: 'View',
    Ionicons: 'Icon',
    MusicArtwork: 'MusicArtwork',
    Surface: 'Surface',
    StyleSheet: { create: (styles) => styles },
  };
  new Script(compiled).runInNewContext(scope);
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(scope.Control, props));
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
    changes,
    apple,
    player,
    unmount,
    text: () => textOf(renderer.toJSON()),
    output: () => renderer.toJSON(),
    nodes: (type) => renderer.root.findAllByType(type),
    button: (label) =>
      renderer.root
        .findAllByType('Pressable')
        .find((node) => node.props.accessibilityLabel === label),
    currentRequest: () => currentRequest,
    async press(label) {
      await act(async () => {
        const node = ui.button(label);
        assert.ok(node, `Missing button: ${label}`);
        if (!node.props.disabled) void node.props.onPress();
      });
    },
    async select(index, item, shuffle) {
      await act(async () => requests[index].onSelect(item, shuffle));
    },
    async update(nextProps = {}, nextApple = {}, nextPlayer = {}) {
      props = { ...props, ...nextProps };
      Object.assign(apple, nextApple);
      Object.assign(player, nextPlayer);
      await act(async () => renderer.update(React.createElement(scope.Control, props)));
    },
    async focus(value) {
      isFocused = value;
      await act(async () => renderer.update(React.createElement(scope.Control, props)));
    },
  };
  return ui;
}

test('editable empty routine opens the shared selector and choosing only updates the draft once', async (t) => {
  const ui = await mount(t);
  assert.match(ui.text(), /Selected for Morning intervals/);
  assert.match(ui.text(), /Save the routine to remember this choice/);
  assert.equal(ui.button('Play routine music'), undefined);
  assert.deepEqual(ui.events, []);
  assert.equal(ui.requests.length, 0);
  await ui.press('Choose routine music');
  assert.equal(ui.requests.length, 1);
  assert.equal(ui.requests[0].routineName, 'Morning intervals');
  assert.equal(ui.requests[0].selection, null);
  await ui.select(0, soundtrack, true);
  await ui.select(0, { ...soundtrack, id: 'p.late' }, false);
  assert.deepEqual(ui.changes, [{ item: soundtrack, shuffle: true }]);
  assert.deepEqual(ui.events, [], 'opening and saving never fetch or transport audio');
});

test('saved routine card stays distinct from an active global queue and only explicit Play uses the saved choice', async (t) => {
  const ui = await mount(t, {
    props: { soundtrack, editable: false },
    player: {
      ownsQueue: true,
      playing: false,
      track: { id: 'other', name: 'Other current music' },
    },
  });
  assert.match(ui.text(), /Saved for Morning intervals/);
  assert.match(ui.text(), /Saved playlistA curatorShuffle On/);
  assert.doesNotMatch(ui.text(), /Other current music|Selected for|Save the routine/);
  assert.equal(ui.nodes('MusicArtwork')[0].props.item, soundtrack);
  assert.equal(ui.button('Change routine music'), undefined);
  assert.deepEqual(ui.events, []);
  await ui.press('Play routine music');
  assert.deepEqual(ui.events, [{ name: 'playSoundtrack', args: [soundtrack] }]);
  assert.deepEqual(ui.changes, []);
});

test('draft shuffle and removal retire the open selector and change only saved intent', async (t) => {
  const ui = await mount(t, { props: { soundtrack } });
  await ui.press('Change routine music');
  await ui.press('Shuffle routine playlist: On');
  assert.equal(ui.requests[0].cleanupCalls, 1);
  assert.deepEqual(ui.changes, [{ item: soundtrack, shuffle: false }]);
  await ui.select(0, { ...soundtrack, id: 'p.stale' }, true);
  assert.equal(ui.changes.length, 1);
  await ui.update({ soundtrack: { ...soundtrack, shuffle: false } });
  await ui.press('Change routine music');
  await ui.press('Remove routine music');
  assert.equal(ui.requests[1].cleanupCalls, 1);
  assert.deepEqual(ui.changes[1], { item: null, shuffle: false });
  await ui.select(1, soundtrack, true);
  assert.equal(ui.changes.length, 2);
  assert.deepEqual(ui.events, []);
});

test('unready and connecting controls have no dead chooser action; disconnected ready chooser remains useful', async (t) => {
  const ui = await mount(t);
  for (const state of [{ ready: false }, { ready: true, connecting: true }]) {
    await ui.update({}, state);
    assert.equal(ui.button('Choose routine music').props.disabled, true);
    await ui.press('Choose routine music');
  }
  assert.equal(ui.requests.length, 0);
  await ui.update({}, { connecting: false, connected: false });
  assert.equal(ui.button('Choose routine music').props.disabled, false);
  await ui.press('Choose routine music');
  assert.equal(ui.requests.length, 1, 'global selector supplies the connection affordance');
  assert.deepEqual(ui.events, []);
});

test('explicit playback is disabled while unavailable, unready, disconnected or another ownership transition is pending', async (t) => {
  const ui = await mount(t, { props: { soundtrack } });
  const states = [
    [{ companionAvailable: false }, {}],
    [{ ready: false }, {}],
    [{ connected: false }, {}],
    [{ connecting: true }, {}],
    [{}, { busy: true }],
    [{}, { reserved: true }],
    [{}, { previousOwnerPending: true }],
  ];
  for (const [apple, player] of states) {
    await ui.update(
      {},
      { companionAvailable: true, ready: true, connected: true, connecting: false, ...apple },
      { busy: false, reserved: false, previousOwnerPending: false, ...player },
    );
    assert.match(ui.text(), /Saved playlist/, 'saved choice remains visible');
    assert.equal(ui.button('Play routine music').props.disabled, true);
    await ui.press('Play routine music');
  }
  assert.deepEqual(ui.events, []);
});

test('saved disconnected music offers the existing checked connection action and readable retryable failure', async (t) => {
  let calls = 0;
  const ui = await mount(t, {
    props: { soundtrack, editable: false },
    connection: {
      connected: false,
      connect: async () => {
        calls++;
        return { success: false, error: 'Allow Apple Music access to continue.' };
      },
    },
  });
  await ui.press('Connect Apple Music');
  assert.equal(calls, 1);
  assert.match(ui.text(), /Allow Apple Music access to continue/);
  assert.equal(ui.button('Connect Apple Music').props.disabled, false);
  assert.equal(ui.button('Play routine music').props.disabled, true);
  assert.deepEqual(ui.events, []);
});

test('checked playback failure is scoped, double presses coalesce, and a new routine retires late errors', async (t) => {
  const pending = deferred();
  let calls = 0;
  const ui = await mount(t, {
    props: { soundtrack },
    player: {
      playSoundtrack: () => {
        calls++;
        return pending.promise;
      },
    },
  });
  const oldPlay = ui.button('Play routine music').props.onPress;
  await act(async () => {
    void oldPlay();
    void oldPlay();
  });
  assert.equal(calls, 1);
  assert.equal(ui.button('Play routine music').props.disabled, true);
  await act(async () =>
    pending.resolve({ success: false, error: 'Selected playlist is unavailable.' }),
  );
  assert.match(ui.text(), /Selected playlist is unavailable/);
  assert.equal(ui.button('Play routine music').props.disabled, false);
  const newerPending = deferred();
  await ui.update({}, {}, { playSoundtrack: () => newerPending.promise });
  await ui.press('Play routine music');
  await ui.update({
    routineName: 'Evening intervals',
    soundtrack: { ...soundtrack, id: 'p.evening', name: 'Evening playlist' },
  });
  await act(async () => newerPending.reject(new Error('Retired routine failed.')));
  assert.match(ui.text(), /Evening playlist/);
  assert.doesNotMatch(ui.text(), /Retired routine failed|Selected playlist is unavailable/);
  assert.equal(ui.button('Play routine music').props.disabled, false);
});

test('routine changes and unmount cancel only the owned picker and reject all late selections', async (t) => {
  const ui = await mount(t);
  await ui.press('Choose routine music');
  await ui.update({ routineName: 'Another routine' });
  assert.equal(ui.requests[0].cleanupCalls, 1);
  await ui.select(0, soundtrack, true);
  assert.deepEqual(ui.changes, []);
  await ui.press('Choose routine music');
  await ui.unmount();
  assert.equal(ui.requests[1].cleanupCalls, 1);
  await ui.select(1, soundtrack, true);
  assert.deepEqual(ui.changes, []);
  assert.deepEqual(ui.events, []);
});

test('navigation blur retires the picker and late callback even while the screen remains mounted', async (t) => {
  const ui = await mount(t);
  await ui.press('Choose routine music');
  await ui.focus(false);
  assert.equal(ui.requests[0].cleanupCalls, 1);
  assert.equal(ui.button('Choose routine music').props.disabled, true);
  await ui.select(0, soundtrack, true);
  assert.deepEqual(ui.changes, []);
  await ui.focus(true);
  await ui.select(0, soundtrack, true);
  assert.deepEqual(ui.changes, []);
  await ui.press('Choose routine music');
  await ui.select(1, soundtrack, true);
  assert.deepEqual(ui.changes, [{ item: soundtrack, shuffle: true }]);
  assert.deepEqual(ui.events, []);
});

test('selector uses the current draft callback without reopening when only callback identity changes', async (t) => {
  const ui = await mount(t);
  const latestChanges = [];
  await ui.press('Choose routine music');
  await ui.update({ onChange: (item, shuffle) => latestChanges.push({ item, shuffle }) });
  assert.equal(ui.requests[0].cleanupCalls, 0);
  await ui.select(0, soundtrack, true);
  assert.deepEqual(ui.changes, []);
  assert.deepEqual(latestChanges, [{ item: soundtrack, shuffle: true }]);
  assert.equal(ui.requests.length, 1);
});

test('readonly empty and unavailable empty layouts stay absent while unavailable saved choices remain honest', async (t) => {
  const readonly = await mount(t, { props: { editable: false } });
  assert.equal(readonly.output(), null);
  const unavailable = await mount(t, { connection: { companionAvailable: false } });
  assert.equal(unavailable.output(), null);
  await unavailable.update({ soundtrack });
  assert.match(unavailable.text(), /Saved playlist/);
  assert.match(unavailable.text(), /unavailable on this device/);
  assert.equal(unavailable.button('Change routine music').props.disabled, true);
  assert.equal(unavailable.button('Play routine music').props.disabled, true);
  assert.deepEqual(unavailable.events, []);
});
