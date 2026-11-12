import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createAccountStore } from '../src/lib/accountStore.js';
import { createMusicConnections } from '../src/lib/musicConnections.js';
import { computeAccessTokenExpiresAt } from '../src/services/spotify/auth.js';
import {
  spotifyAvailable,
  SPOTIFY_UNAVAILABLE_MESSAGE,
} from '../src/services/spotify/availability.js';
import { useMusicSearch } from '../src/hooks/useMusicSearch.js';
import { normalizeAlertConfig, createAlertPreset } from '../src/domain/alerts.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const STORAGE_KEYS = {
  CONNECTED_PLATFORMS: 'connectedPlatforms',
  SELECTED_PLATFORM: 'selectedPlatform',
};
const nativeComponents = Object.fromEntries(
  [
    'View',
    'Text',
    'Pressable',
    'ScrollView',
    'TextInput',
    'Image',
    'Switch',
    'Modal',
    'KeyboardAvoidingView',
    'ActivityIndicator',
  ].map((name) => [name, name]),
);
const theme = { spacing: {}, colors: {} };
const noop = () => {};
const Sheet = ({ visible, children }) =>
  visible ? React.createElement('Sheet', null, children) : null;
function load(relative, names, overrides) {
  const body = readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/^export default function/gm, 'function')
    .replace(/^export /gm, '');
  const compiled = transformSync(`${body}\nglobalThis.result = { ${names.join(', ')} };`, {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
  const scope = {
    ...React,
    React,
    ...nativeComponents,
    StyleSheet: { create: (styles) => styles },
    Platform: { OS: 'ios' },
    Ionicons: 'Icon',
    useTheme: () => ({ theme, isDark: true, toggleTheme: noop }),
    Sheet,
    ...overrides,
  };
  new Script(compiled).runInNewContext(scope);
  return scope.result;
}

function storedPlatforms(base, native) {
  const source = readFileSync(new URL('../src/lib/platformStorage.js', import.meta.url), 'utf8');
  const compiled = transformSync(source, {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const exports = {};
  new Script(compiled).runInNewContext({
    exports,
    require: (name) => {
      if (name === 'react-native') return { Platform: { OS: 'ios' } };
      if (name === 'expo-secure-store') return native;
      if (name === './storage') return { __esModule: true, default: base, STORAGE_KEYS };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return exports;
}

async function mount(t, content) {
  const records = new Map([
    [
      '@syncapp/account/offline/connectedPlatforms',
      JSON.stringify({
        spotify: { connected: true, expiresAt: 0, name: 'Retained offline fixture' },
        device: { connected: true },
      }),
    ],
    ['@syncapp/account/offline/selectedPlatform', 'spotify'],
  ]);
  const secure = new Map([
    [
      'syncapp.music.credentials.offline',
      JSON.stringify({
        spotify: {
          accessToken: 'synthetic-access-fixture',
          refreshToken: 'synthetic-refresh-fixture',
        },
      }),
    ],
  ]);
  const originalRecords = new Map(records),
    originalSecure = new Map(secure);
  const writes = [],
    nativeWrites = [],
    timers = new Set(),
    listeners = new Set();
  let spotifyCalls = 0,
    oauthStarts = 0,
    platformValue,
    connectionValue;
  const base = {
    getItem: async (key) => records.get(key) ?? null,
    setItem: async (key, value) => {
      writes.push(key);
      records.set(key, value);
    },
    removeItem: async (key) => {
      writes.push(key);
      records.delete(key);
    },
    multiRemove: async (keys) => keys.forEach((key) => records.delete(key)),
    getAllKeys: async () => [...records.keys()],
  };
  const storage = createAccountStore(base, 'offline');
  const adapter = storedPlatforms(storage, {
    getItemAsync: async (key) => secure.get(key) ?? null,
    setItemAsync: async (key, value) => {
      nativeWrites.push(key);
      secure.set(key, value);
    },
    deleteItemAsync: async (key) => {
      nativeWrites.push(key);
      secure.delete(key);
    },
  });
  const platform = load('context/PlatformContext.js', ['PlatformProvider', 'usePlatformContext'], {
    STORAGE_KEYS,
    createMusicConnections,
    useAccountData: () => ({ storage }),
    ...adapter,
    SPOTIFY_AVAILABLE: false,
    SPOTIFY_UNAVAILABLE_MESSAGE,
    spotifyService: new Proxy(
      {},
      {
        get: () => async () => {
          spotifyCalls++;
          throw new Error('Spotify must stay offline');
        },
      },
    ),
    deviceMusicService: { getActiveDevice: async () => 'device' },
    AppState: {
      addEventListener: (_event, callback) => {
        listeners.add(callback);
        return { remove: () => listeners.delete(callback) };
      },
    },
    Alert: { alert: noop },
    setInterval: (callback) => {
      timers.add(callback);
      return callback;
    },
    clearInterval: (callback) => timers.delete(callback),
  });
  const connection = load(
    'context/SpotifyConnectionContext.js',
    ['SpotifyConnectionProvider', 'useSpotifyConnectionContext'],
    {
      usePlatformContext: platform.usePlatformContext,
      SPOTIFY_AVAILABLE: false,
      SPOTIFY_UNAVAILABLE_MESSAGE,
      IS_EXPO_GO: false,
      SPOTIFY_CLIENT_ID: 'synthetic-client',
      SPOTIFY_REDIRECT_URI: 'syncapp://spotify-callback',
      SPOTIFY_SCOPES: '',
      computeAccessTokenExpiresAt,
      AuthSession: {
        AuthRequest: class {
          constructor() {
            oauthStarts++;
            throw new Error('OAuth must remain disabled');
          }
        },
      },
      Alert: { alert: noop },
    },
  );
  function Observer() {
    platformValue = platform.usePlatformContext();
    connectionValue = connection.useSpotifyConnectionContext();
    return content?.({
      usePlatformContext: platform.usePlatformContext,
      useSpotifyConnection: connection.useSpotifyConnectionContext,
    });
  }
  let root;
  await act(async () => {
    root = create(
      React.createElement(
        platform.PlatformProvider,
        null,
        React.createElement(
          connection.SpotifyConnectionProvider,
          null,
          React.createElement(Observer),
        ),
      ),
    );
  });
  t.after(async () => act(async () => root.unmount()));
  return {
    root,
    records,
    secure,
    originalRecords,
    originalSecure,
    writes,
    nativeWrites,
    get platform() {
      return platformValue;
    },
    get connection() {
      return connectionValue;
    },
    get spotifyCalls() {
      return spotifyCalls;
    },
    get oauthStarts() {
      return oauthStarts;
    },
    async foregroundAndTick() {
      await act(async () => {
        listeners.forEach((callback) => callback('active'));
        timers.forEach((callback) => callback());
      });
    },
  };
}

test('release providers retain expired Spotify credentials without refresh while Device remains usable', async (t) => {
  const h = await mount(t);
  assert.equal(h.platform.ready, true);
  assert.equal(h.platform.connectedPlatforms.spotify, undefined);
  assert.equal(h.platform.isPlatformConnected('spotify'), false);
  assert.equal(h.platform.selectedPlatform, null);
  assert.equal(h.platform.connectedPlatforms.device.connected, true);
  assert.equal(await h.platform.getValidAccessToken('device'), 'device');
  await h.foregroundAndTick();
  await act(async () => {
    assert.equal(await h.platform.refreshToken('spotify'), null);
    await assert.rejects(
      h.platform.getValidAccessToken('spotify'),
      /Edit this routine.*Device or Browser/,
    );
  });
  assert.equal(h.spotifyCalls, 0);
  assert.deepEqual(h.records, h.originalRecords);
  assert.deepEqual(h.secure, h.originalSecure);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.nativeWrites, []);
  await act(async () => h.platform.setSelectedPlatform('device'));
  assert.equal(h.platform.selectedPlatform, 'device');
  assert.equal(h.records.get('@syncapp/account/offline/selectedPlatform'), 'device');
  assert.deepEqual(h.secure, h.originalSecure);
});

test('release connection action cannot start OAuth even with a retained connection', async (t) => {
  const h = await mount(t);
  assert.equal(h.connection.available, false);
  assert.equal(h.connection.connected, false);
  await act(async () => h.connection.connect());
  assert.equal(h.oauthStarts, 0);
  assert.equal(h.spotifyCalls, 0);
  assert.equal(h.connection.error, SPOTIFY_UNAVAILABLE_MESSAGE);
  assert.equal(h.connection.connecting, false);
  assert.deepEqual(h.records, h.originalRecords);
  assert.deepEqual(h.secure, h.originalSecure);
});

test('release music picker exposes Device and Browser, imports Device audio, and hides Spotify', async (t) => {
  let imports = 0,
    chosen,
    closes = 0;
  let Modal;
  const h = await mount(t, (hooks) => {
    if (!Modal)
      Modal = load('screens/Routine/components/MusicSearchModal.js', ['MusicSearchModal'], {
        ...hooks,
        useMusicSearch,
        loadDeviceMusic: async () => {
          imports++;
          return [
            {
              id: 'device-song',
              name: 'Device song',
              uri: 'file:///synthetic-song.mp3',
              platform: 'device',
            },
          ];
        },
        Surface: 'Surface',
        GlassSurface: 'GlassSurface',
        BrowserAudioPanel: 'BrowserAudioPanel',
        Artwork: 'Artwork',
        PickerTabs: 'PickerTabs',
        SearchField: 'SearchField',
        MusicRow: 'MusicRow',
        PickerState: 'PickerState',
        PrimaryAction: 'PrimaryAction',
        DEFAULT_VOICES: [],
        useDeviceMediaPicker: () => ({}),
      }).MusicSearchModal;
    return React.createElement(Modal, {
      visible: true,
      onClose: () => {
        closes++;
      },
      selectedRoundForSong: 1,
      songType: 'work',
      attachSongToRound: (...args) => {
        chosen = args;
      },
      attachPlaylistToRound: noop,
    });
  });
  const tabs = h.root.root.findByType('PickerTabs');
  assert.equal(tabs.props.items.map((item) => item.id).join(','), 'device,browser');
  assert.equal(imports, 0, 'mounting must not request device permission');
  await act(async () => h.root.root.findByType('PrimaryAction').props.onPress());
  assert.equal(imports, 1);
  await act(async () => h.root.root.findByType('MusicRow').props.onPress());
  assert.equal(chosen[0], 1);
  assert.equal(chosen[1].platform, 'device');
  assert.equal(chosen[2], 'work');
  assert.equal(closes, 1);
  await act(async () => tabs.props.onChange('browser'));
  assert.ok(h.root.root.findByType('BrowserAudioPanel'));
  assert.equal(h.spotifyCalls, 0);
  assert.equal(h.oauthStarts, 0);
});

test('release Profile hides Spotify connection and device controls while keeping Device audio visible', async (t) => {
  let Profile;
  const h = await mount(t, (hooks) => {
    if (!Profile)
      Profile = load('screens/Profile/ProfileScreen.js', ['ProfileScreen'], {
        ...hooks,
        useIsFocused: () => true,
        useAuth: () => ({ user: null, error: null, recoveryMode: false }),
        useAccountData: () => ({ status: 'local', hasGuestData: false }),
        useSubscription: () => ({ ready: true, isPro: false }),
        useAds: () => ({ appActive: true, privacyOptionsBusy: false }),
        useWorkout: () => ({
          isWorkoutRunning: false,
          isMusicPlaying: false,
          isAudioSyncing: false,
        }),
        useRoutineContext: () => ({ routines: [], completedRoutines: [] }),
        usePostContext: () => ({ posts: [], addPost: noop, deletePost: noop }),
        useProfileData: () => ({ ready: true, picture: null, bio: '', links: {} }),
        Surface: 'Surface',
        SpotifyDevicePicker: 'SpotifyDevicePicker',
        SpotifyLogo: 'SpotifyLogo',
        AccountPanel: 'AccountPanel',
        SubscriptionPanel: 'SubscriptionPanel',
        ScreenWrapper: 'ScreenWrapper',
        ScreenHeader: 'ScreenHeader',
        GlassSurface: 'GlassSurface',
        Alert: { alert: noop },
        Linking: {},
        Clipboard: {},
        process: { env: {} },
      }).ProfileScreen;
    return React.createElement(Profile);
  });
  const textOf = (node) =>
    typeof node === 'string' ? node : (node?.children || []).map(textOf).join('');
  const output = textOf(h.root.toJSON());
  assert.doesNotMatch(output, /Spotify/);
  assert.match(output, /Device audio/);
  assert.equal(h.root.root.findAllByType('SpotifyDevicePicker').length, 0);
  assert.equal(h.root.root.findAllByType('SpotifyLogo').length, 0);
  assert.equal(h.spotifyCalls, 0);
  assert.equal(h.oauthStarts, 0);
});

test('audio alert helper follows Spotify release availability and retains the development explanation', async () => {
  for (const profile of ['production', 'preview', 'development']) {
    const available = spotifyAvailable({ dev: true, profile, enabled: 'true' });
    const { AdvancedSettings } = load(
      'screens/Routine/components/AdvancedSettings.js',
      ['AdvancedSettings'],
      {
        SPOTIFY_AVAILABLE: available,
        normalizeAlertConfig,
        createAlertPreset,
        Surface: 'Surface',
        Slider: 'Slider',
        DurationField: 'DurationField',
        AlertSoundPicker: () => null,
      },
    );
    let root;
    await act(async () => {
      root = create(
        React.createElement(AdvancedSettings, {
          isExpanded: true,
          onToggle: noop,
          audioAlerts: createAlertPreset('silent'),
          countdownBeforeStartSec: 0,
          restVolume: 50,
        }),
      );
    });
    try {
      const textOf = (node) =>
        typeof node === 'string' ? node : (node?.children || []).map(textOf).join('');
      const output = textOf(root.toJSON());
      assert.match(output, /Voice cues and alert sounds play with Device or Browser audio\./);
      assert.equal(output.includes('Spotify intervals use the visual timer.'), available, profile);
      if (!available) assert.doesNotMatch(output, /Spotify/, profile);
    } finally {
      await act(async () => root.unmount());
    }
  }
});
