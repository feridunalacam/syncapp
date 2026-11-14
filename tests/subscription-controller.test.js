import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSubscriptionController,
  isActiveEntitlement,
} from '../src/services/subscriptions/controller.js';

const now = Date.parse('2026-11-11T12:00:00Z');
const pro = { entitlement_id: 'pro', expires_at: '2026-12-11T12:00:00Z' };
const monthly = {
  identifier: '$rc_monthly',
  product: { identifier: 'sync.pro.monthly', priceString: '₺99,99' },
};
const annual = {
  identifier: '$rc_annual',
  product: { identifier: 'sync.pro.yearly', priceString: '₺999,99' },
};
const emptyInfo = { entitlements: { active: {} } };
const activeInfo = { entitlements: { active: { pro: {} } } };
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
  const callbacks = new Set();
  let currentUser = null;
  const sdk = {
    configure: ({ appUserID }) => {
      calls.push(['configure', appUserID]);
      currentUser = appUserID;
    },
    logIn: async (id) => {
      calls.push(['login', id]);
      currentUser = id;
    },
    logOut: async () => {
      calls.push(['logout']);
      currentUser = null;
    },
    getCustomerInfo: async () => {
      calls.push(['info', currentUser]);
      return emptyInfo;
    },
    getOfferings: async () => ({ current: { availablePackages: [monthly, annual] } }),
    purchasePackage: async (pkg) => {
      calls.push(['purchase', currentUser, pkg]);
      return { customerInfo: activeInfo };
    },
    restorePurchases: async () => {
      calls.push(['restore', currentUser]);
      return activeInfo;
    },
    addCustomerInfoUpdateListener: (callback) => callbacks.add(callback),
    removeCustomerInfoUpdateListener: (callback) => callbacks.delete(callback),
    ...overrides.sdk,
  };
  const verify =
    overrides.verify ||
    (async (id, options) => {
      calls.push(['verify', id, options]);
      return { entitlement: null };
    });
  const changes = [];
  const controller = createSubscriptionController({
    sdk: overrides.noSdk ? null : sdk,
    apiKey: 'public-sdk-key',
    resolveScope:
      overrides.resolveScope ||
      (async (id) => ({
        user_id: id,
        lane: 'production',
        namespace: id,
        epoch: 0,
        active: true,
        expires_at: null,
      })),
    loadScope: overrides.loadScope,
    apiKeyForScope: overrides.apiKeyForScope,
    verify,
    now: overrides.now || (() => now),
    sdkEntitlementId: overrides.sdkEntitlementId,
    onChange: (state) => changes.push(state),
  });
  return { controller, calls, callbacks, changes, sdk };
}

test('Pro requires the expected entitlement and a future expiration', () => {
  assert.equal(isActiveEntitlement(pro, now), true);
  assert.equal(
    isActiveEntitlement({ ...pro, expires_at: new Date(now).toISOString() }, now),
    false,
  );
  assert.equal(isActiveEntitlement({ ...pro, expires_at: null }, now), false);
  assert.equal(isActiveEntitlement({ ...pro, entitlement_id: 'other' }, now), false);
  assert.equal(isActiveEntitlement(null, now), false);
});

test('server-confirmed access works without a purchases native module', async () => {
  const { controller } = setup({ noSdk: true, verify: async () => ({ entitlement: pro }) });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(controller.getState().configured, false);
  assert.equal(controller.getState().isPro, true);
  assert.equal(controller.getState().ready, true);
  assert.equal(controller.getState().accessVerified, true);
});

test('SDK Pro cannot grant cloud access before backend verification', async () => {
  const { controller } = setup({ sdk: { getCustomerInfo: async () => activeInfo } });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(controller.getState().isPro, false);
  assert.equal(controller.getState().pending, true);
});

test('custom RevenueCat entitlement maps to pending verification while database Pro remains authoritative', async () => {
  const info = { entitlements: { active: { sync_pro: {} } } };
  let confirmed = false;
  const { controller } = setup({
    sdkEntitlementId: 'sync_pro',
    sdk: { getCustomerInfo: async () => info },
    verify: async () => ({ entitlement: confirmed ? pro : null }),
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(controller.getState().pending, true);
  assert.equal(controller.getState().isPro, false);
  confirmed = true;
  await controller.refresh({ sync: true });
  assert.equal(controller.getState().entitlement.entitlement_id, 'pro');
  assert.equal(controller.getState().isPro, true);
  assert.equal(controller.getState().pending, false);
});

test('purchase uses store package and grants access only after server synchronization', async () => {
  const requests = [];
  const { controller, calls } = setup({
    verify: async (id, options) => {
      requests.push([id, options.sync]);
      return { entitlement: options.sync ? pro : null };
    },
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const result = await controller.purchase({ ...monthly });
  assert.equal(result.isPro, true);
  assert.equal(controller.getState().isPro, true);
  assert.equal(controller.getState().loading, false);
  assert.deepEqual(requests, [
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false],
    ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true],
  ]);
  assert.equal(calls.find(([type]) => type === 'purchase')[2], monthly);
});

test('successful purchase remains pending when backend configuration is incomplete', async () => {
  const { controller } = setup({
    verify: async () => ({ entitlement: null, syncError: 'Verification unavailable' }),
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const result = await controller.purchase(monthly);
  assert.equal(result.pending, true);
  assert.equal(controller.getState().isPro, false);
  assert.equal(controller.getState().error, 'Verification unavailable');
  assert.equal(controller.getState().accessVerified, false);
});

for (const kind of ['purchase', 'restore']) {
  test(`received ${kind} remains pending after backend rejection and recovers on refresh`, async () => {
    let received = false;
    let backendOffline = false;
    let backendConfirmed = false;
    let purchases = 0;
    const { controller } = setup({
      sdk: {
        getCustomerInfo: async () => (received ? activeInfo : emptyInfo),
        purchasePackage: async () => {
          purchases++;
          received = true;
          return { customerInfo: activeInfo };
        },
        restorePurchases: async () => {
          received = true;
          return activeInfo;
        },
      },
      verify: async () => {
        if (backendOffline) throw new Error('Backend offline');
        return { entitlement: backendConfirmed ? pro : null };
      },
    });
    await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    backendOffline = true;
    const transaction = kind === 'purchase' ? controller.purchase(monthly) : controller.restore();
    await assert.rejects(transaction, /Backend offline/);
    assert.equal(controller.getState().customerInfo, activeInfo);
    assert.equal(controller.getState().pending, true);
    assert.equal(controller.getState().isPro, false);
    assert.equal(controller.getState().accessVerified, false);
    assert.equal(controller.getState().loading, false);
    assert.throws(() => controller.purchase(monthly), /awaiting verification/);
    assert.equal(purchases, kind === 'purchase' ? 1 : 0);
    backendOffline = false;
    backendConfirmed = true;
    await controller.refresh({ sync: true });
    assert.equal(controller.getState().pending, false);
    assert.equal(controller.getState().isPro, true);
    assert.equal(controller.getState().accessVerified, true);
    assert.equal(controller.getState().error, null);
  });
}

test('account change during purchase clears access immediately and serializes SDK login', async () => {
  const waiting = deferred();
  const { controller, calls } = setup({
    sdk: {
      purchasePackage: async () => {
        calls.push(['purchase-start', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
        return waiting.promise;
      },
    },
    verify: async (id) => ({
      entitlement: id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' ? pro : null,
    }),
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const purchase = controller.purchase(monthly);
  await settle();
  const switchAccount = controller.identify('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(controller.getState().isPro, false);
  assert.equal(controller.getState().userId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(controller.getState().accessVerified, false);
  assert.equal(
    calls.some(([type]) => type === 'login'),
    false,
  );
  waiting.resolve({ customerInfo: activeInfo });
  assert.deepEqual(await purchase, { stale: true });
  await switchAccount;
  assert.equal(controller.getState().isPro, false);
  assert.deepEqual(
    calls.filter(([type]) => type === 'login'),
    [['login', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']],
  );
});

test('signout during a pending restore never restores the previous user access', async () => {
  const waiting = deferred();
  const { controller, calls } = setup({ sdk: { restorePurchases: () => waiting.promise } });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const restore = controller.restore();
  await settle();
  const signout = controller.identify(null);
  assert.equal(controller.getState().userId, null);
  assert.equal(controller.getState().isPro, false);
  assert.equal(controller.getState().accessVerified, false);
  waiting.resolve(activeInfo);
  assert.deepEqual(await restore, { stale: true });
  await signout;
  assert.deepEqual(
    calls.filter(([type]) => type === 'logout'),
    [['logout']],
  );
});

test('late SDK listener payload never directly changes another account entitlement', async () => {
  const verified = [];
  const { controller, callbacks } = setup({
    verify: async (id) => {
      verified.push(id);
      return { entitlement: null };
    },
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const callback = [...callbacks][0];
  await controller.identify('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  callback(activeInfo);
  await settle();
  assert.equal(controller.getState().userId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(controller.getState().isPro, false);
  assert.equal(verified.at(-1), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
});

test('restore failure is visible and leaves access closed', async () => {
  const { controller } = setup({
    sdk: {
      restorePurchases: async () => {
        throw new Error('Store unavailable');
      },
    },
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  await assert.rejects(controller.restore(), /Store unavailable/);
  assert.equal(controller.getState().error, 'Store unavailable');
  assert.equal(controller.getState().isPro, false);
  assert.equal(controller.getState().loading, false);
});

test('cancelled purchase is not shown as a failure or a Pro grant', async () => {
  const { controller } = setup({
    sdk: {
      purchasePackage: async () => {
        throw { userCancelled: true };
      },
    },
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.deepEqual(await controller.purchase(monthly), { cancelled: true });
  assert.equal(controller.getState().error, null);
  assert.equal(controller.getState().isPro, false);
});

test('guest cannot purchase or restore and cannot reuse previous account packages', async () => {
  const { controller } = setup();
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  await controller.identify(null);
  assert.deepEqual(controller.getState().packages, []);
  assert.throws(() => controller.purchase(monthly), /Sign in/);
  assert.throws(() => controller.restore(), /Sign in/);
});

test('changed or forged product cannot be bought using an old package identifier', async () => {
  const { controller, calls } = setup();
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  await assert.rejects(
    controller.purchase({ ...monthly, product: { identifier: 'different-product' } }),
    /no longer available/,
  );
  assert.equal(
    calls.some(([type]) => type === 'purchase'),
    false,
  );
});

test('expiry removes access without requiring an app restart', async () => {
  let clock = now;
  const { controller } = setup({ verify: async () => ({ entitlement: pro }), now: () => clock });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(controller.getState().isPro, true);
  clock = Date.parse(pro.expires_at);
  controller.expire();
  assert.equal(controller.getState().isPro, false);
});

test('offerings failure does not hide an existing server entitlement', async () => {
  const { controller } = setup({
    sdk: {
      getOfferings: async () => {
        throw new Error('No store connection');
      },
    },
    verify: async () => ({ entitlement: pro }),
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(controller.getState().isPro, true);
  assert.equal(controller.getState().accessVerified, true);
  assert.equal(
    controller.getState().error,
    'Store subscription information is temporarily unavailable. Try Refresh access again later. Your timer and routines are still available.',
  );
});

test('Free access is verified only after a successful backend response and resets for guests', async () => {
  const waiting = deferred();
  const { controller } = setup({ verify: () => waiting.promise });
  assert.equal(controller.getState().accessVerified, false);
  const identified = controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(controller.getState().accessVerified, false);
  waiting.resolve({ entitlement: null });
  await identified;
  assert.equal(controller.getState().accessVerified, true);
  assert.equal(controller.getState().isPro, false);
  await controller.identify(null);
  assert.equal(controller.getState().ready, true);
  assert.equal(controller.getState().accessVerified, false);
});

test('refresh invalidates access immediately and remains unknown through all queued verifications', async () => {
  const first = deferred();
  const second = deferred();
  let reads = 0;
  const { controller, changes } = setup({
    verify: () => {
      reads++;
      return reads === 1 ? { entitlement: null } : reads === 2 ? first.promise : second.promise;
    },
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const start = changes.length;
  const refreshing = controller.refresh();
  assert.equal(controller.getState().accessVerified, false);
  const queued = controller.refresh();
  await settle();
  first.resolve({ entitlement: null });
  await refreshing;
  assert.equal(controller.getState().accessVerified, false);
  assert.ok(changes.slice(start).every((state) => state.accessVerified === false));
  second.resolve({ entitlement: null });
  await queued;
  assert.equal(controller.getState().accessVerified, true);
});

test('backend verification failure clears verification and a later successful refresh recovers it', async () => {
  let fail = false;
  const { controller } = setup({
    verify: async () => {
      if (fail) throw new Error('Backend offline');
      return { entitlement: null };
    },
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  fail = true;
  await assert.rejects(controller.refresh(), /Backend offline/);
  assert.equal(controller.getState().ready, true);
  assert.equal(controller.getState().accessVerified, false);
  fail = false;
  await controller.refresh();
  assert.equal(controller.getState().accessVerified, true);
  assert.equal(controller.getState().error, null);
});

test('a stale backend rejection cannot change the new account verification or error', async () => {
  const old = deferred();
  let reads = 0;
  const { controller } = setup({
    verify: async (id) => {
      reads++;
      if (id === 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' && reads > 1) return old.promise;
      return { entitlement: null };
    },
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  const refreshing = controller.refresh();
  await settle();
  const switched = controller.identify('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(controller.getState().accessVerified, false);
  old.reject(new Error('Old account failure'));
  await assert.rejects(refreshing, /Old account failure/);
  await switched;
  assert.equal(controller.getState().userId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(controller.getState().accessVerified, true);
  assert.equal(controller.getState().error, null);
});

test('store offerings failure preserves verified Free and the SDK purchase-pending signal', async () => {
  const { controller } = setup({
    sdk: {
      getCustomerInfo: async () => activeInfo,
      getOfferings: async () => {
        throw new Error('No offerings');
      },
    },
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(controller.getState().accessVerified, true);
  assert.equal(controller.getState().isPro, false);
  assert.equal(controller.getState().pending, true);
});

test('listener-triggered verification also invalidates access and handles failure', async () => {
  const waiting = deferred();
  let reads = 0;
  const { controller, callbacks } = setup({
    verify: () => (++reads === 1 ? { entitlement: null } : waiting.promise),
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  [...callbacks][0](activeInfo);
  assert.equal(controller.getState().accessVerified, false);
  waiting.reject(new Error('Listener verification failed'));
  await settle();
  assert.equal(controller.getState().accessVerified, false);
  assert.equal(controller.getState().error, 'Listener verification failed');
});

test('a background store update re-reads the current identity and retains pending access while backend is offline', async () => {
  let received = false;
  let backendOffline = false;
  let infoReads = 0;
  const { controller, callbacks } = setup({
    sdk: {
      getCustomerInfo: async () => {
        infoReads++;
        return received ? activeInfo : emptyInfo;
      },
    },
    verify: async () => {
      if (backendOffline) throw new Error('Backend offline');
      return { entitlement: null };
    },
  });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  received = true;
  backendOffline = true;
  // The unscoped callback payload is deliberately stale; fresh SDK identity
  // information must be used before deciding whether another checkout is safe.
  [...callbacks][0](emptyInfo);
  await settle();
  assert.equal(infoReads, 2);
  assert.equal(controller.getState().customerInfo, activeInfo);
  assert.equal(controller.getState().pending, true);
  assert.equal(controller.getState().accessVerified, false);
  assert.throws(() => controller.purchase(monthly), /awaiting verification/);
});

test('an incomplete backend response cannot be mistaken for verified Free', async () => {
  const { controller } = setup({ verify: async () => undefined });
  await assert.rejects(
    controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    /Could not verify/,
  );
  assert.equal(controller.getState().accessVerified, false);
});

test('an already configured native SDK with unknown project requires a process restart', async () => {
  const { controller, calls } = setup({ sdk: { isConfigured: async () => true } });
  await controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.deepEqual(
    calls.filter(([type]) => ['configure', 'login'].includes(type)),
    [],
  );
  assert.equal(controller.getState().requiresRestart, true);
  assert.equal(controller.getState().configured, false);
  assert.match(controller.getState().error, /Close Sync completely/);
});

test('disposed controller ignores late results and removes SDK callbacks', async () => {
  const waiting = deferred();
  const { controller, callbacks, changes } = setup({ verify: () => waiting.promise });
  const identified = controller.identify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  await settle();
  controller.dispose();
  const count = changes.length;
  waiting.resolve({ entitlement: pro });
  await identified;
  assert.equal(changes.length, count);
  assert.equal(callbacks.size, 0);
});

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const productionScope = (id) => ({
  user_id: id,
  lane: 'production',
  namespace: id,
  epoch: 0,
  active: true,
  expires_at: null,
});
const reviewScope = (id) => ({
  user_id: id,
  lane: 'review',
  namespace: `review:1:${id}`,
  epoch: 1,
  active: true,
  expires_at: '2026-11-12T00:00:00Z',
});

test('scope resolution precedes native configure and a late old scope cannot configure that identity', async () => {
  const held = deferred();
  const { controller, calls } = setup({
    resolveScope: (id) => (id === A ? held.promise : Promise.resolve(productionScope(id))),
  });
  const first = controller.identify(A);
  await settle();
  assert.equal(calls.length, 0);
  const second = controller.identify(B);
  held.resolve(productionScope(A));
  await first;
  await second;
  assert.deepEqual(
    calls.filter(([type]) => type === 'configure'),
    [['configure', B]],
  );
  assert.equal(
    calls.some(([type, id]) => type === 'verify' && id === A),
    false,
  );
});

test('identity change while native configuration status is held prevents the old configure call', async () => {
  const held = deferred();
  let reads = 0;
  const { controller, calls } = setup({
    sdk: { isConfigured: () => (++reads === 1 ? held.promise : Promise.resolve(false)) },
  });
  const first = controller.identify(A);
  await settle();
  const second = controller.identify(B);
  held.resolve(false);
  await first;
  await second;
  assert.deepEqual(
    calls.filter(([type]) => type === 'configure'),
    [['configure', B]],
  );
});

test('offline confirmed local review scope cannot authorize native or cloud access from cache', async () => {
  const { controller, calls } = setup({
    loadScope: async () => reviewScope(A),
    resolveScope: async () => {
      throw new Error('Scope service offline');
    },
  });
  await assert.rejects(controller.identify(A), /Scope service offline/);
  assert.equal(controller.getState().scope.namespace, reviewScope(A).namespace);
  assert.equal(controller.getState().scopeConfirmed, false);
  assert.equal(controller.getState().ready, true);
  assert.equal(controller.getState().isPro, false);
  assert.equal(calls.length, 0);
});

test('switching projects blocks every SDK action and exposes a full-process-restart boundary', async () => {
  const { controller, calls } = setup({
    resolveScope: async (id) => (id === A ? productionScope(id) : reviewScope(id)),
    apiKeyForScope: (scope) =>
      scope.lane === 'production' ? 'appl_ProductionFixture' : 'appl_ReviewFixture',
  });
  await controller.identify(A);
  const count = calls.filter(([type]) =>
    ['configure', 'login', 'info', 'purchase', 'restore'].includes(type),
  ).length;
  await controller.identify(B);
  assert.equal(controller.getState().scope.lane, 'review');
  assert.equal(controller.getState().requiresRestart, true);
  assert.equal(controller.getState().configured, false);
  assert.throws(() => controller.purchase(monthly), /Close Sync completely/);
  assert.throws(() => controller.restore(), /Close Sync completely/);
  await controller.refresh();
  assert.equal(
    calls.filter(([type]) => ['configure', 'login', 'info', 'purchase', 'restore'].includes(type))
      .length,
    count,
  );
});

test('review purchases never fall back to the production key when their key is absent', async () => {
  const { controller, calls } = setup({ resolveScope: async (id) => reviewScope(id) });
  await controller.identify(A);
  assert.equal(controller.getState().configured, false);
  assert.deepEqual(
    calls.filter(([type]) => type === 'configure'),
    [],
  );
  assert.throws(() => controller.purchase(monthly), /not available/);
});

test('revocation between plan display and checkout prevents SDK purchase without switching lanes', async () => {
  let active = true;
  const { controller, calls } = setup({
    resolveScope: async (id) => ({ ...reviewScope(id), active }),
    apiKeyForScope: () => 'appl_ReviewFixture',
  });
  await controller.identify(A);
  active = false;
  await assert.rejects(controller.purchase(monthly), /unavailable/);
  assert.equal(
    calls.some(([type]) => type === 'purchase'),
    false,
  );
  assert.equal(controller.getState().scope.lane, 'review');
  assert.equal(controller.getState().scope.active, false);
  assert.equal(controller.getState().loading, false);
});

test('review access requires the exact namespace/epoch and App Store sandbox row, not SDK Pro', async () => {
  for (const bad of [
    {},
    { namespace: A },
    { epoch: 2 },
    { environment: 'PRODUCTION' },
    { store: 'test_store' },
  ]) {
    const scope = reviewScope(A);
    const row = {
      ...pro,
      namespace: scope.namespace,
      epoch: 1,
      environment: 'SANDBOX',
      store: 'app_store',
      ...bad,
    };
    if (Object.keys(bad).length === 0) delete row.namespace;
    const { controller } = setup({
      resolveScope: async () => scope,
      apiKeyForScope: () => 'appl_ReviewFixture',
      sdk: { getCustomerInfo: async () => activeInfo },
      verify: async () => ({ entitlement: row }),
    });
    await controller.identify(A);
    assert.equal(controller.getState().isPro, false);
    assert.equal(controller.getState().pending, true);
    controller.dispose();
  }
});

test('review lease expiry closes access even while its canonical subscription expiration is later', async () => {
  let time = now;
  const scope = { ...reviewScope(A), expires_at: new Date(now + 1000).toISOString() };
  const { controller } = setup({
    now: () => time,
    resolveScope: async () => scope,
    apiKeyForScope: () => 'appl_ReviewFixture',
    verify: async () => ({
      entitlement: {
        ...pro,
        namespace: scope.namespace,
        epoch: 1,
        environment: 'SANDBOX',
        store: 'app_store',
      },
    }),
  });
  await controller.identify(A);
  assert.equal(controller.getState().isPro, true);
  time += 1001;
  controller.expire();
  assert.equal(controller.getState().isPro, false);
  assert.equal(controller.getState().accessVerified, false);
  assert.equal(controller.getState().configured, false);
  assert.throws(() => controller.restore(), /not available/);
});

test('review expiry while native status or canonical verification is held cannot configure or verify access late', async () => {
  for (const phase of ['native', 'canonical']) {
    let time = now;
    const hold = deferred();
    const scope = { ...reviewScope(A), expires_at: new Date(now + 1000).toISOString() };
    const row = {
      ...pro,
      namespace: scope.namespace,
      epoch: 1,
      environment: 'SANDBOX',
      store: 'app_store',
    };
    const { controller, calls } = setup({
      now: () => time,
      resolveScope: async () => scope,
      apiKeyForScope: () => 'appl_ReviewFixture',
      sdk:
        phase === 'native'
          ? { isConfigured: () => hold.promise }
          : { getCustomerInfo: async () => activeInfo },
      verify: phase === 'canonical' ? () => hold.promise : async () => ({ entitlement: row }),
    });
    const identified = controller.identify(A);
    await settle();
    time += 1001;
    controller.expire();
    hold.resolve(phase === 'native' ? false : { entitlement: row });
    await identified.catch(() => {});
    assert.equal(controller.getState().isPro, false);
    assert.equal(controller.getState().accessVerified, false);
    assert.equal(controller.getState().pending, false);
    assert.equal(controller.getState().configured, false);
    if (phase === 'native')
      assert.equal(
        calls.some(([kind]) => kind === 'configure' || kind === 'info'),
        false,
      );
  }
});

test('a remounted controller waits for an old native purchase and reuses only the known same project', async () => {
  const held = deferred();
  const first = setup({ sdk: { purchasePackage: () => held.promise } });
  await first.controller.identify(A);
  const purchase = first.controller.purchase(monthly);
  await settle();
  first.controller.dispose();
  const second = createSubscriptionController({
    sdk: first.sdk,
    apiKey: 'public-sdk-key',
    resolveScope: async (id) => productionScope(id),
    verify: async () => ({ entitlement: null }),
    now: () => now,
  });
  const identified = second.identify(B);
  await settle();
  assert.equal(
    first.calls.some(([type, id]) => type === 'login' && id === B),
    false,
  );
  held.resolve({ customerInfo: activeInfo });
  await purchase;
  await identified;
  assert.equal(first.calls.filter(([type]) => type === 'configure').length, 1);
  assert.equal(
    first.calls.some(([type, id]) => type === 'login' && id === B),
    true,
  );
  assert.equal(second.getState().requiresRestart, false);
});

test('failed native identity writes quarantine the SDK until a cold process restart', async () => {
  for (const phase of ['login', 'logout']) {
    let identityCalls = 0;
    const { controller, calls } = setup({
      sdk: {
        ...(phase === 'login'
          ? {
              logIn: async () => {
                identityCalls++;
                throw new Error('Identity result unknown');
              },
            }
          : {
              logOut: async () => {
                identityCalls++;
                throw new Error('Identity result unknown');
              },
            }),
      },
    });
    await controller.identify(A);
    if (phase === 'login') await controller.identify(B);
    else await assert.rejects(controller.identify(null), /Close Sync completely/);
    const before = calls.length;
    await controller.identify(A);
    assert.equal(controller.getState().requiresRestart, true);
    assert.equal(controller.getState().configured, false);
    assert.equal(identityCalls, 1);
    assert.equal(
      calls
        .slice(before)
        .some(([kind]) => ['info', 'purchase', 'restore', 'configure'].includes(kind)),
      false,
    );
    assert.throws(() => controller.restore(), /Close Sync completely/);
  }
});

test('rejected production purchase cannot remain pending in review or be hidden by automatic refresh', async () => {
  let rejected = true;
  const scope = reviewScope(A);
  const row = {
    ...pro,
    namespace: scope.namespace,
    epoch: 1,
    environment: 'SANDBOX',
    store: 'app_store',
  };
  const { controller } = setup({
    resolveScope: async () => scope,
    apiKeyForScope: () => 'appl_ReviewFixture',
    sdk: { getCustomerInfo: async () => activeInfo },
    verify: async (_id, { sync }) => ({
      entitlement: rejected ? null : row,
      ...(sync ? { verificationError: rejected ? 'review_purchase_not_eligible' : null } : {}),
    }),
  });
  await controller.identify(A);
  assert.equal(controller.getState().pending, true);
  await controller.restore();
  assert.equal(controller.getState().pending, false);
  assert.match(controller.getState().error, /cannot verify a production purchase/);
  await controller.refresh();
  assert.equal(controller.getState().pending, false);
  assert.match(controller.getState().error, /cannot verify a production purchase/);
  rejected = false;
  await controller.refresh({ sync: true });
  assert.equal(controller.getState().isPro, true);
  assert.equal(controller.getState().error, null);
});

test('short review leases renew only in foreground near expiry and never overlap', async () => {
  let time = now;
  let syncs = 0;
  const scope = reviewScope(A);
  const held = deferred();
  const row = (expiry) => ({
    ...pro,
    namespace: scope.namespace,
    epoch: 1,
    environment: 'SANDBOX',
    store: 'app_store',
    expires_at: new Date(expiry).toISOString(),
  });
  const { controller } = setup({
    now: () => time,
    resolveScope: async () => scope,
    apiKeyForScope: () => 'appl_ReviewFixture',
    verify: async (_id, { sync }) => {
      if (sync) {
        syncs++;
        return held.promise;
      }
      return { entitlement: row(now + 300000) };
    },
  });
  await controller.identify(A);
  await controller.renewReviewAccess({ foreground: true });
  assert.equal(syncs, 0);
  time += 240001;
  await controller.renewReviewAccess({ foreground: false });
  assert.equal(syncs, 0);
  const renewal = controller.renewReviewAccess({ foreground: true });
  await settle();
  await controller.renewReviewAccess({ foreground: true });
  assert.equal(syncs, 1);
  assert.equal(controller.getState().accessVerified, false);
  held.resolve({ entitlement: row(time + 300000) });
  await renewal;
  assert.equal(controller.getState().isPro, true);
  assert.equal(controller.getState().accessVerified, true);
  await controller.renewReviewAccess({ foreground: true });
  assert.equal(syncs, 1);
});

test('failed review renewal retries at most every thirty seconds and stops after terminal revocation', async () => {
  let time = now;
  let syncs = 0;
  let active = true;
  const scope = reviewScope(A);
  const { controller } = setup({
    now: () => time,
    resolveScope: async () => ({ ...scope, active }),
    apiKeyForScope: () => 'appl_ReviewFixture',
    verify: async (_id, { sync }) => {
      if (sync) {
        syncs++;
        throw new Error('Verification offline');
      }
      return {
        entitlement: {
          ...pro,
          namespace: scope.namespace,
          epoch: 1,
          environment: 'SANDBOX',
          store: 'app_store',
          expires_at: new Date(now + 300000).toISOString(),
        },
      };
    },
  });
  await controller.identify(A);
  time += 240001;
  await assert.rejects(controller.renewReviewAccess({ foreground: true }), /Verification offline/);
  time += 1000;
  await controller.renewReviewAccess({ foreground: true });
  assert.equal(syncs, 1);
  time += 30000;
  await assert.rejects(controller.renewReviewAccess({ foreground: true }), /Verification offline/);
  assert.equal(syncs, 2);
  active = false;
  await controller.refresh();
  time += 60000;
  await controller.renewReviewAccess({ foreground: true });
  assert.equal(syncs, 2);
  assert.equal(controller.getState().isPro, false);
  assert.equal(controller.getState().scope.lane, 'review');
});

test('automatic review renewal never polls production, unverified Free or an expired reservation', async () => {
  for (const lane of ['production', 'free-review', 'expired-review']) {
    let time = now;
    let syncs = 0;
    const scope =
      lane === 'production'
        ? productionScope(A)
        : {
            ...reviewScope(A),
            expires_at: new Date(now + 200000).toISOString(),
          };
    const { controller } = setup({
      now: () => time,
      resolveScope: async () => scope,
      apiKeyForScope: () => 'appl_ReviewFixture',
      verify: async (_id, { sync }) => {
        if (sync) syncs++;
        return {
          entitlement:
            lane === 'free-review'
              ? null
              : {
                  ...pro,
                  namespace: scope.namespace,
                  epoch: scope.epoch,
                  environment: 'SANDBOX',
                  store: 'app_store',
                  expires_at: new Date(now + 100000).toISOString(),
                },
        };
      },
    });
    await controller.identify(A);
    time += 240001;
    controller.expire();
    await controller.renewReviewAccess({ foreground: true });
    assert.equal(syncs, 0, lane);
  }
});
