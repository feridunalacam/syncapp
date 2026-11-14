import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { canControlDevice } from '../src/services/spotify/devices.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(
  new URL('../src/components/common/SpotifyDevicePicker.js', import.meta.url),
  'utf8',
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
  .replace('export default function', 'function');
const compiled = transformSync(`${source}\nglobalThis.Picker = SpotifyDevicePicker;`, {
  configFile: false,
  babelrc: false,
  plugins: ['@babel/plugin-transform-react-jsx'],
}).code;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
};
async function mount(t) {
  const requests = [];
  let deviceReads = 0;
  const timers = new Map();
  let timerId = 0;
  const listeners = new Set();
  const platform = {
    connectedPlatforms: { spotify: { connected: true } },
    getValidAccessToken: async () => 'test-token',
    refreshToken: async () => 'test-token',
    services: {
      spotify: {
        getCurrentPlayback() {
          const request = deferred();
          requests.push(request);
          return request.promise;
        },
        async getDevices() {
          deviceReads++;
          return { devices: [{ id: 'device', name: 'Available device' }] };
        },
      },
    },
  };
  const appState = {
    currentState: 'active',
    addEventListener(_event, callback) {
      listeners.add(callback);
      return { remove: () => listeners.delete(callback) };
    },
  };
  const context = {
    ...React,
    React,
    AppState: appState,
    canControlDevice,
    usePlatformContext: () => platform,
    useTheme: () => ({ theme: {} }),
    useFocusEffect: (callback) => React.useEffect(callback, [callback]),
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    ActivityIndicator: 'ActivityIndicator',
    Sheet: 'Sheet',
    Ionicons: 'Icon',
    setTimeout(callback) {
      const id = ++timerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  new Script(compiled).runInNewContext(context);
  let root;
  await act(async () => {
    root = create(React.createElement(context.Picker));
  });
  t.after(async () => act(async () => root.unmount()));
  return {
    requests,
    timers,
    get deviceReads() {
      return deviceReads;
    },
    async open() {
      await act(async () => root.root.findAllByType('Pressable')[0].props.onPress());
    },
    async refresh() {
      await act(async () =>
        root.root.findByProps({ accessibilityLabel: 'Refresh Spotify devices' }).props.onPress(),
      );
    },
    async resolve(index, name = 'Current device') {
      await act(async () => requests[index].resolve({ device: { id: 'device', name } }));
    },
    async app(state) {
      appState.currentState = state;
      await act(async () => listeners.forEach((callback) => callback(state)));
    },
    async tick() {
      const [id, callback] = timers.entries().next().value;
      timers.delete(id);
      await act(async () => {
        void callback();
      });
    },
    async disconnect() {
      platform.connectedPlatforms = {};
      await act(async () => root.update(React.createElement(context.Picker)));
    },
    get output() {
      return root.toJSON();
    },
    get label() {
      return root.root.findAllByType('Pressable')[0]?.props.accessibilityLabel;
    },
  };
}
test('slow Spotify device reads never overlap and opening the list queues the missing device read', async (t) => {
  const h = await mount(t);
  assert.equal(h.requests.length, 1);
  await h.open();
  await h.refresh();
  assert.equal(h.requests.length, 1);
  assert.equal(h.timers.size, 0);
  await h.resolve(0);
  assert.equal(h.requests.length, 2);
  assert.equal(h.deviceReads, 1);
  await h.resolve(1);
  assert.equal(h.timers.size, 1);
  await h.tick();
  assert.equal(h.requests.length, 3);
  await h.refresh();
  assert.equal(h.requests.length, 3);
  await h.resolve(2);
  assert.equal(h.timers.size, 1);
});
test('background and disconnect retire late device reads, and foreground resumes one poll', async (t) => {
  const h = await mount(t);
  await h.app('background');
  await h.resolve(0, 'Stale device');
  assert.equal(h.timers.size, 0);
  assert.equal(h.label, 'Spotify playback device: Choose device');
  await h.app('active');
  assert.equal(h.requests.length, 2);
  await h.resolve(1, 'Fresh device');
  assert.equal(h.label, 'Spotify playback device: Fresh device');
  assert.equal(h.timers.size, 1);
  await h.tick();
  await h.disconnect();
  await h.resolve(2, 'Disconnected device');
  assert.equal(h.output, null);
  assert.equal(h.timers.size, 0);
});
