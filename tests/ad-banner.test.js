import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { canPrepareAds, canShowBanner, canUseAdsAccount } from '../src/services/ads/eligibility.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(new URL('../src/components/ads/AdBanner.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
  .replace('export default function AdBanner', 'function AdBanner');
const compiled = transformSync(`${source}\nglobalThis.Component = AdBanner;`, {
  configFile: false,
  babelrc: false,
  plugins: ['@babel/plugin-transform-react-jsx'],
}).code;

async function harness(overrides = {}) {
  const scene = {
    focused: true,
    auth: { ready: true, user: null, recoveryMode: false },
    subscription: {
      ready: true,
      userId: null,
      isPro: false,
      pending: false,
      loading: false,
      accessVerified: false,
    },
    workout: { isWorkoutRunning: false, isMusicPlaying: false, isAudioSyncing: false },
    ...overrides,
  };
  let acquired = 0;
  let released = 0;
  const native = [];
  const preparationChecks = [];
  const listeners = new Set();
  const ads = {
    accountEligible: true,
    initialized: true,
    canRequestAds: true,
    consentReady: true,
    bannerUnitId: 'test-banner',
    bannerSize: 'LARGE_ANCHORED_ADAPTIVE_BANNER',
    requestOptions: { requestNonPersonalizedAdsOnly: true },
    acquirePlacement(check) {
      acquired++;
      preparationChecks.push(check);
      return () => {
        released++;
      };
    },
    BannerComponent(props) {
      native.push(props);
      return React.createElement('NativeBanner', props);
    },
    ...overrides.ads,
  };
  const appState = {
    currentState: 'active',
    addEventListener(_event, listener) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
  };
  const context = {
    React,
    useEffect: React.useEffect,
    useRef: React.useRef,
    useState: React.useState,
    AppState: appState,
    View: 'View',
    Text: 'Text',
    StyleSheet: { create: (value) => value },
    useWindowDimensions: () => ({ width: 390 }),
    useIsFocused: () => scene.focused,
    useAuth: () => scene.auth,
    useSubscription: () => scene.subscription,
    useWorkout: () => scene.workout,
    useAds: () => ads,
    useTheme: () => ({ theme: { textSecondary: '#555' } }),
    canPrepareAds,
    canShowBanner,
    canUseAdsAccount,
  };
  new Script(compiled).runInNewContext(context);
  let props = { placementVisible: true, hasBlockingModal: false };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(context.Component, props));
  });
  const measure = async (width = 350) => {
    const placement = renderer.root.findAllByType('View').find((node) => node.props.onLayout);
    if (placement)
      await act(async () => placement.props.onLayout({ nativeEvent: { layout: { width } } }));
  };
  if (!overrides.deferLayout) await measure();
  return {
    scene,
    preparationChecks,
    ads,
    native,
    acquired: () => acquired,
    released: () => released,
    banners: () => renderer.root.findAllByType('NativeBanner'),
    json: () => renderer.toJSON(),
    async render(next = {}) {
      props = { ...props, ...next };
      await act(async () => renderer.update(React.createElement(context.Component, props)));
      if (!overrides.deferLayout) await measure();
    },
    async state(value) {
      await act(async () => {
        appState.currentState = value;
        listeners.forEach((listener) => listener(value));
      });
    },
    async event(event) {
      await act(async () => native.at(-1)[event]());
    },
    layout: measure,
    async close() {
      await act(async () => renderer.unmount());
    },
  };
}

test('unknown access never creates an ad; Pro immediately retires a verified-Free ad', async () => {
  const app = await harness({
    auth: { ready: true, user: { id: 'account' } },
    subscription: {
      ready: true,
      userId: 'account',
      isPro: false,
      accessVerified: false,
      pending: false,
      loading: false,
    },
  });
  try {
    assert.equal(app.acquired(), 0);
    assert.equal(app.banners().length, 0);
    app.scene.subscription.accessVerified = true;
    await app.render();
    assert.equal(app.acquired(), 1);
    assert.equal(app.banners().length, 1);
    const currentPreparationCheck = app.preparationChecks[0];
    assert.equal(currentPreparationCheck(), true);
    const retired = app.native.at(-1);
    app.scene.subscription.isPro = true;
    await app.render();
    assert.equal(app.released(), 1);
    assert.equal(app.banners().length, 0);
    assert.equal(
      currentPreparationCheck(),
      false,
      'Native initialization sees the latest render eligibility',
    );
    await act(async () => retired.onAdLoaded());
    assert.equal(app.json(), null, 'A late native callback cannot revive a Pro banner');
  } finally {
    await app.close();
  }
});

test('route blur, background, active or paused session, audio and detail overlays release the placement', async () => {
  const app = await harness();
  try {
    assert.equal(app.banners().length, 1);
    app.scene.focused = false;
    await app.render();
    assert.equal(app.banners().length, 0);
    app.scene.focused = true;
    await app.render();
    await app.state('background');
    assert.equal(app.banners().length, 0);
    await app.state('active');
    app.ads.accountEligible = false;
    await app.render();
    assert.equal(app.banners().length, 0, 'A global account or modal block retires the placement');
    app.ads.accountEligible = true;
    await app.render();
    app.scene.workout.isMusicPlaying = undefined;
    await app.render();
    assert.equal(app.banners().length, 0, 'Unknown playback status cannot create an ad');
    app.scene.workout.isMusicPlaying = false;
    await app.render();
    for (const flag of ['isWorkoutRunning', 'isMusicPlaying', 'isAudioSyncing']) {
      app.scene.workout[flag] = true;
      await app.render();
      assert.equal(app.banners().length, 0, flag);
      app.scene.workout[flag] = false;
      await app.render();
      assert.equal(app.banners().length, 1, flag);
    }
    await app.render({ hasBlockingModal: true });
    assert.equal(app.banners().length, 0);
    assert.equal(app.acquired(), app.released());
  } finally {
    await app.close();
  }
});

test('no-fill removes the creative without a fake advertisement or immediate request loop', async () => {
  const app = await harness();
  try {
    const count = app.native.length;
    await app.event('onAdFailedToLoad');
    assert.equal(app.banners().length, 0);
    assert.equal(JSON.stringify(app.json()).includes('Advertisement'), false);
    await app.render();
    assert.equal(app.native.length, count);
    assert.equal(app.acquired(), 1);
    await app.render({ placementVisible: false });
    await app.render({ placementVisible: true });
    assert.equal(app.banners().length, 1, 'A later safe screen entry may attempt a fresh request');
  } finally {
    await app.close();
  }
});

test('adaptive banner uses the padded container width and never mounts before consent and SDK readiness', async () => {
  const app = await harness({ ads: { consentReady: false, initialized: false } });
  try {
    assert.equal(app.banners().length, 0);
    assert.equal(app.acquired(), 1, 'A safe placement may initiate consent preparation');
    app.ads.consentReady = true;
    app.ads.initialized = true;
    await app.render();
    assert.equal(app.banners()[0].props.width, 350);
    await app.layout(314);
    assert.equal(app.banners()[0].props.width, 314);
    assert.equal(app.banners()[0].props.requestOptions.requestNonPersonalizedAdsOnly, true);
  } finally {
    await app.close();
  }
});

test('a narrow container is measured before the first native ad request without a placeholder', async () => {
  const app = await harness({ deferLayout: true });
  try {
    assert.equal(app.native.length, 0, 'Window width must not start an oversized native request');
    assert.equal(app.json().children, null, 'The measuring view has no placeholder or gap');
    await app.layout(314);
    assert.equal(app.native.length, 1);
    assert.equal(app.native[0].width, 314, 'The first creative uses the actual inner width');
  } finally {
    await app.close();
  }
});
