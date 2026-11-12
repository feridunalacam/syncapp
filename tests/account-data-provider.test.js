import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { createAccountStore } from '../src/lib/accountStore.js';
import { createBackupSync } from '../src/lib/backupSync.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
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
    useAuth: () => ({ user, session: user ? { user, access_token: 'offline-fixture' } : null }),
    useSubscription: () => ({ isPro: pro, ready: subscriptionReady }),
    useTheme: () => ({
      theme: { background: '#000', text: '#fff', accent: '#0f0', accentText: '#000' },
    }),
    createAccountStore,
    createBackupSync,
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
    async retry() {
      await act(async () => renderer.root.findByType('Pressable').props.onPress());
    },
    async close() {
      await act(async () => renderer.unmount());
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
  const prefix = '@syncapp/account/a/';
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
    user: { id: 'a' },
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
  for (const user of [null, { id: 'free' }]) {
    const prefix = user ? '@syncapp/account/free/' : '';
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
    user: { id: 'waiting' },
    subscriptionReady: false,
    initial: { '@syncapp/account/waiting/profileBio': 'Available offline' },
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

test('a pending Pro backup cannot block local core or replace records after a workout starts', async () => {
  let finish,
    reads = 0;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const app = await mount({
    user: { id: 'pro' },
    pro: true,
    initial: { '@syncapp/account/pro/routines': '[{"id":"device"}]' },
    remote: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => {
              reads++;
              return pending;
            },
          }),
        }),
      }),
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
  for (const user of [null, { id: 'a' }]) {
    const key = user ? '@syncapp/account/a/routines' : 'routines';
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
