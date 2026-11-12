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
const profileCode = compile(
  '../src/screens/Profile/ProfileScreen.js',
  [['export default function ProfileScreen', 'function ProfileScreen']],
  'globalThis.ProfileScreen = ProfileScreen;',
);

async function mount(options = {}) {
  const events = [];
  const nativeAds = [];
  const listeners = new Set();
  const deviceConsentInfo = {
    ...consentInfo,
    privacyOptionsRequirementStatus: options.privacyRequired ? 'REQUIRED' : 'NOT_REQUIRED',
  };
  const scene = {
    auth: { ready: true, user: { id: 'account-a' }, recoveryMode: false },
    subscription: {
      ready: true,
      userId: 'account-a',
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
      createForAdRequest() {
        events.push('native-create');
        const callbacks = new Map();
        const ad = {
          shows: 0,
          destroys: 0,
          addAdEventListener(type, callback) {
            callbacks.set(type, callback);
            return () => callbacks.delete(type);
          },
          load() {
            events.push('native-load');
          },
          async show() {
            this.shows++;
            events.push('native-show');
          },
          destroy() {
            this.destroys++;
            callbacks.clear();
          },
          emit(type) {
            callbacks.get(type)?.();
          },
        };
        nativeAds.push(ad);
        return ad;
      },
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
      React.createElement(Consumer),
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
    renderer,
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
