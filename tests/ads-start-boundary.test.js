import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createAdsController } from '../src/services/ads/controller.js';
import { createAdsConfig } from '../src/services/ads/config.js';
import { createNativeAdsRuntime } from '../src/services/ads/sdk.js';
import { createInterstitialController } from '../src/services/ads/interstitials.js';
import { createPresentationBlockers } from '../src/services/ads/presentationBlockers.js';
import { canUseAdsAccount } from '../src/services/ads/eligibility.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const settle = () => new Promise(setImmediate);
const source = readFileSync(new URL('../src/context/AdsContext.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
  .replace('export function AdsProvider', 'function AdsProvider')
  .replace('export function useAds', 'function useAds');
const code = transformSync(
  `${source}\nglobalThis.Provider = AdsProvider; globalThis.readAds = useAds;`,
  {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  },
).code;

async function mount(t, options = {}) {
  let time = 0;
  let nextTimer = 0;
  const timers = new Map();
  const events = [];
  const ads = [];
  const appListeners = new Set();
  const consent = {
    canRequestAds: options.consent !== false,
    privacyOptionsRequirementStatus: 'NOT_REQUIRED',
  };
  const scene = {
    auth: { ready: true, user: { id: 'free-account' } },
    subscription: {
      ready: true,
      userId: 'free-account',
      accessVerified: true,
      isPro: false,
      pending: false,
      loading: false,
      ...options.subscription,
    },
    blocked: false,
  };
  const record = (name) => async () => {
    events.push(name);
  };
  const sdk = {
    default: () => ({
      setAppMuted: record('mute'),
      setAppVolume: record('volume'),
      setRequestConfiguration: record('configure'),
      initialize: record('initialize'),
    }),
    AdsConsent: {
      requestInfoUpdate: async () => {
        events.push('consent-info');
        return consent;
      },
      loadAndShowConsentFormIfRequired: async () => {
        events.push('consent-form');
        return consent;
      },
      getConsentInfo: async () => {
        events.push('consent-get');
        return consent;
      },
      showPrivacyOptionsForm: async () => {
        events.push('privacy-form');
        return consent;
      },
    },
    BannerAd() {},
    BannerAdSize: { LARGE_ANCHORED_ADAPTIVE_BANNER: 'adaptive' },
    TestIds: { ADAPTIVE_BANNER: 'test-banner', INTERSTITIAL: 'test-interstitial' },
    AdEventType: { LOADED: 'loaded', OPENED: 'opened', CLOSED: 'closed', ERROR: 'error' },
    InterstitialAd: {
      createForAdRequest() {
        events.push('create');
        const callbacks = new Map();
        const history = new Map();
        const ad = {
          loads: 0,
          shows: 0,
          destroys: 0,
          addAdEventListener(type, callback) {
            callbacks.set(type, callback);
            history.set(type, callback);
            return () => callbacks.delete(type);
          },
          load() {
            this.loads++;
            events.push('load');
          },
          show() {
            this.shows++;
            events.push('show');
            return Promise.resolve();
          },
          destroy() {
            this.destroys++;
            callbacks.clear();
            events.push('destroy');
          },
          emit(type) {
            callbacks.get(type)?.();
          },
          late(type) {
            history.get(type)?.();
          },
        };
        ads.push(ad);
        return ad;
      },
    },
  };
  const context = {
    ...React,
    React,
    AppState: {
      currentState: 'active',
      addEventListener(_event, callback) {
        appListeners.add(callback);
        return { remove: () => appListeners.delete(callback) };
      },
    },
    NativeModules: {},
    TurboModuleRegistry: { get: () => ({}) },
    Platform: { OS: 'ios' },
    useAuth: () => scene.auth,
    useSubscription: () => scene.subscription,
    createAdsConfig,
    createAdsController,
    createNativeAdsRuntime,
    createPresentationBlockers,
    createInterstitialController: (config) =>
      createInterstitialController({
        ...config,
        now: () => time,
        setTimer(callback, delay) {
          const id = ++nextTimer;
          timers.set(id, { at: time + delay, callback });
          return id;
        },
        clearTimer: (id) => timers.delete(id),
      }),
    canUseAdsAccount,
    __DEV__: true,
    process: { env: { EXPO_PUBLIC_ADS_ENABLED: 'true' } },
    require() {
      events.push('sdk-load');
      return sdk;
    },
  };
  new Script(code).runInNewContext(context);
  function Probe() {
    scene.api = context.readAds();
    return null;
  }
  let renderer;
  const element = () =>
    React.createElement(context.Provider, { blocked: scene.blocked }, React.createElement(Probe));
  await act(async () => {
    renderer = create(element());
  });
  t.after(async () => {
    await act(async () => renderer.unmount());
  });
  const ui = {
    scene,
    events,
    ads,
    timers,
    async warm() {
      let release;
      await act(async () => {
        release = scene.api.acquirePlacement(() => true);
        await settle();
      });
      return release;
    },
    async act(operation) {
      await act(async () => {
        operation();
        await settle();
      });
    },
    async start(options = {}) {
      let promise;
      await act(async () => {
        promise = scene.api.showStartInterstitial({ opportunityId: 'start:music', ...options });
        await settle();
      });
      return { promise };
    },
    async emit(index, event) {
      await act(async () => {
        ads[index].emit(event);
        await settle();
      });
    },
    async advance(ms) {
      time += ms;
      await act(async () => {
        for (const [id, timer] of [...timers])
          if (timer.at <= time && timers.delete(id)) timer.callback();
        await settle();
      });
    },
    async update({ auth = {}, subscription = {}, blocked = scene.blocked } = {}) {
      Object.assign(scene.auth, auth);
      Object.assign(scene.subscription, subscription);
      scene.blocked = blocked;
      await act(async () => {
        renderer.update(element());
        await settle();
      });
    },
    async appState(status) {
      await act(async () => {
        for (const listener of appListeners) listener(status);
        await settle();
      });
    },
  };
  return ui;
}

async function cachedMusic(t) {
  const ui = await mount(t);
  const releaseIdle = await ui.warm();
  let releaseSession, releaseMusic;
  await ui.act(() => {
    ui.scene.api.recordInterstitialAction({ opportunityId: 'select:routine' });
    releaseSession = ui.scene.api.holdAdPreparation();
    releaseMusic = ui.scene.api.acquirePresentationBlocker();
    releaseIdle();
  });
  return { ...ui, releaseSession, releaseMusic };
}

test('real AdsProvider reuses cached consent after the music lease yields and waits for native CLOSED', async (t) => {
  const ui = await cachedMusic(t);
  assert.equal(
    ui.scene.api.accountEligible,
    false,
    'The active music lease masks the public account gate',
  );
  assert.equal(ui.scene.api.ready, false);
  assert.equal(
    ui.scene.api.canPrepareMusicStartAd(),
    true,
    'Raw Free + retained device preparation qualifies',
  );
  const nativePreparation = ui.events.slice();
  await ui.act(ui.releaseMusic);
  assert.equal(ui.scene.api.ready, false, 'Yield does not run UMP while the caller hold remains');
  const { promise } = await ui.start({
    beforePresent: () => {
      ui.events.push('before-present');
      return true;
    },
  });
  assert.equal(ui.ads.length, 1);
  assert.equal(ui.ads[0].loads, 1);
  assert.equal(ui.ads[0].shows, 0);
  assert.equal(ui.scene.api.ready, true);
  await ui.emit(0, 'loaded');
  assert.equal(ui.ads[0].shows, 1);
  assert.deepEqual(
    ui.events.filter((event) => nativePreparation.includes(event)),
    nativePreparation,
  );
  assert.ok(ui.events.indexOf('before-present') < ui.events.indexOf('show'));
  let done = false;
  promise.then(() => {
    done = true;
  });
  await ui.advance(600000);
  assert.equal(done, false);
  await ui.appState('inactive');
  assert.equal(done, false, 'Native full-screen inactive cannot release its barrier');
  await ui.emit(0, 'closed');
  assert.deepEqual(await promise, { shown: true, reason: 'closed' });
  assert.equal(ui.ads[0].destroys, 1);
  assert.equal(ui.scene.api.ready, false, 'The boundary placement was cleaned up');
  assert.equal(await ui.scene.api.requestPrivacyOptions().then((value) => value.changed), false);
  assert.equal(
    ui.events.includes('privacy-form'),
    false,
    'Only the caller releases its retained hold',
  );
  await ui.act(ui.releaseSession);
});

test('cold, denied, unknown and Pro boundaries quietly skip without new SDK, UMP or creative calls', async (t) => {
  for (const subscription of [
    {},
    { isPro: true },
    { ready: false },
    { pending: true },
    { accessVerified: false },
  ]) {
    const ui = await mount(t, { subscription });
    let release;
    await ui.act(() => {
      release = ui.scene.api.holdAdPreparation();
    });
    assert.equal(ui.scene.api.canPrepareMusicStartAd(), false);
    const { promise } = await ui.start();
    assert.equal((await promise).shown, false);
    assert.deepEqual(ui.events, []);
    await ui.act(release);
  }
  const denied = await mount(t, { consent: false });
  const release = await denied.warm();
  const before = denied.events.slice();
  assert.equal(denied.scene.api.canPrepareMusicStartAd(), false);
  const { promise } = await denied.start();
  assert.equal((await promise).shown, false);
  assert.deepEqual(denied.events, before);
  assert.equal(denied.events.includes('initialize'), false);
  await denied.act(release);
});

test('another presentation lease or parent modal blocks the actual Start boundary after music yields', async (t) => {
  const ui = await cachedMusic(t);
  let releaseOther;
  await ui.act(() => {
    releaseOther = ui.scene.api.acquirePresentationBlocker();
    ui.releaseMusic();
  });
  const before = ui.events.slice();
  const blocked = await ui.start();
  assert.equal((await blocked.promise).shown, false);
  assert.deepEqual(ui.events, before);
  assert.equal(ui.scene.api.featurePresentationBlocked, true);
  await ui.act(releaseOther);
  await ui.update({ blocked: true });
  assert.equal(ui.scene.api.canPrepareMusicStartAd(), false);
  const parentBlocked = await ui.start({ opportunityId: 'start:parent-modal' });
  assert.equal((await parentBlocked.promise).shown, false);
  assert.deepEqual(ui.events, before);
  await ui.act(ui.releaseSession);
});

test('Start readiness has one 1500ms budget; timeout and late LOADED never present or restart preparation', async (t) => {
  const ui = await cachedMusic(t);
  await ui.act(ui.releaseMusic);
  const before = ui.events.slice();
  let guardCalls = 0;
  const { promise } = await ui.start({
    beforePresent: () => {
      guardCalls++;
      return true;
    },
  });
  let done = false;
  promise.then(() => {
    done = true;
  });
  await ui.advance(1499);
  assert.equal(done, false);
  await ui.advance(1);
  assert.equal((await promise).shown, false);
  assert.equal(ui.ads[0].loads, 1);
  assert.equal(ui.ads[0].destroys, 1);
  await ui.act(() => ui.ads[0].late('loaded'));
  assert.equal(ui.ads[0].shows, 0);
  assert.equal(guardCalls, 0);
  assert.equal(ui.scene.api.interstitialLoaded, false);
  assert.deepEqual(
    ui.events.filter((event) => before.includes(event)),
    before,
  );
  assert.equal(await ui.scene.api.requestPrivacyOptions().then((value) => value.changed), false);
  await ui.act(ui.releaseSession);
});

test('captured identity and caller safety retire delayed creative results before native presentation', async (t) => {
  for (const change of ['identity', 'pro', 'background', 'caller']) {
    const ui = await cachedMusic(t);
    await ui.act(ui.releaseMusic);
    let eligible = true;
    let guarded = 0;
    const { promise } = await ui.start({
      isEligible: () => eligible,
      beforePresent: () => {
        guarded++;
        return true;
      },
    });
    if (change === 'identity') await ui.update({ auth: { user: { id: 'other-account' } } });
    if (change === 'pro') await ui.update({ subscription: { isPro: true } });
    if (change === 'background') await ui.appState('background');
    if (change === 'caller') eligible = false;
    await ui.act(() => ui.ads[0].late('loaded'));
    assert.equal((await promise).shown, false, change);
    assert.equal(ui.ads[0].shows, 0, change);
    assert.equal(guarded, 0, change);
    await ui.act(ui.releaseSession);
  }
});

test('synchronous beforePresent changes are rechecked against other leases without releasing those leases', async (t) => {
  const ui = await cachedMusic(t);
  await ui.act(ui.releaseMusic);
  let releaseOther;
  const { promise } = await ui.start({
    beforePresent: () => {
      releaseOther = ui.scene.api.acquirePresentationBlocker();
      return true;
    },
  });
  await ui.emit(0, 'loaded');
  assert.equal((await promise).shown, false);
  assert.equal(ui.ads[0].shows, 0);
  assert.equal(ui.ads[0].destroys, 1);
  assert.equal(
    ui.scene.api.featurePresentationBlocked,
    true,
    'Boundary cleanup does not release the new unrelated lease',
  );
  await ui.act(releaseOther);
  assert.equal(ui.scene.api.featurePresentationBlocked, false);
  assert.equal(await ui.scene.api.requestPrivacyOptions().then((value) => value.changed), false);
  await ui.act(ui.releaseSession);
});
