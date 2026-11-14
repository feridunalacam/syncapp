import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createAdsConfig } from '../src/services/ads/config.js';
import { createAdsController } from '../src/services/ads/controller.js';
import { createNativeAdsRuntime } from '../src/services/ads/sdk.js';
import { createInterstitialController } from '../src/services/ads/interstitials.js';
import { createSessionAdActions } from '../src/services/ads/sessionActions.js';
import { canPrepareAds, canUseAdsAccount } from '../src/services/ads/eligibility.js';
import { createPresentationBlockers } from '../src/services/ads/presentationBlockers.js';
import { showStartMusicOpportunity } from '../src/services/ads/startMusicBoundary.js';
import { createAppleMusicCompanionController } from '../src/services/appleMusic/companion.js';
import {
  normalizeRoutineSoundtrack,
  soundtrackPlaybackItem,
} from '../src/domain/routineSoundtrack.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const settle = () => new Promise(setImmediate);
const consentInfo = { canRequestAds: true, privacyOptionsRequirementStatus: 'NOT_REQUIRED' };
function deferred() {
  let resolve;
  const promise = new Promise((done) => (resolve = done));
  return { promise, resolve };
}
function compile(path, replacements, output) {
  let source = readFileSync(new URL(path, import.meta.url), 'utf8').replace(
    /^import[\s\S]*?from ['"][^'"]+['"];?\n/gm,
    '',
  );
  for (const [from, to] of replacements) source = source.replace(from, to);
  return transformSync(`${source}\n${output}`, {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
}
const providerCode = compile(
  '../src/context/AdsContext.js',
  [
    ['export function AdsProvider', 'function AdsProvider'],
    ['export function useAds', 'function useAds'],
  ],
  'globalThis.Provider = AdsProvider; globalThis.readAds = useAds;',
);
const hookCode = compile(
  '../src/hooks/useSessionAds.js',
  [['export default function useSessionAds', 'function useSessionAds']],
  'globalThis.sessionHook = useSessionAds;',
);
const musicProviderCode = compile(
  '../src/context/AppleMusicConnectionContext.js',
  [
    ['export function AppleMusicConnectionProvider', 'function AppleMusicConnectionProvider'],
    ['export const useAppleMusicConnection', 'const useAppleMusicConnection'],
  ],
  'globalThis.MusicProvider = AppleMusicConnectionProvider; globalThis.readMusic = useAppleMusicConnection;',
);
const profileCode = compile(
  '../src/screens/Profile/ProfileScreen.js',
  [['export default function ProfileScreen', 'function ProfileScreen']],
  'globalThis.ProfileScreen = ProfileScreen;',
);

async function mount(options = {}) {
  const events = [];
  const nativeAds = [];
  const nativeRequests = [];
  const listeners = new Set();
  let musicPlaying = false;
  let cueLeases = 0;
  const musicControls = {
    pause: null,
    pauseFails: false,
    resumeFails: false,
    resumeCancelled: false,
  };
  const deviceConsentInfo = {
    ...consentInfo,
    canRequestAds: options.consentAllowed !== false,
    privacyOptionsRequirementStatus: options.privacyRequired ? 'REQUIRED' : 'NOT_REQUIRED',
  };
  const scene = {
    auth: { ready: true, user: options.guest ? null : { id: 'account-a' }, recoveryMode: false },
    subscription: {
      ready: options.subscriptionReady !== false,
      userId: options.guest ? null : 'account-a',
      accessVerified: true,
      isPro: options.pro === true,
      pending: false,
      loading: false,
    },
    globalBlocked: false,
    localBlocked: false,
    focused: true,
    sessionKey: options.sessionKey || null,
    workout: {
      selectedRoutine: { id: 'routine-one' },
      isWorkoutRunning: options.active === true,
      isMusicPlaying: false,
      isAudioSyncing: false,
      toggle() {
        events.push('toggle');
      },
      beginSession(expected) {
        events.push(['begin', expected]);
        scene.workout = { ...scene.workout, isWorkoutRunning: true };
        scene.forceRender();
        return true;
      },
    },
  };
  const appState = {
    currentState: 'active',
    addEventListener(_type, callback) {
      listeners.add(callback);
      return { remove: () => listeners.delete(callback) };
    },
  };
  const mobileAds = {
    async setAppMuted() {},
    async setAppVolume() {},
    async setRequestConfiguration() {},
    async initialize() {
      events.push('native-init');
    },
  };
  const sdk = {
    default: () => mobileAds,
    AdsConsent: {
      async requestInfoUpdate() {
        events.push('consent-info');
        return deviceConsentInfo;
      },
      async loadAndShowConsentFormIfRequired() {
        events.push('consent-form');
        if (options.form) await options.form.promise;
        events.push('consent-closed');
        return deviceConsentInfo;
      },
      async getConsentInfo() {
        return deviceConsentInfo;
      },
      async showPrivacyOptionsForm() {
        events.push('privacy-form');
        return deviceConsentInfo;
      },
    },
    BannerAd() {},
    BannerAdSize: { LARGE_ANCHORED_ADAPTIVE_BANNER: 'adaptive' },
    TestIds: { ADAPTIVE_BANNER: 'test-banner', INTERSTITIAL: 'test-interstitial' },
    AdEventType: { LOADED: 'loaded', OPENED: 'opened', CLOSED: 'closed', ERROR: 'error' },
    InterstitialAd: {
      createForAdRequest(...args) {
        nativeRequests.push(args);
        events.push('native-create');
        const callbacks = new Map();
        const ad = {
          shows: 0,
          destroys: 0,
          presenting: false,
          addAdEventListener(type, callback) {
            callbacks.set(type, callback);
            return () => callbacks.delete(type);
          },
          load() {
            events.push('native-load');
          },
          async show() {
            this.shows++;
            this.presenting = true;
            events.push('native-show');
          },
          destroy() {
            this.destroys++;
            callbacks.clear();
          },
          emit(type) {
            if (type === 'closed' || type === 'error') this.presenting = false;
            callbacks.get(type)?.();
          },
        };
        nativeAds.push(ad);
        return ad;
      },
    },
  };
  const musicSong = {
    id: '12345',
    uri: 'apple-music:song:12345',
    name: 'Independent music',
    platform: 'appleMusic',
  };
  const musicService = {
    available: true,
    getAccessToken: async () => ({ accessToken: 'native:appleMusic' }),
    playTrack: async () => {
      musicPlaying = true;
      events.push('music-start');
      return { success: true };
    },
    pause: async () => {
      events.push('music-pause-request');
      if (musicControls.pause) await musicControls.pause;
      if (musicControls.pauseFails) return { success: false, error: 'Music pause failed' };
      musicPlaying = false;
      events.push('music-pause-ack');
      return { success: true };
    },
    play: async () => {
      assert.equal(
        nativeAds.some((ad) => ad.presenting),
        false,
        'native ad must close before music resumes',
      );
      assert.equal(
        scene.ads.canPresentAds(),
        false,
        'music restores its own presentation lease before native resume',
      );
      if (musicControls.resumeFails) return { success: false, error: 'Music resume failed' };
      if (musicControls.resumeCancelled) return { success: true, cancelled: true };
      musicPlaying = true;
      events.push('music-resume');
      return { success: true };
    },
    cleanup: async () => {
      musicPlaying = false;
      events.push('music-stop');
      return { success: true };
    },
    getCurrentPlayback: async () => ({
      item: musicSong,
      is_playing: musicPlaying,
      progress_ms: 1000,
    }),
    setRepeat: async () => ({ success: true }),
    setShuffle: async () => ({ success: true }),
    next: async () => {
      assert.equal(
        nativeAds.some((ad) => ad.presenting),
        false,
      );
      events.push('music-next');
      return { success: true };
    },
    previous: async () => {
      assert.equal(
        nativeAds.some((ad) => ad.presenting),
        false,
      );
      events.push('music-previous');
      return { success: true };
    },
  };
  const context = {
    React,
    createContext: React.createContext,
    useCallback: React.useCallback,
    useContext: React.useContext,
    useEffect: React.useEffect,
    useRef: React.useRef,
    useState: React.useState,
    AppState: appState,
    Platform: { OS: 'ios' },
    NativeModules: {},
    TurboModuleRegistry: { get: () => ({}) },
    useIsFocused: () => scene.focused,
    useAuth: () => scene.auth,
    useSubscription: () => scene.subscription,
    createAdsConfig,
    createAdsController,
    createNativeAdsRuntime,
    createInterstitialController,
    createSessionAdActions,
    createPresentationBlockers,
    createAppleMusicCompanionController,
    normalizeRoutineSoundtrack,
    soundtrackPlaybackItem,
    showStartMusicOpportunity,
    useAppleMusicConnection: () => ({ player: { isActive: () => false, visible: false } }),
    usePlatformContext: () => ({
      ready: true,
      appleMusicConnection: { connected: true },
      connectedPlatforms: {},
      connectPlatform: async () => {},
      disconnectPlatform: async () => {},
    }),
    appleMusicService: { available: false },
    appleMusicCompanionService: musicService,
    acquireMusicCueSilence: () => {
      cueLeases++;
      return () => cueLeases--;
    },
    registerCueMusicSource: () => () => {},
    canPrepareAds,
    canUseAdsAccount,
    __DEV__: options.dev ?? true,
    process: { env: { EXPO_PUBLIC_ADS_ENABLED: options.adsEnabled === false ? 'false' : 'true' } },
    require: () => {
      events.push('sdk-load');
      return sdk;
    },
    setTimeout,
    clearTimeout,
    async stopCuePreview() {
      events.push('stop-preview');
    },
    async stopWorkoutCues() {
      events.push('stop-cues');
    },
  };
  new Script(providerCode).runInNewContext(context);
  const readAds = context.readAds;
  context.useAds = () => {
    const ads = readAds();
    scene.ads = ads;
    return {
      ...ads,
      ...scene.adsOverride,
      holdAdPreparation() {
        events.push('hold');
        const release = ads.holdAdPreparation();
        return () => {
          events.push(['release', scene.workout.isWorkoutRunning]);
          release();
        };
      },
    };
  };
  if (options.music) {
    new Script(musicProviderCode).runInNewContext(context);
    context.useAppleMusicConnection = context.readMusic;
  }
  new Script(hookCode).runInNewContext(context);
  if (options.profile) {
    Object.assign(
      context,
      Object.fromEntries(
        [
          'View',
          'Text',
          'Pressable',
          'ScrollView',
          'TextInput',
          'Image',
          'Switch',
          'Surface',
          'SpotifyDevicePicker',
          'MusicServicesPanel',
          'SpotifyLogo',
          'AccountPanel',
          'SubscriptionPanel',
          'OpenSourceNotices',
          'ScreenWrapper',
          'ScreenHeader',
          'GlassSurface',
        ].map((name) => [name, name]),
      ),
      {
        StyleSheet: { create: (styles) => styles },
        Ionicons: 'Icon',
        useTheme: () => ({ theme: {}, isDark: false, toggleTheme() {} }),
        useAccountData: () => ({ status: 'local', hasGuestData: false }),
        useWorkout: () => scene.workout,
        useRoutineContext: () => ({ routines: [], completedRoutines: [] }),
        usePostContext: () => ({ posts: [], addPost() {}, deletePost() {} }),
        useProfileData: () => ({ ready: true, picture: null, bio: '', links: {} }),
        useSpotifyConnection: () => ({ available: false, connecting: false }),
        useAppleMusicConnection: () => ({ available: false, connecting: false }),
        Sheet: ({ visible, children }) =>
          visible ? React.createElement('Sheet', null, children) : null,
        Alert: { alert: (...args) => events.push(['alert', ...args]) },
        Linking: {},
        Clipboard: {},
      },
    );
    new Script(profileCode).runInNewContext(context);
  }
  function Consumer() {
    const [, update] = React.useState(0);
    scene.forceRender = () => update((value) => value + 1);
    if (options.music) scene.music = context.readMusic();
    scene.api = context.sessionHook({
      workout: scene.workout,
      blocked: scene.localBlocked,
      sessionKey: scene.sessionKey,
      onFinish: (key) => events.push(['finish', key]),
    });
    return options.profile
      ? React.createElement(context.ProfileScreen)
      : React.createElement('SessionState', { busy: scene.api.busy });
  }
  const tree = () =>
    React.createElement(
      context.Provider,
      { blocked: scene.globalBlocked },
      options.music
        ? React.createElement(context.MusicProvider, null, React.createElement(Consumer))
        : React.createElement(Consumer),
    );
  let renderer;
  await act(async () => {
    renderer = create(tree());
    await settle();
  });
  return {
    scene,
    events,
    nativeAds,
    nativeRequests,
    renderer,
    musicControls,
    get musicPlaying() {
      return musicPlaying;
    },
    get cueLeases() {
      return cueLeases;
    },
    async playMusic() {
      await act(async () => {
        await scene.music.player.playTrack(musicSong);
        await settle();
      });
    },
    emitAppState(value) {
      appState.currentState = value;
      [...listeners].forEach((callback) => callback(value));
    },
    async update(change) {
      Object.assign(scene, change);
      await act(async () => {
        renderer.update(tree());
        await settle();
      });
    },
    async foreground(value) {
      await act(async () => {
        appState.currentState = value;
        [...listeners].forEach((callback) => callback(value));
        await settle();
      });
    },
    async prepare() {
      await act(async () => {
        scene.api.recordRoutineSelection();
        nativeAds.at(-1)?.emit('loaded');
      });
      assert.equal(
        scene.ads.interstitialLoaded,
        true,
        'Real provider exposes the prepared creative',
      );
      return nativeAds.at(-1);
    },
    async flush() {
      await act(async () => {
        await settle();
      });
    },
    async close() {
      await act(async () => renderer.unmount());
    },
  };
}

const textOf = (node) =>
  typeof node === 'string' ? node : (node?.children || []).map(textOf).join('');
const privacyRows = (app) =>
  app.renderer.root
    .findAllByType('Pressable')
    .filter((node) => textOf(node).includes('Ad privacy choices'));

test('real music and ad providers pause before yielding, keep native dismissal ownership, then resume before Start', async () => {
  const app = await mount({ music: true });
  let starting;
  try {
    const old = await app.prepare();
    await app.playMusic();
    assert.equal(old.destroys, 1);
    assert.equal(app.scene.ads.accountEligible, false);
    assert.equal(
      app.scene.ads.canPrepareMusicStartAd(),
      true,
      'retained Free consent is qualified before yielding its own music lease',
    );
    assert.equal(
      app.scene.api.adSupported,
      true,
      'the timer still discloses a possible Free ad while music owns its lease',
    );
    const nativeBefore = app.events.filter((event) =>
      ['sdk-load', 'consent-info', 'consent-form', 'native-init'].includes(event),
    );
    const pause = deferred();
    app.musicControls.pause = pause.promise;
    await act(async () => {
      starting = app.scene.api.startOrToggle();
      await settle();
    });
    assert.equal(app.events.includes('music-pause-request'), true);
    assert.equal(app.nativeAds.length, 1, 'no new creative before native pause acknowledgement');
    assert.equal(app.musicPlaying, true);
    assert.equal(app.cueLeases, 1);
    await act(async () => {
      pause.resolve();
      await settle();
    });
    assert.equal(app.musicPlaying, false);
    assert.equal(app.nativeAds.length, 2);
    assert.deepEqual(
      app.nativeRequests[1],
      app.nativeRequests[0],
      'the Start boundary passes only the same configured ad unit/options, never music metadata',
    );
    assert.equal(JSON.stringify(app.nativeRequests[1]).includes('Independent music'), false);
    assert.equal(JSON.stringify(app.nativeRequests[1]).includes('12345'), false);
    const ad = app.nativeAds.at(-1);
    assert.equal(ad.shows, 0);
    await act(async () => {
      ad.emit('loaded');
      await settle();
    });
    assert.equal(ad.shows, 1);
    assert.equal(
      app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
      false,
    );
    assert.equal(
      app.events.includes('music-resume'),
      false,
      'native show request resolution is not dismissal',
    );
    await app.foreground('inactive');
    await act(async () => {
      ad.emit('opened');
      ad.emit('closed');
      await settle();
    });
    assert.equal(
      app.events.includes('music-resume'),
      false,
      'iOS must return active before audible resume',
    );
    assert.equal(
      app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
      false,
    );
    await app.foreground('active');
    const result = await starting;
    assert.equal(result.shown, true);
    assert.equal(result.performed, true);
    assert.equal(app.musicPlaying, true);
    assert.equal(app.cueLeases, 1, 'queue and cue ownership survive the whole ad');
    assert.ok(app.events.indexOf('music-pause-ack') < app.events.indexOf('native-show'));
    assert.ok(
      app.events.indexOf('music-resume') <
        app.events.findIndex((event) => Array.isArray(event) && event[0] === 'begin'),
    );
    assert.deepEqual(
      app.events.filter((event) =>
        ['sdk-load', 'consent-info', 'consent-form', 'native-init'].includes(event),
      ),
      nativeBefore,
    );
  } finally {
    app.nativeAds.forEach((ad) => {
      if (ad.presenting) ad.emit('closed');
    });
    await app.close();
    if (starting) await starting;
  }
});

test('verified Pro and unavailable consent keep music and Start independent of all native ad work', async () => {
  for (const options of [{ pro: true }, { consentAllowed: false }, { subscriptionReady: false }]) {
    const app = await mount({ music: true, ...options });
    try {
      await app.playMusic();
      const before = [...app.events];
      const result = await act(async () => app.scene.api.startOrToggle());
      assert.equal(result.performed, true);
      assert.equal(result.shown, false);
      assert.equal(app.musicPlaying, true);
      assert.equal(app.nativeAds.length, 0);
      assert.equal(app.events.includes('music-pause-request'), false);
      assert.deepEqual(
        app.events.filter((event) =>
          [
            'sdk-load',
            'consent-info',
            'consent-form',
            'native-init',
            'native-load',
            'native-show',
          ].includes(event),
        ),
        before.filter((event) =>
          [
            'sdk-load',
            'consent-info',
            'consent-form',
            'native-init',
            'native-load',
            'native-show',
          ].includes(event),
        ),
      );
      if (options.pro) assert.equal(app.events.includes('sdk-load'), false);
    } finally {
      await app.close();
    }
  }
});

test('an unrelated presentation lease survives the music yield and no ad is requested behind it', async () => {
  const app = await mount({ music: true });
  let release;
  try {
    await app.prepare();
    await app.playMusic();
    await act(async () => {
      release = app.scene.ads.acquirePresentationBlocker();
    });
    const result = await act(async () => app.scene.api.startOrToggle());
    assert.equal(result.performed, true);
    assert.equal(result.shown, false);
    assert.equal(app.nativeAds.length, 1);
    assert.equal(app.musicPlaying, true);
    await act(async () => app.scene.music.player.clear());
    assert.equal(
      app.scene.ads.canPresentAds(),
      false,
      'clearing music does not release the unrelated lease',
    );
    await act(async () => release());
    release = null;
    assert.equal(app.scene.ads.accountEligible, true);
  } finally {
    release?.();
    await app.close();
  }
});

test('a previously paused queue stays paused after a Start ad', async () => {
  const app = await mount({ music: true });
  let starting;
  try {
    await app.prepare();
    await app.playMusic();
    await act(async () => app.scene.music.player.pause());
    await act(async () => {
      starting = app.scene.api.startOrToggle();
      await settle();
    });
    const ad = app.nativeAds.at(-1);
    await act(async () => {
      ad.emit('loaded');
      await settle();
    });
    assert.equal(ad.shows, 1);
    await act(async () => {
      ad.emit('closed');
      await starting;
    });
    assert.equal((await starting).performed, true);
    assert.equal(app.musicPlaying, false);
    assert.equal(app.events.includes('music-resume'), false);
    assert.equal(app.cueLeases, 1);
  } finally {
    app.nativeAds.forEach((ad) => {
      if (ad.presenting) ad.emit('closed');
    });
    await app.close();
    if (starting) await starting;
  }
});

test('a missing Start creative is bounded and a late load never interrupts the new session', async () => {
  const app = await mount({ music: true });
  try {
    await app.prepare();
    await app.playMusic();
    const result = await act(async () => app.scene.api.startOrToggle());
    assert.equal(result.performed, true);
    assert.equal(result.shown, false);
    assert.equal(app.nativeAds.length, 2);
    const late = app.nativeAds.at(-1);
    assert.equal(late.destroys, 1);
    assert.equal(app.musicPlaying, true);
    await act(async () => {
      late.emit('loaded');
      await settle();
    });
    assert.equal(late.shows, 0);
    assert.equal(app.scene.workout.isWorkoutRunning, true);
  } finally {
    await app.close();
  }
});

test('music Pause, new queue, real background and routine/account changes cancel the old Start continuation', async () => {
  for (const boundary of ['pause', 'next', 'new-queue', 'background', 'routine', 'account']) {
    const app = await mount({ music: true });
    let starting;
    let next;
    try {
      await app.prepare();
      await app.playMusic();
      await act(async () => {
        starting = app.scene.api.startOrToggle();
        await settle();
      });
      const ad = app.nativeAds.at(-1);
      await act(async () => {
        ad.emit('loaded');
        await settle();
      });
      assert.equal(ad.shows, 1);
      if (boundary === 'pause') await act(async () => app.scene.music.player.pause());
      if (boundary === 'next') {
        await act(async () => {
          next = app.scene.music.player.next();
          await settle();
        });
        assert.equal(app.events.includes('music-next'), false, 'Next waits for native ad close');
      }
      if (boundary === 'new-queue') {
        await act(async () => {
          next = app.scene.music.player.playTrack({
            id: '67890',
            uri: 'apple-music:song:67890',
            platform: 'appleMusic',
          });
          await settle();
        });
        assert.equal(
          app.events.filter((event) => event === 'music-start').length,
          1,
          'a new audible queue waits for native ad close',
        );
      }
      if (boundary === 'background') {
        await app.foreground('background');
        await app.foreground('active');
      }
      if (boundary === 'routine')
        await app.update({ workout: { ...app.scene.workout, selectedRoutine: { id: 'another' } } });
      if (boundary === 'account')
        await app.update({
          auth: { ...app.scene.auth, user: { id: 'account-b' } },
          subscription: { ...app.scene.subscription, userId: 'account-b' },
        });
      assert.equal(
        app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
        false,
      );
      await act(async () => {
        ad.emit('closed');
        await settle();
      });
      const result = await starting;
      if (next) await next;
      assert.equal(result.performed, false, boundary);
      assert.equal(
        app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
        false,
      );
      assert.equal(app.events.includes('music-resume'), false);
    } finally {
      app.nativeAds.forEach((ad) => {
        if (ad.presenting) ad.emit('closed');
      });
      await app.close();
      if (starting) await starting;
      if (next) await next;
    }
  }
});

test('guest Apple Music playback needs neither a Sync account nor an enabled ad system', async () => {
  const app = await mount({ music: true, guest: true, adsEnabled: false });
  try {
    assert.equal(app.scene.auth.user, null);
    await app.playMusic();
    assert.equal(app.musicPlaying, true);
    assert.equal(app.nativeAds.length, 0);
    assert.equal(app.events.includes('sdk-load'), false);
    assert.equal(app.events.includes('music-pause-request'), false);
    const result = await act(async () => app.scene.api.startOrToggle());
    assert.equal(result.performed, true);
    assert.equal(app.musicPlaying, true);
  } finally {
    await app.close();
  }
});

test('active and paused/rest timer toggles and Finish never borrow the music lease', async () => {
  const app = await mount({ music: true });
  try {
    await app.prepare();
    await app.playMusic();
    for (const state of [
      { isPaused: false, currentPhase: 'work' },
      { isPaused: true, currentPhase: 'rest' },
    ]) {
      await app.update({ workout: { ...app.scene.workout, ...state, isWorkoutRunning: true } });
      await act(async () => app.scene.api.startOrToggle());
    }
    await app.update({
      sessionKey: 'completed-with-music',
      workout: { ...app.scene.workout, isWorkoutRunning: false },
    });
    const result = await act(async () => app.scene.api.finish());
    assert.equal(result.performed, true);
    assert.equal(result.shown, false);
    assert.equal(app.events.includes('music-pause-request'), false);
    assert.equal(app.events.includes('music-resume'), false);
    assert.equal(app.nativeAds.length, 1);
    assert.equal(app.musicPlaying, true);
    assert.equal(app.events.filter((event) => event === 'toggle').length, 2);
  } finally {
    await app.close();
  }
});

test('a visible music selector blocks a stale timer Start without gating music access', async () => {
  const app = await mount({ music: true });
  try {
    await app.prepare();
    await app.playMusic();
    await act(async () =>
      app.scene.music.openSoundtrackPicker({ routineName: 'Draft', onSelect: () => {} }),
    );
    assert.equal(app.scene.music.soundtrackPicker.initialTab, 'library');
    const result = await act(async () => app.scene.api.startOrToggle());
    assert.equal(result.performed, false);
    assert.equal(app.musicPlaying, true);
    assert.equal(app.events.includes('music-pause-request'), false);
    assert.equal(app.nativeAds.length, 1);
    await act(async () => app.scene.music.player.close());
  } finally {
    await app.close();
  }
});

test('failed music pause skips the ad and keeps free core Start usable', async () => {
  const app = await mount({ music: true });
  try {
    await app.prepare();
    await app.playMusic();
    app.musicControls.pauseFails = true;
    const result = await act(async () => app.scene.api.startOrToggle());
    assert.equal(result.performed, true);
    assert.equal(result.shown, false);
    assert.equal(app.musicPlaying, true);
    assert.equal(app.nativeAds.length, 1);
    assert.equal(app.scene.ads.canPresentAds(), false);
  } finally {
    app.musicControls.pauseFails = false;
    await app.close();
  }
});

test('failed post-ad music resume retains ownership, reports error and cancels Start', async () => {
  const app = await mount({ music: true });
  let starting;
  try {
    await app.prepare();
    await app.playMusic();
    app.musicControls.resumeFails = true;
    await act(async () => {
      starting = app.scene.api.startOrToggle();
      await settle();
    });
    const ad = app.nativeAds.at(-1);
    await act(async () => {
      ad.emit('loaded');
      await settle();
    });
    assert.equal(ad.shows, 1);
    await act(async () => {
      ad.emit('closed');
      await starting;
    });
    assert.equal((await starting).performed, false);
    assert.equal(app.scene.music.player.ownsQueue, true);
    assert.match(app.scene.music.error, /resume failed/);
    assert.equal(app.scene.ads.canPresentAds(), false);
    assert.equal(app.musicPlaying, false);
  } finally {
    app.nativeAds.forEach((ad) => {
      if (ad.presenting) ad.emit('closed');
    });
    await app.close();
    if (starting) await starting;
  }
});

test('a native-cancelled music resume cancels Start even without an account or queue replacement', async () => {
  const app = await mount({ music: true });
  let starting;
  try {
    await app.prepare();
    await app.playMusic();
    const routine = app.scene.workout.selectedRoutine;
    app.musicControls.resumeCancelled = true;
    await act(async () => {
      starting = app.scene.api.startOrToggle();
      await settle();
    });
    const ad = app.nativeAds.at(-1);
    await act(async () => {
      ad.emit('loaded');
      await settle();
    });
    assert.equal(ad.shows, 1);
    await act(async () => {
      ad.emit('closed');
      await starting;
    });
    assert.equal(app.scene.workout.selectedRoutine, routine);
    assert.equal(app.scene.auth.user.id, 'account-a');
    assert.equal(app.scene.music.player.ownsQueue, true);
    assert.equal((await starting).performed, false);
    assert.equal(
      app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
      false,
    );
    assert.equal(app.musicPlaying, false);
  } finally {
    app.nativeAds.forEach((ad) => {
      if (ad.presenting) ad.emit('closed');
    });
    await app.close();
    if (starting) await starting;
  }
});

test('unmount retires Start and music resume but never invents native ad dismissal', async () => {
  const app = await mount({ music: true });
  let starting;
  let settled = false;
  try {
    await app.prepare();
    await app.playMusic();
    await act(async () => {
      starting = app.scene.api.startOrToggle();
      starting.then(() => {
        settled = true;
      });
      await settle();
    });
    const ad = app.nativeAds.at(-1);
    await act(async () => {
      ad.emit('loaded');
      await settle();
    });
    assert.equal(ad.shows, 1);
    await app.close();
    await settle();
    assert.equal(settled, false);
    assert.equal(ad.destroys, 0, 'terminal native listeners stay alive after unmount');
    ad.emit('closed');
    const result = await starting;
    assert.equal(result.performed, false);
    assert.equal(ad.destroys, 1);
    assert.equal(app.events.includes('music-resume'), false);
    assert.equal(
      app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
      false,
    );
  } finally {
    app.nativeAds.forEach((ad) => {
      if (ad.presenting) ad.emit('closed');
    });
    if (starting) await starting;
  }
});

test('companion ownership retires a ready ad while Start and Finish remain usable', async () => {
  const app = await mount();
  let release;
  try {
    const ad = await app.prepare();
    await act(async () => {
      release = app.scene.ads.acquirePresentationBlocker();
      assert.equal(app.scene.ads.canPresentAds(), false, 'Gate changes before React renders');
    });
    assert.equal(app.scene.ads.accountEligible, false);
    assert.equal(app.scene.ads.presenterBlocked, false, 'Music must not block core actions');
    assert.equal(ad.destroys, 1);
    let started;
    await act(async () => {
      started = await app.scene.api.startOrToggle();
    });
    assert.equal(started.performed, true);
    assert.equal(started.shown, false);
    assert.equal(ad.shows, 0);
    await app.update({
      sessionKey: 'completed-during-companion',
      workout: { ...app.scene.workout, isWorkoutRunning: false },
    });
    let finished;
    await act(async () => {
      finished = await app.scene.api.finish();
    });
    assert.equal(finished.performed, true);
    assert.equal(finished.shown, false);
    assert.equal(
      app.events.some((event) => Array.isArray(event) && event[0] === 'finish'),
      true,
    );
    assert.equal(app.nativeAds.length, 1, 'Owned paused music also prevents a new preload');
    await act(async () => release());
    assert.equal(app.scene.ads.accountEligible, true);
  } finally {
    await app.close();
  }
});

test('background then music lease release in one tick cannot reopen the foreground gate', async () => {
  const app = await mount();
  try {
    await app.prepare();
    await act(async () => {
      const release = app.scene.ads.acquirePresentationBlocker();
      app.emitAppState('background');
      release();
      assert.equal(app.scene.ads.canPresentAds(), false);
      const held = app.scene.ads.acquirePresentationBlocker();
      held();
      assert.equal(app.scene.ads.canPresentAds(), false);
    });
    assert.equal(app.scene.ads.appActive, false);
    assert.equal(app.scene.ads.ready, false);
    assert.equal(app.nativeAds.length, 1);
  } finally {
    await app.close();
  }
});

test('disabled native-present provider hides Profile privacy choices and never starts consent or ads', async () => {
  for (const dev of [false, true]) {
    const app = await mount({ adsEnabled: false, dev, profile: true });
    try {
      assert.equal(app.scene.ads.adsEnabled, false);
      assert.equal(app.scene.ads.nativeAvailable, true);
      assert.equal(privacyRows(app).length, 0);
      let release;
      await act(async () => {
        release = app.scene.ads.acquirePlacement(() => true);
        assert.equal((await app.scene.ads.requestPrivacyOptions(() => true)).changed, false);
      });
      await app.foreground('background');
      await app.foreground('active');
      await act(async () => {
        assert.equal((await app.scene.ads.requestPrivacyOptions(() => true)).changed, false);
        release();
      });
      assert.deepEqual(app.events, []);
      assert.equal(app.scene.ads.privacyOptionsBusy, false);
      assert.equal(app.scene.ads.error, null);
      assert.equal(app.scene.ads.initialized, false);
      assert.equal(app.scene.ads.canRequestAds, false);
      assert.equal(privacyRows(app).length, 0);
    } finally {
      await app.close();
    }
  }
});

test('enabled cold-Pro Profile opens privacy choices and rejects a captured action after disablement', async () => {
  const app = await mount({ pro: true, profile: true, privacyRequired: true });
  try {
    assert.equal(app.scene.ads.adsEnabled, true);
    assert.equal(app.scene.ads.accountEligible, false);
    assert.deepEqual(app.events, []);
    const captured = privacyRows(app)[0].props.onPress;
    await act(async () => captured());
    assert.deepEqual(app.events, ['sdk-load', 'consent-info', 'privacy-form']);
    assert.equal(app.scene.ads.initialized, false);
    assert.equal(app.scene.ads.canRequestAds, false);

    // Keep the real controller enabled to prove the Profile callback itself
    // rejects a stale entry when its current context disables the action.
    await app.update({ adsOverride: { adsEnabled: false } });
    assert.equal(privacyRows(app).length, 0);
    const before = [...app.events];
    await act(async () => captured());
    assert.deepEqual(app.events, before);
  } finally {
    await app.close();
  }
});

test('verified Pro starts the free core without loading consent, SDK or any native interstitial', async () => {
  const app = await mount({ pro: true });
  try {
    let starting;
    await act(async () => {
      starting = app.scene.api.startOrToggle();
      await starting;
    });
    assert.equal((await starting).performed, true);
    assert.equal(
      app.events.filter((event) => Array.isArray(event) && event[0] === 'begin').length,
      1,
    );
    assert.equal(app.nativeAds.length, 0);
    assert.equal(app.events.includes('sdk-load'), false);
    assert.equal(app.events.includes('consent-info'), false);
    assert.equal(app.events.includes('native-show'), false);
  } finally {
    await app.close();
  }
});

test('the preparation hold keeps a cached Free ad showable and releases after the workout commits', async () => {
  const app = await mount();
  try {
    const ad = await app.prepare();
    let first;
    let duplicate;
    await act(async () => {
      first = app.scene.api.startOrToggle();
      duplicate = app.scene.api.startOrToggle();
      await settle();
    });
    assert.equal(first, duplicate);
    assert.equal(ad.shows, 1, 'The preparation hold must not invalidate an already-ready ad');
    assert.equal(
      app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
      false,
    );
    await act(async () => {
      ad.emit('opened');
      ad.emit('closed');
      await first;
    });
    assert.equal((await first).performed, true);
    assert.deepEqual(
      app.events.filter((event) => Array.isArray(event) && event[0] === 'release'),
      [['release', true]],
    );
    assert.equal(
      app.nativeAds.length,
      1,
      'Starting the timer prevents a new preload at hold release',
    );
  } finally {
    await app.close();
  }
});

test('a previously visible UMP form drains before Start and cannot reopen behind the workout', async () => {
  const form = deferred();
  const app = await mount({ form });
  try {
    assert.equal(app.events.includes('consent-form'), true);
    let starting;
    await act(async () => {
      starting = app.scene.api.startOrToggle();
      await settle();
    });
    assert.equal(
      app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
      false,
    );
    await act(async () => {
      form.resolve();
      await starting;
    });
    assert.equal((await starting).performed, true);
    assert.equal(
      app.events.indexOf('consent-closed') <
        app.events.findIndex((event) => Array.isArray(event) && event[0] === 'begin'),
      true,
    );
    assert.equal(app.events.filter((event) => event === 'consent-form').length, 1);
    assert.equal(app.events.includes('native-show'), false);
  } finally {
    form.resolve();
    await app.close();
  }
});

test('late identity, routine, blur and global auth modal changes cancel the old Start after close', async () => {
  for (const change of [
    (scene) => ({ auth: { ...scene.auth, user: { id: 'account-b' } } }),
    (scene) => ({ workout: { ...scene.workout, selectedRoutine: { id: 'routine-one' } } }),
    () => ({ focused: false }),
    () => ({ globalBlocked: true }),
  ]) {
    const app = await mount();
    try {
      const ad = await app.prepare();
      let starting;
      await act(async () => {
        starting = app.scene.api.startOrToggle();
        await settle();
      });
      assert.equal(ad.shows, 1);
      await app.update(change(app.scene));
      await act(async () => {
        ad.emit('opened');
        ad.emit('closed');
        await starting;
      });
      assert.equal((await starting).performed, false);
      assert.equal(
        app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
        false,
      );
    } finally {
      await app.close();
    }
  }
});

test('native CLOSED waits for the actual foreground transition before beginning', async () => {
  const app = await mount();
  try {
    const ad = await app.prepare();
    let starting;
    await act(async () => {
      starting = app.scene.api.startOrToggle();
      await settle();
      ad.emit('opened');
    });
    await app.foreground('inactive');
    await act(async () => {
      ad.emit('closed');
      await settle();
    });
    assert.equal(
      app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
      false,
    );
    await app.foreground('active');
    await act(async () => starting);
    assert.equal((await starting).performed, true);
  } finally {
    await app.close();
  }
});

test('unmount releases the preparation hold but cannot start after the retained native barrier closes', async () => {
  const app = await mount();
  const ad = await app.prepare();
  let starting;
  await act(async () => {
    starting = app.scene.api.startOrToggle();
    await settle();
  });
  await app.close();
  assert.equal(ad.destroys, 0, 'Keep the native terminal listener while the ad remains visible');
  assert.deepEqual(
    app.events.filter((event) => Array.isArray(event) && event[0] === 'release'),
    [['release', false]],
  );
  ad.emit('closed');
  assert.equal((await starting).performed, false);
  assert.equal(
    app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
    false,
  );
});

test('running and paused controls bypass session ads and use the existing workout toggle', async () => {
  const app = await mount({ active: true });
  try {
    await act(async () => app.scene.api.startOrToggle());
    assert.equal(app.events.includes('toggle'), true);
    assert.equal(app.events.includes('sdk-load'), false);
    assert.equal(app.events.includes('hold'), false);
  } finally {
    await app.close();
  }
});

test('a Start pressed during Finish shares its barrier and only dismisses the captured summary', async () => {
  const app = await mount({ sessionKey: 'ended-session' });
  try {
    const ad = await app.prepare();
    let finishing;
    let starting;
    await act(async () => {
      finishing = app.scene.api.finish();
      starting = app.scene.api.startOrToggle();
      await settle();
    });
    assert.equal(finishing, starting);
    assert.equal(ad.shows, 1);
    await act(async () => {
      ad.emit('opened');
      ad.emit('closed');
      await finishing;
    });
    assert.equal((await finishing).kind, 'finish');
    assert.deepEqual(
      app.events.filter((event) => Array.isArray(event) && event[0] === 'finish'),
      [['finish', 'ended-session']],
    );
    assert.equal(
      app.events.some((event) => Array.isArray(event) && event[0] === 'begin'),
      false,
    );
  } finally {
    await app.close();
  }
});
