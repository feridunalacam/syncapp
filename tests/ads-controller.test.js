import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdsController } from '../src/services/ads/controller.js';
import { createAdsConfig } from '../src/services/ads/config.js';
import { createNativeAdsRuntime } from '../src/services/ads/sdk.js';

const info = {
  canRequestAds: true,
  privacyOptionsRequirementStatus: 'REQUIRED',
  status: 'OBTAINED',
};
const free = { identity: 'user-a', eligible: true, appActive: true };
const settle = () => new Promise(setImmediate);
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup(overrides = {}) {
  const calls = [];
  let loadCount = 0;
  const consent = {
    requestInfoUpdate: async () => {
      calls.push('info');
      return info;
    },
    loadAndShowConsentFormIfRequired: async () => {
      calls.push('form');
      return info;
    },
    getConsentInfo: async () => info,
    showPrivacyOptionsForm: async () => {
      calls.push('privacy');
      return info;
    },
    ...overrides.consent,
  };
  const mobileAds = {
    setAppMuted: (muted) => calls.push(['muted', muted]),
    setAppVolume: (volume) => calls.push(['volume', volume]),
    setRequestConfiguration: async (config) => calls.push(['config', config]),
    initialize: async () => calls.push('init'),
    ...overrides.mobileAds,
  };
  const runtime = createNativeAdsRuntime({
    platform: overrides.platform || 'ios',
    getNativeModule: () => overrides.native !== false,
    load: () => {
      loadCount += 1;
      if (overrides.loadError) throw new Error('native module missing');
      return {
        default: () => mobileAds,
        AdsConsent: consent,
        BannerAd: () => null,
        BannerAdSize: { LARGE_ANCHORED_ADAPTIVE_BANNER: 'ADAPTIVE' },
        TestIds: { ADAPTIVE_BANNER: 'google-demo-banner' },
      };
    },
  });
  const changes = [];
  const controller = createAdsController({
    config: createAdsConfig({ platform: overrides.platform || 'ios', dev: true }),
    runtime,
    onChange: (state) => changes.push(state),
    ...overrides.controller,
  });
  return { controller, calls, runtime, changes, getLoadCount: () => loadCount };
}

test('native SDK and consent remain lazy without a safe visible Free placement', async () => {
  const { controller, calls, getLoadCount } = setup();
  controller.setGate(free);
  await settle();
  assert.equal(getLoadCount(), 0);
  const release = controller.acquirePlacement();
  release();
  controller.setGate({ ...free, eligible: false });
  await settle();
  assert.equal(calls.includes('init'), false);
});

test('consent and global request configuration complete before one native initialization', async () => {
  const { controller, calls, runtime } = setup();
  controller.setGate(free);
  const release = controller.acquirePlacement();
  await settle();
  assert.deepEqual(
    calls.map((item) => (Array.isArray(item) ? item[0] : item)),
    ['info', 'form', 'muted', 'volume', 'config', 'init'],
  );
  assert.deepEqual(
    calls.find((call) => call[0] === 'muted'),
    ['muted', true],
  );
  assert.deepEqual(
    calls.find((call) => call[0] === 'volume'),
    ['volume', 0],
  );
  assert.deepEqual(controller.getState().requestOptions, { requestNonPersonalizedAdsOnly: true });
  assert.equal(controller.getState().bannerUnitId, 'google-demo-banner');
  assert.equal(controller.getState().ready, true);
  release();
  controller.setGate({ ...free, identity: 'user-pro', eligible: false });
  assert.equal(controller.getState().canRequestAds, false);
  controller.setGate({ ...free, identity: 'user-b' });
  controller.acquirePlacement();
  await settle();
  assert.equal(controller.getState().ready, true);
  assert.equal(runtime.isInitialized(), true);
  assert.equal(calls.filter((item) => item === 'init').length, 1);
});

test('OBTAINED without canRequestAds does not initialize or render a banner', async () => {
  const denied = { ...info, canRequestAds: false };
  const { controller, calls } = setup({
    consent: {
      requestInfoUpdate: async () => denied,
      loadAndShowConsentFormIfRequired: async () => denied,
    },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  await settle();
  assert.equal(controller.getState().canRequestAds, false);
  assert.equal(calls.includes('init'), false);
});

test('late consent info after Pro, release or background never opens a form', async () => {
  for (const stop of ['pro', 'release', 'background']) {
    const pending = deferred();
    const { controller, calls } = setup({ consent: { requestInfoUpdate: () => pending.promise } });
    controller.setGate(free);
    const release = controller.acquirePlacement();
    if (stop === 'release') release();
    else controller.setGate({ ...free, [stop === 'pro' ? 'eligible' : 'appActive']: false });
    pending.resolve(info);
    await settle();
    assert.equal(calls.includes('form'), false, stop);
    assert.equal(calls.includes('init'), false, stop);
    assert.equal(controller.getState().ready, false, stop);
  }
});

test('identity switch drains old info and gathers fresh consent before initialization', async () => {
  const oldInfo = deferred();
  let requests = 0;
  const { controller, calls } = setup({
    consent: {
      requestInfoUpdate: () => {
        requests += 1;
        return requests === 1 ? oldInfo.promise : Promise.resolve(info);
      },
    },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  controller.setGate({ ...free, identity: 'user-b' });
  oldInfo.resolve({ ...info, canRequestAds: false });
  await settle();
  assert.equal(requests, 2);
  assert.equal(calls.filter((item) => item === 'form').length, 1);
  assert.equal(controller.getState().ready, true);
});

test('current render gate blocks an old continuation before the React effect runs', async () => {
  const pending = deferred();
  let gate = free;
  const { controller, calls } = setup({
    controller: { getCurrentGate: () => gate },
    consent: { requestInfoUpdate: () => pending.promise },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  gate = { ...free, identity: 'new-pro-account', eligible: false };
  pending.resolve(info);
  await settle();
  assert.equal(calls.includes('form'), false);
  assert.equal(calls.includes('init'), false);
});

test('placement removal while configuring cannot start initialization', async () => {
  const pending = deferred();
  const { controller, calls } = setup({
    mobileAds: { setRequestConfiguration: () => pending.promise },
  });
  controller.setGate(free);
  const release = controller.acquirePlacement();
  await settle();
  release();
  pending.resolve();
  await settle();
  assert.equal(calls.includes('init'), false);
  controller.acquirePlacement();
  await settle();
  assert.equal(calls.filter((item) => item === 'init').length, 1);
});

test('asynchronous mute or volume rejection prevents request configuration and initialization', async () => {
  for (const method of ['setAppMuted', 'setAppVolume']) {
    const rejection = deferred();
    const { controller, calls } = setup({ mobileAds: { [method]: () => rejection.promise } });
    controller.setGate(free);
    controller.acquirePlacement();
    await settle();
    assert.equal(calls.includes('init'), false, method);
    rejection.reject(new Error('native audio configuration rejected'));
    await settle();
    assert.equal(calls.includes('init'), false, method);
    assert.equal(
      calls.some((call) => call[0] === 'config'),
      false,
      method,
    );
    assert.equal(controller.getState().ready, false, method);
    assert.equal(controller.getState().error, 'Ads are unavailable right now.', method);
  }
});

test('Pro account render during delayed native configuration prevents initialization', async () => {
  const muted = deferred();
  const volume = deferred();
  let latest = free;
  const { controller, calls } = setup({
    controller: { getCurrentGate: () => latest },
    mobileAds: {
      setAppMuted: () => muted.promise,
      setAppVolume: () => {
        calls.push('volume-started');
        return volume.promise;
      },
    },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  await settle();
  assert.equal(calls.includes('volume-started'), false);
  assert.equal(calls.includes('init'), false);
  muted.resolve();
  await settle();
  assert.equal(calls.includes('volume-started'), true);
  latest = { ...free, identity: 'pro-user', eligible: false };
  volume.resolve();
  await settle();
  assert.equal(calls.includes('init'), false);
  assert.equal(controller.getState().canRequestAds, false);
});

test('latest placement render blocks a native form before effect cleanup', async () => {
  const pending = deferred();
  let safePlacement = true;
  const { controller, calls } = setup({ consent: { requestInfoUpdate: () => pending.promise } });
  controller.setGate(free);
  controller.acquirePlacement(() => safePlacement);
  safePlacement = false; // Workout/music/modal/focus changed in the current render.
  pending.resolve(info);
  await settle();
  assert.equal(calls.includes('form'), false);
  assert.equal(calls.includes('init'), false);
});

test('global blocking modal prevents privacy UI as well as ad initialization', async () => {
  const { controller, calls } = setup();
  controller.setGate({ ...free, eligible: false, blocked: true });
  controller.acquirePlacement();
  assert.equal(await controller.requestPrivacyOptions(), false);
  await settle();
  assert.deepEqual(calls, []);
});

test('initialization already in flight cannot enable banners for a newly Pro account', async () => {
  const pending = deferred();
  let starts = 0;
  const { controller } = setup({
    mobileAds: {
      initialize: () => {
        starts += 1;
        return pending.promise;
      },
    },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  await settle();
  controller.setGate({ ...free, eligible: false });
  pending.resolve();
  await settle();
  assert.equal(controller.getState().ready, false);
  controller.setGate(free);
  await settle();
  assert.equal(controller.getState().ready, true);
  assert.equal(starts, 1);
});

test('consent/native errors are safe, visible and do not repeatedly initialize', async () => {
  const { controller } = setup({
    consent: {
      requestInfoUpdate: async () => {
        throw new Error('raw secret diagnostic');
      },
    },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  await settle();
  assert.equal(controller.getState().ready, false);
  assert.equal(controller.getState().error, 'Ads are unavailable right now.');
  const failing = setup({
    mobileAds: {
      initialize: () => {
        throw new Error('init failed');
      },
    },
  });
  failing.controller.setGate(free);
  const release = failing.controller.acquirePlacement();
  await settle();
  release();
  failing.controller.acquirePlacement();
  await settle();
  assert.equal(failing.controller.getState().ready, false);
});

test('privacy options are single flight, do not initialize GMA and update required status', async () => {
  const privacy = deferred();
  const { controller, calls } = setup({
    consent: {
      showPrivacyOptionsForm: () => {
        calls.push('privacy');
        return privacy.promise;
      },
    },
  });
  controller.setGate({ ...free, eligible: false });
  const first = controller.requestPrivacyOptions();
  const second = controller.requestPrivacyOptions();
  assert.equal(first, second);
  await settle();
  assert.equal(calls.filter((item) => item === 'privacy').length, 1);
  assert.equal(calls.includes('init'), false);
  privacy.resolve({ ...info, privacyOptionsRequirementStatus: 'NOT_REQUIRED' });
  assert.equal(await first, true);
  assert.equal(controller.getState().privacyOptionsRequired, false);
  assert.equal(controller.getState().privacyOptionsRequirementStatus, 'NOT_REQUIRED');
});

test('native NOT_REQUIRED privacy result is distinct from unknown and never opens a form or initializes ads', async () => {
  for (const status of ['NOT_REQUIRED', 'UNKNOWN', undefined, 'invalid']) {
    const { controller, calls } = setup({
      consent: {
        requestInfoUpdate: async () => {
          calls.push('info');
          return { ...info, privacyOptionsRequirementStatus: status };
        },
      },
    });
    controller.setGate({ ...free, eligible: false });
    assert.equal(controller.getState().privacyOptionsRequirementStatus, 'UNKNOWN');
    assert.equal(await controller.requestPrivacyOptions(), false);
    assert.equal(
      controller.getState().privacyOptionsRequirementStatus,
      status === 'NOT_REQUIRED' ? 'NOT_REQUIRED' : 'UNKNOWN',
    );
    assert.equal(controller.getState().error, null);
    assert.equal(controller.getState().privacyOptionsRequired, false);
    assert.deepEqual(calls, ['info']);
    assert.equal(controller.getState().initialized, false);
  }
});

test('cold Pro and disabled-ads settings expose native privacy choices without initializing ads', async () => {
  for (const mode of ['cold-pro', 'disabled-ads']) {
    const { controller, calls, getLoadCount } = setup({
      ...(mode === 'disabled-ads'
        ? {
            controller: {
              config: createAdsConfig({
                platform: 'ios',
                dev: true,
                env: { EXPO_PUBLIC_ADS_ENABLED: 'false' },
              }),
            },
          }
        : {}),
    });
    assert.equal(controller.getState().nativeAvailable, true, mode);
    assert.equal(controller.getState().privacyOptionsRequired, false, mode);
    assert.equal(getLoadCount(), 0, mode);
    controller.setGate({ ...free, eligible: mode !== 'cold-pro' });
    controller.acquirePlacement();
    await settle();
    assert.equal(getLoadCount(), 0, mode);
    assert.equal(await controller.requestPrivacyOptions(() => true), true, mode);
    assert.deepEqual(calls, ['info', 'privacy'], mode);
    assert.equal(controller.getState().privacyOptionsRequired, true, mode);
    assert.equal(controller.getState().initialized, false, mode);
    assert.equal(controller.getState().canRequestAds, false, mode);
  }
});

test('unsupported old binaries cannot advertise privacy capability or evaluate the SDK', async () => {
  const { controller, getLoadCount } = setup({ native: false });
  assert.equal(controller.getState().nativeAvailable, false);
  controller.setGate(free);
  assert.equal(await controller.requestPrivacyOptions(() => true), false);
  assert.equal(getLoadCount(), 0);
  assert.equal(controller.getState().error, null);
  const runtime = createNativeAdsRuntime({
    platform: 'ios',
    getNativeModule: () => {
      throw new Error('bridge unavailable');
    },
    load: () => assert.fail('A capability check must never load the ads SDK'),
  });
  assert.equal(runtime.hasNativeSupport(), false);
  assert.equal(runtime.getSdk(), null);
});

test('privacy error blocks banners and surfaces safe retry copy', async () => {
  const { controller, calls } = setup({
    consent: {
      showPrivacyOptionsForm: async () => {
        throw new Error('raw user data');
      },
    },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  await settle();
  assert.equal(await controller.requestPrivacyOptions(), false);
  await settle();
  assert.equal(controller.getState().canRequestAds, false);
  assert.match(controller.getState().error, /privacy choices could not be updated/);
  assert.equal(calls.filter((item) => item === 'init').length, 1);
});

test('privacy form checks fresh caller focus/workout safety after pending info returns', async () => {
  const pending = deferred();
  let callerSafe = true;
  const { controller, calls } = setup({ consent: { requestInfoUpdate: () => pending.promise } });
  controller.setGate(free);
  const privacy = controller.requestPrivacyOptions(() => callerSafe);
  callerSafe = false;
  pending.resolve(info);
  assert.equal(await privacy, false);
  assert.equal(calls.includes('privacy'), false);
  assert.equal(calls.includes('init'), false);
});

test('unsafe or failed privacy caller guard never loads native consent', async () => {
  const { controller, getLoadCount } = setup();
  controller.setGate(free);
  assert.equal(await controller.requestPrivacyOptions(() => false), false);
  assert.equal(
    await controller.requestPrivacyOptions(() => {
      throw new Error('unmounted');
    }),
    false,
  );
  assert.equal(getLoadCount(), 0);
});

test('privacy choices changed during background force a fresh consent read', async () => {
  const privacy = deferred();
  let currentInfo = info;
  let reads = 0;
  const { controller } = setup({
    consent: {
      requestInfoUpdate: async () => {
        reads += 1;
        return currentInfo;
      },
      loadAndShowConsentFormIfRequired: async () => currentInfo,
      showPrivacyOptionsForm: () => privacy.promise,
    },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  await settle();
  const changing = controller.requestPrivacyOptions();
  await settle();
  controller.setGate({ ...free, appActive: false });
  currentInfo = { ...info, canRequestAds: false };
  privacy.resolve(currentInfo);
  assert.equal(await changing, false);
  controller.setGate(free);
  await settle();
  assert.equal(reads, 3);
  assert.equal(controller.getState().canRequestAds, false);
});

test('privacy request waiting for an old info call is canceled on identity switch', async () => {
  const oldInfo = deferred();
  let requests = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const { controller } = setup({
    consent: {
      requestInfoUpdate: async () => {
        requests += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const result = requests === 1 ? await oldInfo.promise : info;
        inFlight -= 1;
        return result;
      },
    },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  const privacy = controller.requestPrivacyOptions();
  controller.setGate({ ...free, identity: 'user-b' });
  oldInfo.resolve(info);
  assert.equal(await privacy, false);
  await settle();
  assert.equal(maxInFlight, 1);
  assert.equal(requests, 2);
  assert.equal(controller.getState().privacyOptionsBusy, false);
  assert.equal(controller.getState().ready, true);
});

test('late fallback consent-info result cannot update state after backgrounding', async () => {
  const pending = deferred();
  const { controller } = setup({
    consent: {
      loadAndShowConsentFormIfRequired: async () => null,
      getConsentInfo: () => pending.promise,
    },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  await settle();
  controller.setGate({ ...free, appActive: false });
  pending.resolve({ ...info, privacyOptionsRequirementStatus: 'NOT_REQUIRED' });
  await settle();
  assert.equal(controller.getState().privacyOptionsRequired, true);
  assert.equal(controller.getState().ready, false);
});

test('old binary and web never evaluate the native ads package', async () => {
  for (const overrides of [{ native: false }, { platform: 'web' }]) {
    const { controller, getLoadCount } = setup(overrides);
    controller.setGate(free);
    controller.acquirePlacement();
    await settle();
    assert.equal(getLoadCount(), 0);
    assert.equal(controller.getState().ready, false);
  }
  const { controller } = setup({ loadError: true });
  controller.setGate(free);
  controller.acquirePlacement();
  await settle();
  assert.equal(controller.getState().nativeAvailable, false);
});

test('dispose ignores late consent callbacks and never opens native UI', async () => {
  const pending = deferred();
  const { controller, calls, changes } = setup({
    consent: { requestInfoUpdate: () => pending.promise },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  controller.dispose();
  const count = changes.length;
  pending.resolve(info);
  await settle();
  assert.equal(changes.length, count);
  assert.equal(calls.includes('form'), false);
});

test('release config requires explicit enable and real IDs while DEV always uses demo inventory', () => {
  const live = 'ca-app-pub-1234567890123456/1234567890';
  const env = { EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: live };
  assert.equal(createAdsConfig({ platform: 'ios', env }).enabled, false);
  assert.equal(
    createAdsConfig({ platform: 'ios', env: { ...env, EXPO_PUBLIC_ADS_ENABLED: 'true' } }).enabled,
    true,
  );
  for (const id of [undefined, 'bad-id', 'ca-app-pub-3940256099942544/2435281174']) {
    assert.equal(
      createAdsConfig({
        platform: 'ios',
        env: { EXPO_PUBLIC_ADS_ENABLED: 'true', EXPO_PUBLIC_ADMOB_IOS_BANNER_ID: id },
      }).enabled,
      false,
    );
  }
  const dev = createAdsConfig({ platform: 'ios', dev: true, env });
  assert.equal(dev.testMode, true);
  assert.equal(dev.bannerUnitId, null);
  assert.equal(dev.enabled, true);
  assert.equal(
    createAdsConfig({ platform: 'ios', dev: true, env: { EXPO_PUBLIC_ADS_ENABLED: 'false' } })
      .enabled,
    false,
  );
  assert.equal(createAdsConfig({ platform: 'web', dev: true }).enabled, false);
});

test('an idle consent barrier resolves without loading SDK, consent or advertisements', async () => {
  const { controller, calls, getLoadCount } = setup();
  controller.setGate(free);
  assert.equal(await controller.waitUntilIdle(), undefined);
  assert.deepEqual(calls, []);
  assert.equal(getLoadCount(), 0);
});

test('a captured automatic consent form must settle even after Pro or background invalidates its continuation', async () => {
  for (const stop of ['pro', 'background', 'release', 'dispose']) {
    const form = deferred();
    const { controller, calls } = setup({
      consent: {
        loadAndShowConsentFormIfRequired: () => {
          calls.push('form');
          return form.promise;
        },
      },
    });
    controller.setGate(free);
    const release = controller.acquirePlacement();
    await settle();
    assert.equal(calls.includes('form'), true, stop);
    let settled = false;
    const barrier = controller.waitUntilIdle().then(() => {
      settled = true;
    });
    if (stop === 'release') release();
    else if (stop === 'dispose') controller.dispose();
    else controller.setGate({ ...free, [stop === 'pro' ? 'eligible' : 'appActive']: false });
    await settle();
    assert.equal(settled, false, 'Invalidating eligibility does not dismiss the native form');
    form.resolve(info);
    await barrier;
    assert.equal(settled, true, stop);
    assert.equal(calls.includes('init'), false, stop);
  }
});

test('a captured explicit privacy form blocks the barrier until native close or error', async () => {
  for (const outcome of ['closed', 'error']) {
    const form = deferred();
    const { controller, calls } = setup({
      consent: {
        showPrivacyOptionsForm: () => {
          calls.push('privacy');
          return form.promise;
        },
      },
    });
    controller.setGate({ ...free, eligible: false });
    const request = controller.requestPrivacyOptions();
    await settle();
    assert.equal(calls.includes('privacy'), true);
    let settled = false;
    const barrier = controller.waitUntilIdle().then(() => {
      settled = true;
    });
    controller.setGate({ ...free, eligible: false, appActive: false });
    await settle();
    assert.equal(settled, false, outcome);
    if (outcome === 'closed') form.resolve(info);
    else form.reject(new Error('Native privacy presentation failed'));
    await barrier;
    await request;
    assert.equal(settled, true, outcome);
    assert.equal(calls.includes('init'), false, outcome);
  }
});

test('the barrier also drains already-requested native SDK initialization after eligibility changes', async () => {
  const initialization = deferred();
  const { controller } = setup({
    mobileAds: { initialize: () => initialization.promise },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  await settle();
  let settled = false;
  const barrier = controller.waitUntilIdle().then(() => {
    settled = true;
  });
  controller.setGate({ ...free, eligible: false });
  await settle();
  assert.equal(settled, false);
  initialization.reject(new Error('Native initialization failed'));
  await barrier;
  assert.equal(settled, true);
  assert.equal(controller.getState().canRequestAds, false);
});

test('the barrier never adopts SDK or consent work begun after its snapshot', async () => {
  const form = deferred();
  const { controller, calls } = setup({
    consent: { loadAndShowConsentFormIfRequired: () => form.promise },
  });
  controller.setGate(free);
  const barrier = controller.waitUntilIdle();
  const release = controller.acquirePlacement();
  await barrier;
  assert.equal(calls.includes('info'), true, 'Only the separate placement started work');
  assert.equal(calls.includes('init'), false);
  release();
  form.resolve(info);
  await settle();
});

test('a preparation hold cancels late consent info before it can open a form', async () => {
  const pending = deferred();
  let updates = 0;
  const { controller, calls } = setup({
    consent: {
      requestInfoUpdate: () => {
        updates++;
        return pending.promise;
      },
    },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  const releaseHold = controller.holdPreparation();
  const barrier = controller.waitUntilIdle();
  pending.resolve(info);
  await barrier;
  assert.equal(calls.includes('form'), false);
  assert.equal(calls.includes('init'), false);
  assert.equal(controller.getState().ready, false);
  await settle();
  assert.equal(updates, 1, 'Do not retry while held');
  releaseHold();
  await settle();
  assert.equal(calls.filter((call) => call === 'form').length, 1);
  assert.equal(controller.getState().ready, true);
});

test('a preparation hold preserves ready consent and initialized SDK for a cached interstitial', async () => {
  const { controller, calls } = setup();
  controller.setGate(free);
  controller.acquirePlacement();
  await settle();
  assert.equal(controller.getState().ready, true);
  const before = calls.length;
  const releaseHold = controller.holdPreparation();
  assert.equal(controller.getState().ready, true);
  assert.equal(controller.getState().canRequestAds, true);
  assert.equal(controller.getState().initialized, true);
  await controller.waitUntilIdle();
  assert.equal(calls.length, before);
  releaseHold();
  releaseHold();
  await settle();
  assert.equal(calls.length, before, 'Idempotent release does not restart an already-ready SDK');
});

test('new placements cannot load SDK or consent until their preparation hold is released', async () => {
  const { controller, calls, getLoadCount } = setup();
  const releaseHold = controller.holdPreparation();
  controller.setGate(free);
  controller.acquirePlacement();
  await controller.waitUntilIdle();
  assert.equal(getLoadCount(), 0);
  assert.deepEqual(calls, []);
  releaseHold();
  await settle();
  assert.equal(controller.getState().ready, true);
  assert.equal(getLoadCount(), 1);
});

test('nested preparation holds skip new privacy actions and release exactly once each', async () => {
  const { controller, calls, getLoadCount } = setup();
  controller.setGate(free);
  const first = controller.holdPreparation();
  const second = controller.holdPreparation();
  controller.acquirePlacement();
  assert.equal(await controller.requestPrivacyOptions(), false);
  first();
  first();
  assert.equal(await controller.requestPrivacyOptions(), false);
  await settle();
  assert.deepEqual(calls, []);
  assert.equal(getLoadCount(), 0);
  second();
  second();
  await settle();
  assert.equal(controller.getState().ready, true);
  assert.equal(calls.filter((call) => call === 'info').length, 1);
});

test('an already-open native form drains while held and unsafe release cannot start another', async () => {
  const form = deferred();
  const { controller, calls } = setup({
    consent: {
      loadAndShowConsentFormIfRequired: () => {
        calls.push('form');
        return form.promise;
      },
    },
  });
  controller.setGate(free);
  controller.acquirePlacement();
  await settle();
  assert.equal(calls.includes('form'), true);
  const releaseHold = controller.holdPreparation();
  let settled = false;
  const barrier = controller.waitUntilIdle().then(() => {
    settled = true;
  });
  assert.equal(await controller.requestPrivacyOptions(), false);
  await settle();
  assert.equal(settled, false, 'A hold is not a native dismissal');
  form.resolve(info);
  await barrier;
  assert.equal(calls.includes('init'), false);
  controller.setGate({ ...free, eligible: false });
  releaseHold();
  await settle();
  assert.equal(calls.filter((call) => call === 'form').length, 1);
  assert.equal(calls.includes('init'), false);
});
