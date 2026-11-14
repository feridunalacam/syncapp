import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createAccountStore } from '../src/lib/accountStore.js';
import { createBackupSync } from '../src/lib/backupSync.js';
import {
  billingScopeActive,
  parseBillingScope,
  sameBillingScope,
} from '../src/lib/accountBillingScope.js';
import { createAccountBackupRemote } from '../src/lib/accountBackupRemote.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const source = readFileSync(
  new URL('../src/context/AccountDataContext.js', import.meta.url),
  'utf8',
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
  .replace('export const useAccountData', 'const useAccountData')
  .replace('export function AccountDataProvider', 'function AccountDataProvider');
const compiled = transformSync(
  `${source}\nglobalThis.exports = { AccountDataProvider, useAccountData };`,
  {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  },
).code;

async function mount({
  initial = {},
  user = null,
  pro = false,
  subscriptionReady = true,
  scope = user
    ? {
        user_id: user.id,
        lane: 'production',
        namespace: user.id,
        epoch: 0,
        active: true,
        expires_at: null,
      }
    : null,
  scopeConfirmed = true,
  accessVerified = subscriptionReady,
  subscriptionError = null,
  refresh = async () => {},
  signOut = async () => {},
  sessionToken = 'offline-fixture',
  beforeRead = () => {},
  remote,
} = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  const base = {
    getItem: async (key) => {
      await beforeRead(key);
      return values.get(key) ?? null;
    },
    setItem: async (key, value) => {
      writes.push(key);
      values.set(key, value);
    },
    removeItem: async (key) => {
      writes.push(key);
      values.delete(key);
    },
    multiRemove: async (keys) => {
      writes.push(...keys);
      keys.forEach((key) => values.delete(key));
    },
    getAllKeys: async () => [...values.keys()],
  };
  let value,
    mounts = 0;
  const context = {
    React,
    createContext: React.createContext,
    useContext: React.useContext,
    useCallback: React.useCallback,
    useEffect: React.useEffect,
    useMemo: React.useMemo,
    useRef: React.useRef,
    useState: React.useState,
    ActivityIndicator: 'ActivityIndicator',
    Pressable: 'Pressable',
    Text: 'Text',
    View: 'View',
    AppState: { addEventListener: () => ({ remove: () => {} }) },
    AsyncStorage: base,
    useAuth: () => ({
      user,
      session: user ? { user, access_token: sessionToken } : null,
      signOut,
    }),
    useSubscription: () => ({
      isPro: pro,
      ready: subscriptionReady,
      scope,
      scopeConfirmed,
      accessVerified,
      error: subscriptionError,
      refresh,
    }),
    useTheme: () => ({
      theme: { background: '#000', text: '#fff', accent: '#0f0', accentText: '#000' },
    }),
    createAccountStore,
    createBackupSync,
    billingScopeActive,
    parseBillingScope,
    sameBillingScope,
    createAccountBackupRemote,
    supabase: remote || null,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  new Script(compiled).runInNewContext(context);
  const { AccountDataProvider, useAccountData } = context.exports;
  function Observer() {
    value = useAccountData();
    React.useEffect(() => {
      mounts++;
    }, []);
    return React.createElement('Records');
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(AccountDataProvider, {}, React.createElement(Observer)));
  });
  const textOf = (node) =>
    typeof node === 'string' ? node : (node?.children || []).map(textOf).join('');
  return {
    values,
    writes,
    get mounts() {
      return mounts;
    },
    get value() {
      return value;
    },
    text: () => textOf(renderer.toJSON()),
    accountAction: (label) =>
      renderer.root.findAllByType('Pressable').find((node) => textOf(node) === label).props.onPress,
    async retry() {
      await act(async () =>
        renderer.root
          .findAllByType('Pressable')
          .find((node) => textOf(node) === 'Retry')
          .props.onPress(),
      );
    },
    async useWithoutAccount() {
      await act(async () =>
        renderer.root
          .findAllByType('Pressable')
          .find((node) => textOf(node) === 'Use without an account')
          .props.onPress(),
      );
    },
    async close() {
      await act(async () => renderer.unmount());
    },
    async updateAccess(next) {
      if (Object.hasOwn(next, 'scope')) scope = next.scope;
      if (Object.hasOwn(next, 'pro')) pro = next.pro;
      if (Object.hasOwn(next, 'scopeConfirmed')) scopeConfirmed = next.scopeConfirmed;
      if (Object.hasOwn(next, 'accessVerified')) accessVerified = next.accessVerified;
      if (Object.hasOwn(next, 'subscriptionReady')) subscriptionReady = next.subscriptionReady;
      if (Object.hasOwn(next, 'subscriptionError')) subscriptionError = next.subscriptionError;
      if (Object.hasOwn(next, 'user')) user = next.user;
      if (Object.hasOwn(next, 'sessionToken')) sessionToken = next.sessionToken;
      await act(async () =>
        renderer.update(
          React.createElement(AccountDataProvider, {}, React.createElement(Observer)),
        ),
      );
    },
  };
}

test('a failed local startup read keeps consumers unmounted and Retry opens the original guest copy', async () => {
  let blocked = true;
  const original = JSON.stringify([{ id: 'guest', workSong: { uri: 'file:///private-song.mp3' } }]);
  const app = await mount({
    initial: { routines: original },
    beforeRead: () => {
      if (blocked) throw new Error('Offline storage fixture unavailable');
    },
  });
  try {
    assert.equal(app.mounts, 0);
    assert.match(app.text(), /Saved records could not be opened/);
    assert.deepEqual(app.writes, []);
    blocked = false;
    await app.retry();
    assert.equal(app.mounts, 1);
    assert.equal(app.value.ready, true);
    assert.equal(await app.value.storage.getString('routines'), original);
    assert.deepEqual(app.writes, []);
  } finally {
    await app.close();
  }
});

test('unrecoverable journal data never reaches a Free account consumer before exact recovery succeeds', async () => {
  const prefix = `@syncapp/account/${ACCOUNT_ID}/`;
  const entries = [
    ['routines', '[{"id":"original"}]'],
    ['completedRoutines', null],
    ['profileBio', 'Original local bio'],
    ['profileSocialLinks', null],
    ['posts', null],
    ['@syncmeta', '{"revision":2,"counter":3,"dirty":true}'],
  ].map(([key, value]) => [prefix + key, value]);
  const journal = JSON.stringify({ version: 1, entries });
  let blocked = true;
  const app = await mount({
    user: { id: ACCOUNT_ID },
    initial: {
      [prefix + 'routines']: '[{"id":"half-restored-cloud"}]',
      [prefix + '@cloud-restore-pending']: journal,
    },
    beforeRead: (key) => {
      if (blocked && key.endsWith('@cloud-restore-pending')) throw new Error('Unavailable');
    },
  });
  try {
    assert.equal(app.mounts, 0);
    assert.deepEqual(app.writes, []);
    blocked = false;
    await app.retry();
    assert.equal(app.mounts, 1);
    assert.deepEqual(await app.value.storage.getJSON('routines'), [{ id: 'original' }]);
    assert.equal(await app.value.storage.getString('profileBio'), 'Original local bio');
    assert.equal(app.values.has(prefix + '@cloud-restore-pending'), false);
  } finally {
    await app.close();
  }
});

test('large Free and guest local records preserve exact files without invoking cloud backup', async () => {
  for (const user of [null, { id: ACCOUNT_ID }]) {
    const prefix = user ? `@syncapp/account/${user.id}/` : '';
    const original = JSON.stringify([
      { id: 'large', note: 'x'.repeat(2200000), uri: 'file:///local.mp3' },
    ]);
    const app = await mount({
      user,
      initial: { [prefix + 'routines']: original },
      remote: { from: () => assert.fail('Free and guest records must not contact the cloud') },
    });
    try {
      assert.equal(app.mounts, 1);
      assert.equal(app.value.ready, true);
      assert.equal(await app.value.storage.getString('routines'), original);
      assert.deepEqual(app.writes, []);
    } finally {
      await app.close();
    }
  }
});

test('waiting for subscription verification never blocks readable local account records', async () => {
  const app = await mount({
    user: { id: ACCOUNT_ID },
    subscriptionReady: false,
    initial: { [`@syncapp/account/${ACCOUNT_ID}/profileBio`]: 'Available offline' },
    remote: { from: () => assert.fail('Unverified access must not start backup') },
  });
  try {
    assert.equal(app.mounts, 1);
    assert.equal(app.value.ready, true);
    assert.equal(await app.value.storage.getString('profileBio'), 'Available offline');
  } finally {
    await app.close();
  }
});

test('manual sync rejects a missing or unverified engine instead of silently claiming completion', async () => {
  for (const admission of ['unconfigured', 'unverified', 'pending']) {
    const app = await mount({
      user: { id: ACCOUNT_ID },
      pro: true,
      ...(admission === 'pending' ? { subscriptionReady: false } : {}),
      ...(admission === 'unverified' ? { scopeConfirmed: false, accessVerified: false } : {}),
      remote:
        admission === 'unconfigured'
          ? null
          : {
              from: () => assert.fail('Unadmitted manual sync cannot query the cloud'),
            },
    });
    try {
      assert.equal(app.value.ready, true, 'Unadmitted backup does not close local records');
      await assert.rejects(
        app.value.syncNow(),
        /Cloud backup is not ready.*Refresh account access/,
      );
      assert.deepEqual(app.writes, []);
      const oldSync = app.value.syncNow;
      await app.updateAccess({ user: null, scope: null });
      await assert.rejects(oldSync(), /account changed.*Sign in and verify/);
      assert.deepEqual(app.writes, []);
    } finally {
      await app.close();
    }
  }
});

test('a pending Pro backup cannot block local core or replace records after a workout starts', async () => {
  let finish,
    reads = 0;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const app = await mount({
    user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    pro: true,
    initial: {
      '@syncapp/account/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/routines': '[{"id":"device"}]',
    },
    remote: {
      from: () => {
        const query = {
          select: () => query,
          setHeader: () => query,
          eq: () => query,
          abortSignal: () => query,
          maybeSingle: () => {
            reads++;
            return pending;
          },
        };
        return query;
      },
    },
  });
  try {
    assert.equal(reads, 1);
    assert.equal(app.mounts, 1);
    assert.equal(app.value.ready, true);
    app.value.setSyncPaused(true);
    await act(async () =>
      finish({
        data: { revision: 4, payload: { version: 1, data: { routines: [{ id: 'cloud' }] } } },
        error: null,
      }),
    );
    assert.deepEqual(await app.value.storage.getJSON('routines'), [{ id: 'device' }]);
    assert.equal(app.mounts, 1);
    assert.equal(app.value.status, 'paused');
  } finally {
    await app.close();
  }
});

test('a consumer read failure closes the gate and Retry recovers before mounting again', async () => {
  const original = '[{"id":"preserved"}]';
  const app = await mount({ initial: { routines: original } });
  try {
    assert.equal(app.mounts, 1);
    await act(async () => app.value.reportLoadFailure());
    assert.match(app.text(), /Saved records could not be opened/);
    assert.deepEqual(app.writes, []);
    await app.retry();
    assert.equal(app.mounts, 2);
    assert.equal(await app.value.storage.getString('routines'), original);
    assert.deepEqual(app.writes, []);
  } finally {
    await app.close();
  }
});

test('damaged guest and account JSON never mounts consumers or overwrites its recoverable raw value', async () => {
  for (const user of [null, { id: ACCOUNT_ID }]) {
    const key = user ? `@syncapp/account/${user.id}/routines` : 'routines';
    const damaged = '[{"id":"recoverable"},';
    const app = await mount({ user, initial: { [key]: damaged } });
    try {
      assert.equal(app.mounts, 0);
      assert.match(app.text(), /Saved records could not be opened/);
      assert.equal(app.values.get(key), damaged);
      assert.deepEqual(app.writes, []);
      const repaired = '[{"id":"recoverable"}]';
      app.values.set(key, repaired);
      await app.retry();
      assert.equal(app.mounts, 1);
      assert.equal(await app.value.storage.getString('routines'), repaired);
      assert.deepEqual(app.writes, []);
    } finally {
      await app.close();
    }
  }
});

test('a held first scope keeps consumers and editable scratch unmounted until its exact namespace is known', async () => {
  const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const scope = {
    user_id: id,
    lane: 'review',
    namespace: `review:1:${id}`,
    epoch: 1,
    active: true,
    expires_at: '2099-01-01T00:00:00Z',
  };
  const app = await mount({
    user: { id },
    scope: null,
    subscriptionReady: false,
    scopeConfirmed: false,
    accessVerified: false,
    initial: {
      routines: '[{"id":"guest-private"}]',
      [`@syncapp/account/${id}/routines`]: '[{"id":"production-private"}]',
      [`@syncapp/account/${scope.namespace}/routines`]: '[{"id":"review-local"}]',
      [`@syncapp/account/unresolved:${id}/routines`]: '[{"id":"earlier-scratch"}]',
    },
    remote: { from: () => assert.fail('Unknown/unverified scope must not query cloud') },
  });
  try {
    assert.equal(app.mounts, 0);
    assert.equal(app.value, undefined);
    assert.deepEqual(app.writes, []);
    await app.updateAccess({ scope });
    assert.equal(app.value.storage.namespace, scope.namespace);
    assert.deepEqual(await app.value.storage.getJSON('routines'), [{ id: 'review-local' }]);
    assert.equal(app.value.hasGuestData, false);
    assert.equal(app.values.get('routines'), '[{"id":"guest-private"}]');
    assert.equal(
      app.values.get(`@syncapp/account/${id}/routines`),
      '[{"id":"production-private"}]',
    );
    assert.equal(
      app.values.get(`@syncapp/account/unresolved:${id}/routines`),
      '[{"id":"earlier-scratch"}]',
    );
    assert.equal(app.mounts, 1);
    assert.deepEqual(app.writes, []);
  } finally {
    await app.close();
  }
});

test('failed first scope resolution retries account access before opening preserved records', async () => {
  let refreshes = 0;
  const original = '[{"id":"preserved-account"}]';
  const app = await mount({
    user: { id: ACCOUNT_ID },
    scope: null,
    scopeConfirmed: false,
    accessVerified: false,
    subscriptionError: 'Network unavailable',
    initial: { [`@syncapp/account/${ACCOUNT_ID}/routines`]: original },
    refresh: async () => {
      refreshes++;
      if (refreshes === 1) throw new Error('Still offline');
    },
  });
  try {
    assert.equal(app.mounts, 0);
    assert.match(app.text(), /Account access could not be checked/);
    assert.doesNotMatch(app.text(), /Saved records could not be opened/);
    await app.retry();
    assert.equal(refreshes, 1);
    assert.equal(app.mounts, 0);
    assert.match(app.text(), /Account access could not be checked/);
    await app.retry();
    assert.equal(refreshes, 2);
    assert.equal(app.mounts, 0);
    await app.updateAccess({
      scope: {
        user_id: ACCOUNT_ID,
        lane: 'production',
        namespace: ACCOUNT_ID,
        epoch: 0,
        active: true,
        expires_at: null,
      },
    });
    assert.equal(app.mounts, 1);
    assert.equal(await app.value.storage.getString('routines'), original);
    assert.deepEqual(app.writes, []);
  } finally {
    await app.close();
  }
});

test('cached matching scopes keep exact local records available offline without granting cloud access', async () => {
  for (const lane of ['production', 'review']) {
    const namespace = lane === 'production' ? ACCOUNT_ID : `review:1:${ACCOUNT_ID}`;
    const original = '[{"id":"cached-local"}]';
    const app = await mount({
      user: { id: ACCOUNT_ID },
      pro: true,
      subscriptionReady: false,
      scopeConfirmed: false,
      accessVerified: false,
      scope: {
        user_id: ACCOUNT_ID,
        lane,
        namespace,
        epoch: lane === 'production' ? 0 : 1,
        active: lane === 'production',
        expires_at: lane === 'production' ? null : '2020-01-01T00:00:00Z',
      },
      initial: { [`@syncapp/account/${namespace}/routines`]: original },
      remote: {
        from: () => assert.fail('Cached routing cannot authorize cloud access'),
        rpc: () => assert.fail('Cached routing cannot authorize cloud writes'),
      },
    });
    try {
      assert.equal(app.mounts, 1);
      assert.equal(app.value.storage.namespace, namespace);
      assert.equal(await app.value.storage.getString('routines'), original);
      await app.updateAccess({ subscriptionReady: true, subscriptionError: 'Offline' });
      assert.equal(app.mounts, 1);
      assert.equal(app.value.status, 'local');
      assert.deepEqual(app.writes, []);
    } finally {
      await app.close();
    }
  }
});

test('a mismatched or malformed scope cannot mount account consumers or prepare another namespace', async () => {
  for (const scope of [
    {
      user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      namespace: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      lane: 'production',
      epoch: 0,
      active: true,
      expires_at: null,
    },
    { user_id: ACCOUNT_ID, namespace: ACCOUNT_ID, lane: 'review', epoch: 0, active: true },
  ]) {
    let reads = 0;
    const app = await mount({
      user: { id: ACCOUNT_ID },
      scope,
      beforeRead: () => reads++,
    });
    try {
      assert.equal(app.mounts, 0);
      assert.equal(reads, 0);
      assert.deepEqual(app.writes, []);
      assert.match(app.text(), /Account access could not be checked/);
    } finally {
      await app.close();
    }
  }
});

test('using Sync without an account calls normal sign out and preserves all account and guest records', async () => {
  let signOuts = 0;
  const initial = {
    routines: '[{"id":"guest"}]',
    [`@syncapp/account/${ACCOUNT_ID}/routines`]: '[{"id":"account"}]',
  };
  const app = await mount({
    user: { id: ACCOUNT_ID },
    scope: null,
    initial,
    signOut: async () => {
      signOuts++;
      if (signOuts === 1) throw new Error('Sign out unavailable');
    },
  });
  try {
    await app.useWithoutAccount();
    assert.equal(signOuts, 1);
    assert.equal(app.mounts, 0);
    assert.match(app.text(), /Account access could not be checked/);
    await app.useWithoutAccount();
    assert.equal(signOuts, 2);
    assert.equal(app.mounts, 0);
    await app.updateAccess({ user: null, scope: null });
    assert.equal(app.mounts, 1);
    assert.equal(await app.value.storage.getString('routines'), initial.routines);
    assert.deepEqual(Object.fromEntries(app.values), initial);
    assert.deepEqual(app.writes, []);
  } finally {
    await app.close();
  }
});

test('failure-screen callbacks captured for an old user cannot refresh or sign out a new identity', async () => {
  let refreshes = 0;
  let signOuts = 0;
  const app = await mount({
    user: { id: ACCOUNT_ID },
    scope: null,
    refresh: async () => refreshes++,
    signOut: async () => signOuts++,
  });
  try {
    const oldRetry = app.accountAction('Retry');
    const oldSignOut = app.accountAction('Use without an account');
    await app.updateAccess({
      user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      scope: null,
      subscriptionReady: false,
    });
    await act(async () => {
      await oldRetry();
      await oldSignOut();
    });
    assert.equal(refreshes, 0);
    assert.equal(signOuts, 0);
    assert.equal(app.mounts, 0);
    assert.deepEqual(app.writes, []);
  } finally {
    await app.close();
  }
});

test('revoked review access cannot apply a previously requested cloud backup or touch guest data', async () => {
  const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const scope = {
    user_id: id,
    lane: 'review',
    namespace: `review:1:${id}`,
    epoch: 1,
    active: true,
    expires_at: '2099-01-01T00:00:00Z',
  };
  let finish,
    reads = 0;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const app = await mount({
    user: { id },
    pro: true,
    scope,
    initial: {
      routines: '[{"id":"guest"}]',
      [`@syncapp/account/${scope.namespace}/routines`]: '[{"id":"review-local"}]',
    },
    remote: {
      from: (table) => {
        assert.equal(table, 'review_backups');
        const query = {
          select: () => query,
          setHeader: () => query,
          eq: () => query,
          abortSignal: () => query,
          maybeSingle: () => {
            reads++;
            return pending;
          },
        };
        return query;
      },
    },
  });
  try {
    assert.equal(reads, 1);
    await app.updateAccess({
      scope: { ...scope, active: false },
      pro: false,
      accessVerified: false,
    });
    await act(async () =>
      finish({
        data: {
          namespace: scope.namespace,
          epoch: 1,
          revision: 4,
          payload: { version: 1, data: { routines: [{ id: 'late-cloud' }] } },
        },
        error: null,
      }),
    );
    assert.deepEqual(await app.value.storage.getJSON('routines'), [{ id: 'review-local' }]);
    assert.equal(app.values.get('routines'), '[{"id":"guest"}]');
    assert.equal(app.value.storage.namespace, scope.namespace);
  } finally {
    await app.close();
  }
});

test('Free offline recovery keeps both Phone11Check and current Nns without contacting the cloud', async () => {
  const prefix = `@syncapp/account/${ACCOUNT_ID}/`;
  const pinned = JSON.stringify({
    payload: { version: 1, data: { routines: [{ id: 'phone', name: 'Phone11Check' }] } },
  });
  const app = await mount({
    user: { id: ACCOUNT_ID },
    pro: false,
    initial: {
      [prefix + 'routines']: '[{"id":"nns","name":"Nns"}]',
      [prefix + '@before-cloud-restore']: pinned,
      routines: '[{"id":"guest-private"}]',
    },
    remote: { from: () => assert.fail('Local recovery does not require cloud access') },
  });
  try {
    const review = await app.value.getRecoveryPreview();
    assert.deepEqual(Array.from(review.routineNames), ['Phone11Check']);
    assert.deepEqual(app.writes, [], 'Review has no storage side effects');
    let result;
    await act(async () => {
      result = await app.value.recoverDeviceCopy(review.intent);
    });
    assert.equal(result.status, 'recovered');
    assert.deepEqual(
      (await app.value.storage.getJSON('routines')).map((row) => row.name),
      ['Nns', 'Phone11Check'],
    );
    assert.equal(app.values.get(prefix + '@before-cloud-restore'), pinned);
    assert.equal(app.values.get('routines'), '[{"id":"guest-private"}]');
    assert.equal(app.mounts, 2);
    assert.equal((await app.value.storage.snapshot()).meta.recoveryPending, true);
  } finally {
    await app.close();
  }
});

test('recovery confirmation cannot cross workout, session, account, scope or consumer epoch changes', async () => {
  const prefix = `@syncapp/account/${ACCOUNT_ID}/`;
  const initial = {
    [prefix + 'routines']: '[{"id":"nns"}]',
    [prefix + '@before-cloud-restore']: JSON.stringify({
      payload: { version: 1, data: { routines: [{ id: 'phone' }] } },
    }),
  };
  for (const change of ['workout', 'session', 'account', 'scope', 'epoch']) {
    const app = await mount({ user: { id: ACCOUNT_ID }, initial });
    try {
      const prior = app.value;
      const review = await prior.getRecoveryPreview();
      if (change === 'workout') prior.setSyncPaused(true);
      if (change === 'session') await app.updateAccess({ sessionToken: 'new-session' });
      if (change === 'account')
        await app.updateAccess({
          user: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
          scope: null,
        });
      if (change === 'scope')
        await app.updateAccess({
          scope: {
            user_id: ACCOUNT_ID,
            namespace: `review:1:${ACCOUNT_ID}`,
            lane: 'review',
            epoch: 1,
            active: true,
            expires_at: '2099-01-01T00:00:00Z',
          },
        });
      if (change === 'epoch') await act(async () => app.value.importGuestData());
      const writesBefore = app.writes.length;
      await assert.rejects(prior.recoverDeviceCopy(review.intent), /changed|Review/);
      assert.equal(app.writes.length, writesBefore);
      assert.equal(app.values.get(prefix + 'routines'), initial[prefix + 'routines']);
      assert.equal(
        app.values.get(prefix + '@before-cloud-restore'),
        initial[prefix + '@before-cloud-restore'],
      );
    } finally {
      await app.close();
    }
  }
});

test('a session change while a confirmed cloud restore is downloading cannot apply the old intent', async () => {
  const prefix = `@syncapp/account/${ACCOUNT_ID}/`;
  let delay = false;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const row = {
    revision: 3,
    payload: { version: 1, data: { routines: [{ id: 'nns', name: 'Nns' }] } },
  };
  const app = await mount({
    user: { id: ACCOUNT_ID },
    pro: true,
    initial: {
      [prefix + 'routines']: '[{"id":"phone","name":"Phone11Check"}]',
      [prefix + '@syncmeta']: '{"revision":2,"counter":1,"dirty":true}',
    },
    remote: {
      from: () => {
        const query = {
          select: () => query,
          setHeader: () => query,
          eq: () => query,
          abortSignal: () => query,
          maybeSingle: async () => {
            if (delay) await pending;
            return { data: row, error: null };
          },
        };
        return query;
      },
    },
  });
  try {
    const preview = await app.value.getBackupPreview();
    delay = true;
    let choosing;
    await act(async () => {
      choosing = app.value.resolveConflict('cloud', preview.intent);
    });
    await app.updateAccess({ sessionToken: 'new-session-token' });
    let result;
    await act(async () => {
      release();
      result = await choosing;
    });
    assert.notEqual(result?.status, 'synced');
    assert.deepEqual(await app.value.storage.getJSON('routines'), [
      { id: 'phone', name: 'Phone11Check' },
    ]);
    assert.equal(app.values.has(prefix + '@before-cloud-restore'), false);
  } finally {
    release();
    await app.close();
  }
});
