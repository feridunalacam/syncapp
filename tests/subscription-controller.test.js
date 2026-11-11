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
  await controller.identify('user-a');
  assert.equal(controller.getState().configured, false);
  assert.equal(controller.getState().isPro, true);
  assert.equal(controller.getState().ready, true);
});

test('SDK Pro cannot grant cloud access before backend verification', async () => {
  const { controller } = setup({ sdk: { getCustomerInfo: async () => activeInfo } });
  await controller.identify('user-a');
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
  await controller.identify('user-a');
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
  await controller.identify('user-a');
  const result = await controller.purchase({ ...monthly });
  assert.equal(result.isPro, true);
  assert.equal(controller.getState().isPro, true);
  assert.equal(controller.getState().loading, false);
  assert.deepEqual(requests, [
    ['user-a', false],
    ['user-a', true],
  ]);
  assert.equal(calls.find(([type]) => type === 'purchase')[2], monthly);
});

test('successful purchase remains pending when backend configuration is incomplete', async () => {
  const { controller } = setup({
    verify: async () => ({ entitlement: null, syncError: 'Verification unavailable' }),
  });
  await controller.identify('user-a');
  const result = await controller.purchase(monthly);
  assert.equal(result.pending, true);
  assert.equal(controller.getState().isPro, false);
  assert.equal(controller.getState().error, 'Verification unavailable');
});

test('account change during purchase clears access immediately and serializes SDK login', async () => {
  const waiting = deferred();
  const { controller, calls } = setup({
    sdk: {
      purchasePackage: async () => {
        calls.push(['purchase-start', 'user-a']);
        return waiting.promise;
      },
    },
    verify: async (id) => ({ entitlement: id === 'user-a' ? pro : null }),
  });
  await controller.identify('user-a');
  const purchase = controller.purchase(monthly);
  await settle();
  const switchAccount = controller.identify('user-b');
  assert.equal(controller.getState().isPro, false);
  assert.equal(controller.getState().userId, 'user-b');
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
    [['login', 'user-b']],
  );
});

test('signout during a pending restore never restores the previous user access', async () => {
  const waiting = deferred();
  const { controller, calls } = setup({ sdk: { restorePurchases: () => waiting.promise } });
  await controller.identify('user-a');
  const restore = controller.restore();
  await settle();
  const signout = controller.identify(null);
  assert.equal(controller.getState().userId, null);
  assert.equal(controller.getState().isPro, false);
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
  await controller.identify('user-a');
  const callback = [...callbacks][0];
  await controller.identify('user-b');
  callback(activeInfo);
  await settle();
  assert.equal(controller.getState().userId, 'user-b');
  assert.equal(controller.getState().isPro, false);
  assert.equal(verified.at(-1), 'user-b');
});

test('restore failure is visible and leaves access closed', async () => {
  const { controller } = setup({
    sdk: {
      restorePurchases: async () => {
        throw new Error('Store unavailable');
      },
    },
  });
  await controller.identify('user-a');
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
  await controller.identify('user-a');
  assert.deepEqual(await controller.purchase(monthly), { cancelled: true });
  assert.equal(controller.getState().error, null);
  assert.equal(controller.getState().isPro, false);
});

test('guest cannot purchase or restore and cannot reuse previous account packages', async () => {
  const { controller } = setup();
  await controller.identify('user-a');
  await controller.identify(null);
  assert.deepEqual(controller.getState().packages, []);
  assert.throws(() => controller.purchase(monthly), /Sign in/);
  assert.throws(() => controller.restore(), /Sign in/);
});

test('changed or forged product cannot be bought using an old package identifier', async () => {
  const { controller, calls } = setup();
  await controller.identify('user-a');
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
  await controller.identify('user-a');
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
  await controller.identify('user-a');
  assert.equal(controller.getState().isPro, true);
  assert.equal(
    controller.getState().error,
    'Store subscription information is temporarily unavailable. Try Refresh access again later. Your timer and routines are still available.',
  );
});

test('reused native SDK is identified rather than configured twice', async () => {
  const { controller, calls } = setup({ sdk: { isConfigured: async () => true } });
  await controller.identify('user-a');
  assert.deepEqual(
    calls.filter(([type]) => ['configure', 'login'].includes(type)),
    [['login', 'user-a']],
  );
});

test('disposed controller ignores late results and removes SDK callbacks', async () => {
  const waiting = deferred();
  const { controller, callbacks, changes } = setup({ verify: () => waiting.promise });
  const identified = controller.identify('user-a');
  await settle();
  controller.dispose();
  const count = changes.length;
  waiting.resolve({ entitlement: pro });
  await identified;
  assert.equal(changes.length, count);
  assert.equal(callbacks.size, 0);
});
