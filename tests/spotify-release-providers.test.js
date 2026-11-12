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
import {
  normalizeAlertConfig,
  resolveAlertConfig,
  resolveAlertSound,
  createAlertPreset,
} from '../src/domain/alerts.js';
import { createAppleMusicService } from '../src/services/appleMusic/adapter.js';
import { createAppleMusicCompanionController } from '../src/services/appleMusic/companion.js';
import { MUSIC_PROVIDERS, resolveMusicLink } from '../src/services/music/providers.js';
import { useAudioController } from '../src/hooks/useAudioController.js';
import { APPLE_MUSIC_UNAVAILABLE_MESSAGE } from '../src/services/appleMusic/config.js';

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
    WEB_MEDIA_IMPORT_AVAILABLE: false,
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

async function mount(
  t,
  content,
  appleMusicService = { available: false },
  { savedApple = false, companionService = { available: false } } = {},
) {
  const records = new Map([
    [
      '@syncapp/account/offline/connectedPlatforms',
      JSON.stringify({
        spotify: { connected: true, expiresAt: 0, name: 'Retained offline fixture' },
        device: { connected: true },
        ...(savedApple ? { appleMusic: { connected: true, authentication: 'native' } } : {}),
      }),
    ],
    ['@syncapp/account/offline/selectedPlatform', savedApple ? 'appleMusic' : 'spotify'],
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
        get: (_target, method) =>
          method === 'cancelPending'
            ? noop
            : async () => {
                spotifyCalls++;
                throw new Error('Spotify must stay offline');
              },
      },
    ),
    deviceMusicService: { getActiveDevice: async () => 'device' },
    appleMusicService,
    appleMusicCompanionService: companionService,
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
  const apple = load(
    'context/AppleMusicConnectionContext.js',
    ['AppleMusicConnectionProvider', 'useAppleMusicConnection'],
    {
      usePlatformContext: platform.usePlatformContext,
      appleMusicService,
      appleMusicCompanionService: companionService,
      createAppleMusicCompanionController,
      acquireMusicCueSilence: () => noop,
      useAds: () => ({
        acquirePresentationBlocker: () => noop,
        waitForAdPresenters: async () => {},
      }),
      AppState: { currentState: 'active', addEventListener: () => ({ remove: noop }) },
    },
  );
  let appleValue;
  function Observer() {
    platformValue = platform.usePlatformContext();
    connectionValue = connection.useSpotifyConnectionContext();
    appleValue = apple.useAppleMusicConnection();
    return content?.({
      usePlatformContext: platform.usePlatformContext,
      useSpotifyConnection: connection.useSpotifyConnectionContext,
      useAppleMusicConnection: apple.useAppleMusicConnection,
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
          React.createElement(
            apple.AppleMusicConnectionProvider,
            null,
            React.createElement(Observer),
          ),
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
    get apple() {
      return appleValue;
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
  assert.equal(tabs.props.items.find((item) => item.id === 'browser').label, 'Find audio');
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

test('release Profile hides Spotify and keeps passive preferences accessible and account rows actionable', async (t) => {
  let Profile;
  let themeToggles = 0;
  const h = await mount(t, (hooks) => {
    if (!Profile)
      Profile = load('screens/Profile/ProfileScreen.js', ['ProfileScreen'], {
        ...hooks,
        useTheme: () => {
          const [isDark, setIsDark] = React.useState(false);
          return {
            theme,
            isDark,
            toggleTheme: () => {
              themeToggles++;
              setIsDark((value) => !value);
            },
          };
        },
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
        MusicServicesPanel: 'MusicServicesPanel',
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

  const appearance = h.root.root.findByProps({ accessibilityLabel: 'Dark appearance' });
  assert.equal(appearance.type, 'Switch');
  assert.equal(appearance.parent.type, 'View');
  assert.equal(appearance.parent.props.accessible, false);
  for (let ancestor = appearance.parent; ancestor; ancestor = ancestor.parent) {
    assert.notEqual(ancestor.type, 'Pressable');
    assert.notEqual(ancestor.props.disabled, true);
    assert.notEqual(ancestor.props.accessibilityState?.disabled, true);
    assert.equal(ancestor.props.onPress, undefined);
  }
  assert.equal(appearance.props.value, false);
  await act(async () => appearance.props.onValueChange(true));
  assert.equal(themeToggles, 1);
  assert.equal(appearance.props.value, true);

  const accountRow = h.root.root
    .findAllByType('Pressable')
    .find((node) => textOf(node).includes('Sign in or create account'));
  assert.ok(accountRow);
  assert.equal(accountRow.props.accessibilityRole, 'button');
  assert.notEqual(accountRow.props.disabled, true);
  await act(async () => accountRow.props.onPress());
  assert.equal(h.root.root.findByType('AccountPanel').props.visible, true);
});

test('audio alert helper follows Spotify release availability and retains the development explanation', async () => {
  for (const profile of ['production', 'preview', 'development']) {
    const available = spotifyAvailable({ dev: true, profile, enabled: 'true' });
    const { AdvancedSettings } = load(
      'screens/Routine/components/AdvancedSettings.js',
      ['AdvancedSettings'],
      {
        SPOTIFY_AVAILABLE: available,
        appleMusicService: { available: false },
        normalizeAlertConfig,
        resolveAlertConfig,
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
      assert.match(output, /Alert sounds play with Device audio\./);
      assert.equal(output.includes('Spotify intervals use the visual timer.'), available, profile);
      if (!available) assert.doesNotMatch(output, /Spotify/, profile);
    } finally {
      await act(async () => root.unmount());
    }
  }
});

test('cue editor shows original-effect fallbacks without rewriting saved spoken choices', async () => {
  const { AlertSoundPicker } = load(
    'screens/Routine/components/AlertSoundPicker.js',
    ['AlertSoundPicker'],
    { resolveAlertSound },
  );
  const { AdvancedSettings } = load(
    'screens/Routine/components/AdvancedSettings.js',
    ['AdvancedSettings'],
    {
      SPOTIFY_AVAILABLE: false,
      appleMusicService: { available: false },
      normalizeAlertConfig,
      resolveAlertConfig,
      createAlertPreset,
      Surface: 'Surface',
      Slider: 'Slider',
      DurationField: 'DurationField',
      AlertSoundPicker,
    },
  );
  const saved = normalizeAlertConfig({
    enabled: true,
    language: 'tr-TR',
    countdown: { mode: 'voice', seconds: 5 },
  });
  const before = structuredClone(saved);
  const changes = [];
  let root;
  await act(async () => {
    root = create(
      React.createElement(AdvancedSettings, {
        isExpanded: true,
        onToggle: noop,
        audioAlerts: saved,
        onAudioAlertsChange: (next) => changes.push(next),
        onSoundPickerOpen: noop,
        countdownBeforeStartSec: 3,
        restVolume: 50,
      }),
    );
  });
  try {
    const textOf = (node) =>
      typeof node === 'string' ? node : (node?.children || []).map(textOf).join('');
    assert.doesNotMatch(
      textOf(root.toJSON()),
      /Voice|Spoken|SyncApp Coach|Device voice|media volume/,
    );
    assert.equal(
      root.root.findByProps({ accessibilityLabel: 'Countdown mode: Beep' }).props.accessibilityState
        .selected,
      true,
    );
    assert.equal(root.root.findByProps({ accessibilityLabel: 'Audio cues' }).props.value, true);
    assert.equal(changes.length, 0, 'mounting a saved routine must not persist its fallback');
    await act(async () =>
      root.root.findByProps({ accessibilityLabel: 'Effects volume' }).props.onValueChange(0),
    );
    assert.equal(changes.at(-1).volume, 0);
    assert.equal(changes.at(-1).countdown.mode, 'voice');
    assert.equal(changes.at(-1).language, 'tr-TR');
    assert.equal(changes.at(-1).signals.rest.uri, 'speech://rest');
    await act(async () =>
      root.root.findByProps({ accessibilityLabel: 'Choose start rest sound' }).props.onPress(),
    );
    assert.equal(
      root.root.findByProps({ accessibilityLabel: 'Use gong' }).props.accessibilityState.selected,
      true,
    );
    assert.ok(root.root.findByProps({ accessibilityLabel: 'Choose a custom alert sound' }));
    assert.doesNotMatch(textOf(root.toJSON()), /Spoken|SyncApp Coach|Voice/);
    await act(async () =>
      root.root.findByProps({ accessibilityLabel: 'Use chime' }).props.onPress(),
    );
    assert.equal(changes.at(-1).signals.rest.uri, 'voices://cue_chime');
    assert.equal(changes.at(-1).signals.start.uri, 'speech://go');
    assert.deepEqual(saved, before);
  } finally {
    await act(async () => root.unmount());
  }
});

test('enabled owner Apple Music connection, tokenless persistence, source selection and disconnect work independently of Spotify', async (t) => {
  let authorizations = 0,
    stops = 0;
  const service = createAppleMusicService({
    supported: true,
    authorize: async () => {
      authorizations++;
      return { status: 'authorized', canPlayCatalogContent: true };
    },
    getConnectionState: async () => ({ status: 'authorized', canPlayCatalogContent: true }),
    stop: async () => {
      stops++;
    },
  });
  const h = await mount(t, null, service);
  assert.equal(authorizations, 0);
  assert.equal(h.apple.available, true);
  await act(async () => h.apple.connect());
  assert.equal(h.apple.connected, true);
  assert.equal(authorizations, 1);
  assert.equal(h.platform.connectedPlatforms.appleMusic.authentication, 'native');
  assert.equal(h.platform.connectedPlatforms.appleMusic.accessToken, undefined);
  assert.equal(await h.platform.getValidAccessToken('appleMusic'), 'native:appleMusic');
  await h.foregroundAndTick();
  assert.equal(authorizations, 1, 'foreground checks must not prompt again');
  await act(async () => h.platform.setSelectedPlatform('appleMusic'));
  assert.equal(h.platform.selectedPlatform, 'appleMusic');
  await assert.rejects(h.platform.connectPlatform('youtubeMusic', {}), /cannot connect/);
  await act(async () => h.apple.disconnect());
  assert.equal(h.apple.connected, false);
  assert.equal(h.platform.selectedPlatform, null);
  assert.equal(stops, 1);
  assert.equal(h.spotifyCalls, 0);
  assert.equal(h.oauthStarts, 0);
});

test('revoking OS music permission clears the native connection before another request can play', async (t) => {
  let status = 'authorized';
  const service = createAppleMusicService({
    supported: true,
    authorize: async () => ({ status, canPlayCatalogContent: true }),
    getConnectionState: async () => ({ status, canPlayCatalogContent: true }),
  });
  const h = await mount(t, null, service);
  await act(async () => h.apple.connect());
  status = 'denied';
  await act(async () => assert.rejects(h.platform.getValidAccessToken('appleMusic'), /Settings/));
  assert.equal(h.apple.connected, false);
  assert.match(h.apple.error, /Settings/);
  assert.equal(h.spotifyCalls, 0);
});

test('authorization returning after an account unmount cannot save a connection into that account', async (t) => {
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const service = createAppleMusicService({ supported: true, authorize: () => pending });
  const h = await mount(t, null, service);
  let connecting;
  await act(async () => {
    connecting = h.apple.connect();
  });
  await act(async () => h.root.unmount());
  await act(async () => {
    resolve({ status: 'authorized', canPlayCatalogContent: true });
    await connecting;
  });
  assert.deepEqual(h.records, h.originalRecords);
  assert.deepEqual(h.secure, h.originalSecure);
});

test('enabled owner Apple Music picker loads library playlists and assigns their tracks with the native platform', async (t) => {
  let Modal, chosen;
  const service = createAppleMusicService({
    supported: true,
    authorize: async () => ({ status: 'authorized', canPlayCatalogContent: true }),
    getConnectionState: async () => ({ status: 'authorized', canPlayCatalogContent: true }),
    getUserPlaylists: async () => [{ id: 'p.fixture', name: 'Apple library' }],
    getPlaylistTracks: async () => [{ id: '123', name: 'Apple song', uri: 'apple-music:song:123' }],
    search: async () => ({ tracks: [], playlists: [] }),
  });
  const h = await mount(
    t,
    (hooks) => {
      if (!Modal)
        Modal = load('screens/Routine/components/MusicSearchModal.js', ['MusicSearchModal'], {
          ...hooks,
          useMusicSearch,
          loadDeviceMusic: async () => [],
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
          setTimeout: () => 1,
          clearTimeout: noop,
        }).MusicSearchModal;
      return React.createElement(Modal, {
        visible: true,
        onClose: noop,
        selectedRoundForSong: 2,
        songType: 'rest',
        attachSongToRound: (...args) => {
          chosen = args;
        },
        attachPlaylistToRound: noop,
      });
    },
    service,
  );
  assert.equal(
    h.root.root
      .findByType('PickerTabs')
      .props.items.map((item) => item.id)
      .join(','),
    'device,appleMusic,browser',
  );
  await act(async () => h.root.root.findByType('PickerTabs').props.onChange('appleMusic'));
  assert.equal(h.root.root.findByType('PickerState').props.actionLabel, 'Connect Apple Music');
  await act(async () => h.root.root.findByType('PickerState').props.onRetry());
  const playlistButton = h.root.root
    .findAllByType('Pressable')
    .find((item) => item.props.accessibilityLabel === 'Browse Apple library');
  assert.ok(playlistButton);
  await act(async () => playlistButton.props.onPress());
  await act(async () => h.root.root.findByType('MusicRow').props.onPress());
  assert.equal(chosen[0], 2);
  assert.equal(chosen[1].platform, 'appleMusic');
  assert.equal(chosen[1].uri, 'apple-music:song:123');
  assert.equal(chosen[2], 'rest');
  assert.equal(h.spotifyCalls, 0);
});

test('music services sheet opens only valid service links and does not mark external services connected', async (t) => {
  let Panel;
  const opened = [];
  const h = await mount(t, (hooks) => {
    if (!Panel)
      Panel = load('components/common/MusicServicesPanel.js', ['MusicServicesPanel'], {
        ...hooks,
        useWorkout: () => ({ isWorkoutRunning: false }),
        MUSIC_PROVIDERS,
        resolveMusicLink,
        Linking: { openURL: async (url) => opened.push(url) },
      }).MusicServicesPanel;
    return React.createElement(Panel);
  });
  const button = (label) =>
    h.root.root.findAllByType('Pressable').find((item) => item.props.accessibilityLabel === label);
  await act(async () => button('Open other music services').props.onPress());
  await act(async () => button('Open YouTube Music').props.onPress());
  assert.equal(opened[0], 'https://music.youtube.com/');
  const input = h.root.root.findByType('TextInput');
  await act(async () => input.props.onChangeText('https://music.youtube.com.evil.example/'));
  await act(async () => button('Open music link').props.onPress());
  assert.equal(opened.length, 1);
  assert.equal(h.root.root.findAllByProps({ accessibilityRole: 'alert' }).length, 1);
  await act(async () => input.props.onChangeText('https://music.youtube.com/watch?v=fixture'));
  await act(async () => button('Open music link').props.onPress());
  assert.equal(opened.length, 2);
  assert.equal(h.platform.connectedPlatforms.youtubeMusic, undefined);
  assert.equal(h.oauthStarts, 0);
});

test('blocked Apple Music retains saved selections without native access and leaves an ordinary Open action', async (t) => {
  let lookups = 0,
    nativeCalls = 0,
    audio,
    Panel;
  const opened = [];
  const source = readFileSync(
    new URL('../src/services/appleMusic/index.js', import.meta.url),
    'utf8',
  )
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export const appleMusicCompanionService =', 'globalThis.companion =')
    .replace(
      'export default createAppleMusicService',
      'globalThis.service = createAppleMusicService',
    );
  const context = {
    Platform: { OS: 'ios' },
    APPLE_MUSIC_AVAILABLE: false,
    APPLE_MUSIC_COMPANION_AVAILABLE: false,
    APPLE_MUSIC_UNAVAILABLE_MESSAGE,
    createAppleMusicService,
    requireOptionalNativeModule: () => {
      lookups++;
      return new Proxy(
        { supported: true },
        {
          get: (target, key) =>
            key === 'supported'
              ? true
              : async () => {
                  nativeCalls++;
                },
        },
      );
    },
  };
  new Script(source).runInNewContext(context);
  const routine = {
    id: 'retained-apple-round',
    roundAudioOnly: true,
    roundsData: [
      { workSong: { uri: 'apple-music:song:123', platform: 'appleMusic', name: 'Saved song' } },
    ],
  };
  const before = JSON.stringify(routine);
  const h = await mount(
    t,
    (hooks) => {
      const platform = hooks.usePlatformContext();
      audio = useAudioController({
        ...platform,
        selectedRoutine: routine,
        countdownSoundPlayer: { stop: async () => {} },
      });
      if (!Panel)
        Panel = load('components/common/MusicServicesPanel.js', ['MusicServicesPanel'], {
          ...hooks,
          useWorkout: () => ({ isWorkoutRunning: false }),
          MUSIC_PROVIDERS,
          resolveMusicLink,
          Linking: { openURL: async (url) => opened.push(url) },
        }).MusicServicesPanel;
      return React.createElement(Panel);
    },
    context.service,
    { savedApple: true },
  );
  assert.equal(h.platform.connectedPlatforms.appleMusic, undefined);
  assert.equal(h.platform.selectedPlatform, null);
  assert.equal(h.apple.available, false);
  assert.equal(h.apple.connected, false);
  await act(async () => {
    await h.apple.connect();
    await h.apple.disconnect();
  });
  let failed;
  await act(async () => {
    failed = await audio.handlePhaseChange('work', 1);
  });
  assert.equal(failed.success, false);
  assert.equal(audio.audioError, APPLE_MUSIC_UNAVAILABLE_MESSAGE);
  assert.equal(audio.isMusicPlaying, false);
  const open = h.root.root
    .findAllByType('Pressable')
    .find((node) => node.props.accessibilityLabel === 'Open Apple Music');
  assert.ok(open);
  const text = (node) =>
    typeof node === 'string' ? node : (node?.children || []).map(text).join('');
  assert.match(text(h.root.toJSON()), /Opens Apple Music\. Playback stays in Apple Music\./);
  await act(async () => open.props.onPress());
  assert.deepEqual(opened, ['https://music.apple.com/']);
  await h.foregroundAndTick();
  assert.equal(lookups, 0);
  assert.equal(nativeCalls, 0);
  assert.deepEqual(h.records, h.originalRecords);
  assert.deepEqual(h.secure, h.originalSecure);
  assert.deepEqual(h.writes, []);
  assert.deepEqual(h.nativeWrites, []);
  assert.equal(JSON.stringify(routine), before);
});

test('a standard-only Apple connection remains outside the timed platform facade and cannot execute saved rounds', async (t) => {
  const calls = [];
  const companionService = createAppleMusicService({
    supported: true,
    getConnectionState: async () => ({ status: 'authorized', canPlayCatalogContent: true }),
    playTrack: async (...args) => {
      calls.push(['track', ...args]);
      return { success: true };
    },
    setRepeat: async () => ({ success: true }),
    getCurrentPlayback: async () => ({
      is_playing: true,
      item: { id: '123', name: 'Explicit song', duration: 60 },
    }),
    stop: async () => {
      calls.push(['stop']);
    },
  });
  const timedService = createAppleMusicService(null, {
    unavailableMessage: APPLE_MUSIC_UNAVAILABLE_MESSAGE,
  });
  let audio;
  const routine = {
    roundsData: [{ workSong: { uri: 'apple-music:song:123', platform: 'appleMusic' } }],
  };
  const h = await mount(
    t,
    (hooks) => {
      audio = useAudioController({
        ...hooks.usePlatformContext(),
        selectedRoutine: routine,
        countdownSoundPlayer: { stop: async () => {} },
      });
      return null;
    },
    timedService,
    { savedApple: true, companionService },
  );
  assert.equal(h.apple.companionAvailable, true);
  assert.equal(h.apple.timedAvailable, false);
  assert.equal(h.apple.connected, true);
  assert.equal(h.platform.appleMusicConnection.connected, true);
  assert.equal(h.platform.connectedPlatforms.appleMusic, undefined);
  assert.equal(h.platform.isPlatformConnected('appleMusic'), false);
  await act(async () => {
    await h.platform.setSelectedPlatform('appleMusic');
  });
  assert.equal(h.platform.selectedPlatform, null);
  await assert.rejects(h.platform.getValidAccessToken('appleMusic'), {
    message: APPLE_MUSIC_UNAVAILABLE_MESSAGE,
  });
  await act(async () => {
    await h.apple.player.playTrack({ uri: 'apple-music:song:123', name: 'Explicit song' });
  });
  assert.equal(h.apple.player.ownsQueue, true);
  let result;
  await act(async () => {
    result = await audio.handlePhaseChange('work', 1);
  });
  assert.equal(result.success, false);
  assert.equal(audio.audioError, APPLE_MUSIC_UNAVAILABLE_MESSAGE);
  assert.deepEqual(
    calls,
    [['track', '123', false]],
    'saved timed assignment cannot contact or stop the standard player',
  );
  await act(async () => {
    await h.apple.player.clear();
  });
});
