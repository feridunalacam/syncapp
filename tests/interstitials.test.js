import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterstitialController } from '../src/services/ads/interstitials.js';

const free = {
  identity: 'account-a',
  eligible: true,
  appActive: true,
  ready: true,
  blocked: false,
};
const settle = () => new Promise(setImmediate);

function setup(options = {}) {
  let time = 0;
  let gate = { ...free, ...options.gate };
  let nextTimer = 0;
  let nextAction = 0;
  const timers = new Map();
  const ads = [];
  const requests = [];
  const changes = [];
  const sdk = {
    testInterstitialUnitId: 'google-test-interstitial',
    interstitialEvents: { loaded: 'loaded', opened: 'opened', closed: 'closed', error: 'error' },
    createInterstitial(unitId, requestOptions) {
      requests.push({ unitId, requestOptions });
      const callbacks = new Map();
      const history = new Map();
      const ad = {
        loads: 0,
        shows: 0,
        destroys: 0,
        addAdEventListener(type, callback) {
          if (!callbacks.has(type)) callbacks.set(type, new Set());
          callbacks.get(type).add(callback);
          history.set(type, callback);
          return () => callbacks.get(type).delete(callback);
        },
        load() {
          this.loads++;
          return options.load?.(this);
        },
        show() {
          this.shows++;
          return options.show ? options.show(this) : Promise.resolve();
        },
        destroy() {
          this.destroys++;
          callbacks.clear();
        },
        emit(type) {
          [...(callbacks.get(type) || [])].forEach((callback) => callback());
        },
        late(type) {
          history.get(type)?.();
        },
      };
      ads.push(ad);
      return ad;
    },
  };
  const controller = createInterstitialController({
    config: {
      interstitialEnabled: true,
      testMode: true,
      requestOptions: { requestNonPersonalizedAdsOnly: true },
      ...options.config,
    },
    getSdk: () => sdk,
    getCurrentGate: () => gate,
    onChange: (state) => {
      changes.push(state);
      options.onChange?.(state, (next) => (gate = { ...gate, ...next }));
    },
    now: () => time,
    setTimer: (callback, delay) => {
      const id = ++nextTimer;
      timers.set(id, { at: time + delay, callback });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
  });
  controller.setGate(gate);
  if (options.seed !== false) controller.recordAction({ opportunityId: 'select:initial' });
  return {
    controller,
    ads,
    requests,
    changes,
    gate(next, notify = true) {
      gate = { ...gate, ...next };
      if (notify) controller.setGate(gate);
    },
    advance(ms) {
      time += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= time) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    load(check) {
      controller.preload(check);
      ads.at(-1)?.emit('loaded');
      return ads.at(-1);
    },
    show(id = `start:${++nextAction}`, isEligible) {
      return controller.showIfReady({ opportunityId: id, isEligible });
    },
  };
}

test('Pro, unknown, background, blocked, disabled and unprepared gates never load an interstitial', () => {
  for (const gate of [
    { eligible: false },
    { eligible: undefined },
    { appActive: false },
    { blocked: true },
    { ready: false },
  ]) {
    const app = setup({ gate });
    assert.equal(app.controller.preload(), false);
    assert.equal(app.requests.length, 0);
  }
  const app = setup({ config: { interstitialEnabled: false } });
  assert.equal(app.controller.preload(), false);
  assert.equal(app.requests.length, 0);
});

test('preloading never presents; native CLOSED, not show promise completion, releases the caller', async () => {
  const app = setup();
  const ad = app.load();
  assert.deepEqual(app.controller.getState(), { loaded: true, loading: false, presenting: false });
  assert.equal(ad.shows, 0);
  let done = false;
  const showing = app.show().then((result) => {
    done = true;
    return result;
  });
  await settle();
  assert.equal(ad.shows, 1);
  assert.equal(done, false);
  app.advance(600000);
  assert.equal(done, false, 'There is no timeout that starts a workout behind a visible ad');
  ad.emit('opened');
  ad.emit('closed');
  assert.deepEqual(await showing, { shown: true, reason: 'closed' });
  assert.equal(ad.destroys, 1);
  assert.equal(app.controller.getState().presenting, false);
  assert.deepEqual(app.requests, [
    {
      unitId: 'google-test-interstitial',
      requestOptions: { requestNonPersonalizedAdsOnly: true },
    },
  ]);
});

test('simultaneous starts share one native presentation barrier and do not count extra actions', async () => {
  const app = setup();
  const ad = app.load();
  const first = app.show('start:first');
  const duplicate = app.show('start:first');
  const other = app.show('start:another');
  assert.equal(first, duplicate);
  assert.equal(first, other);
  assert.equal(ad.shows, 1);
  ad.emit('opened');
  ad.emit('closed');
  await first;
  app.advance(120000);
  app.load();
  assert.deepEqual(await app.show('finish:first'), { shown: false, reason: 'spacing' });
});

test('first and later interstitials both require two distinct actions and cooldown is independent', async () => {
  const app = setup({ seed: false });
  const ad = app.load();
  assert.deepEqual(await app.show('start:one'), { shown: false, reason: 'spacing' });
  const first = app.show('finish:one');
  assert.equal(ad.shows, 1);
  ad.emit('opened');
  ad.emit('closed');
  await first;
  const next = app.load();
  app.controller.recordAction({ opportunityId: 'select:two' });
  assert.deepEqual(await app.show('start:two'), { shown: false, reason: 'cooldown' });
  app.advance(120000);
  const second = app.show('finish:two');
  next.emit('opened');
  next.emit('closed');
  assert.equal((await second).shown, true);
});

test('duplicate actions cannot satisfy spacing and opportunities are consumed even when no ad is ready', async () => {
  const app = setup({ seed: false });
  app.controller.recordAction({ opportunityId: 'select:one' });
  app.controller.recordAction({ opportunityId: 'select:one' });
  assert.deepEqual(await app.show('select:one'), { shown: false, reason: 'spacing' });
  assert.deepEqual(await app.show('start:one'), { shown: false, reason: 'not-ready' });
  const ad = app.load();
  assert.deepEqual(await app.show('start:one'), { shown: false, reason: 'duplicate' });
  assert.equal(ad.shows, 0, 'A late load cannot reuse the old Start action');
});

test('real actions can be counted before consent readiness without loading the ad SDK', () => {
  const app = setup({ seed: false, gate: { ready: false } });
  assert.equal(app.controller.recordAction({ opportunityId: 'select:one' }), true);
  assert.equal(app.controller.preload(), false);
  assert.equal(app.requests.length, 0);
  app.gate({ eligible: false });
  assert.equal(app.controller.recordAction({ opportunityId: 'start:pro' }), false);
});

test('load timeout and no-fill retire callbacks and back off without delaying any Start action', async () => {
  const app = setup();
  app.controller.preload();
  const old = app.ads[0];
  assert.deepEqual(await app.show('start:loading'), { shown: false, reason: 'not-ready' });
  app.advance(15000);
  old.late('loaded');
  assert.equal(app.controller.getState().loaded, false);
  assert.equal(old.destroys, 1);
  assert.equal(app.controller.preload(), false);
  app.advance(30000);
  app.controller.preload();
  const fresh = app.ads[1];
  fresh.emit('error');
  assert.equal(app.controller.getState().loading, false);
  assert.equal(app.controller.preload(), false);
  assert.equal(app.requests.length, 2);
});

test('identity or Pro changes discard prepared ads and old callbacks cannot restore readiness', async () => {
  const app = setup();
  const old = app.load();
  app.gate({ identity: 'account-b' });
  old.late('loaded');
  assert.equal(app.controller.getState().loaded, false);
  assert.equal(old.destroys, 1);
  assert.deepEqual(await app.show(), { shown: false, reason: 'not-ready' });
  const next = app.load();
  app.gate({ eligible: false }, false);
  assert.deepEqual(await app.show(), { shown: false, reason: 'ineligible' });
  assert.equal(next.shows, 0);
  assert.equal(next.destroys, 1);
});

test('a retired load callback cannot erase a newer creative readiness', () => {
  const app = setup();
  const old = app.load();
  app.gate({ identity: 'account-b' });
  const fresh = app.load();
  old.late('loaded');
  assert.equal(app.controller.getState().loaded, true);
  assert.equal(fresh.destroys, 0);
});

test('changed caller safety blocks late load and presentation without an automatic retry', async () => {
  const app = setup();
  let safe = true;
  app.controller.preload(() => safe);
  const old = app.ads[0];
  safe = false;
  old.emit('loaded');
  assert.equal(app.controller.getState().loaded, false);
  safe = true;
  const next = app.load(() => safe);
  safe = false;
  assert.deepEqual(await app.show('start:unsafe', () => safe), {
    shown: false,
    reason: 'ineligible',
  });
  assert.equal(next.shows, 0);
});

test('foreground, identity and Pro invalidation after show preserve terminal listeners until close', async () => {
  for (const next of [{ appActive: false }, { identity: 'account-b' }, { eligible: false }]) {
    const app = setup();
    const ad = app.load();
    let done = false;
    const showing = app.show().then((value) => {
      done = true;
      return value;
    });
    app.gate(next);
    await settle();
    assert.equal(done, false);
    assert.equal(ad.destroys, 0, 'destroy does not dismiss native presentation');
    ad.emit('opened');
    ad.emit('closed');
    assert.deepEqual(await showing, { shown: true, reason: 'closed' });
    assert.equal(ad.destroys, 1);
  }
});

test('synchronous and asynchronous native show failures release safely without reusing the creative', async () => {
  for (const show of [
    () => {
      throw new Error('Native presentation unavailable');
    },
    () => Promise.reject(new Error('Native presentation rejected')),
  ]) {
    const app = setup({ show });
    const ad = app.load();
    assert.deepEqual(await app.show(), { shown: false, reason: 'error' });
    assert.equal(ad.destroys, 1);
    assert.equal(app.controller.preload(), false);
    assert.deepEqual(await app.show(), { shown: false, reason: 'not-ready' });
  }
});

test('a rejected show promise after OPENED cannot release a still-visible ad', async () => {
  let reject;
  const app = setup({ show: () => new Promise((_yes, no) => (reject = no)) });
  const ad = app.load();
  let done = false;
  const showing = app.show().then((result) => {
    done = true;
    return result;
  });
  ad.emit('opened');
  reject(new Error('Late bridge rejection'));
  await settle();
  assert.equal(done, false);
  ad.emit('closed');
  assert.equal((await showing).shown, true);
});

test('old creatives expire and a fresh preload never auto-presents', async () => {
  const app = setup();
  const old = app.load();
  app.advance(55 * 60 * 1000);
  assert.deepEqual(await app.show(), { shown: false, reason: 'expired' });
  assert.equal(old.destroys, 1);
  const fresh = app.load();
  assert.equal(fresh.shows, 0);
});

test('disposing retires loads but waits for a real native terminal event after showing', async () => {
  const loading = setup();
  loading.controller.preload();
  loading.controller.dispose();
  loading.ads[0].late('loaded');
  assert.equal(loading.ads[0].destroys, 1);
  assert.equal(loading.controller.getState().loaded, false);
  const app = setup();
  const ad = app.load();
  const showing = app.show();
  const before = app.changes.length;
  app.controller.dispose();
  assert.equal(ad.destroys, 0);
  ad.emit('opened');
  ad.emit('closed');
  assert.deepEqual(await showing, { shown: true, reason: 'closed' });
  assert.equal(app.changes.length, before, 'Disposed state is not published to old React owners');
});
