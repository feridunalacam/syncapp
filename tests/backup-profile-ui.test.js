import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function compile(path, name) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(`export default function ${name}`, `function ${name}`);
  return transformSync(`${source}\nglobalThis.Component = ${name};`, {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
}
const profileCode = compile('../src/screens/Profile/ProfileScreen.js', 'ProfileScreen');
const subscriptionCode = compile(
  '../src/components/account/SubscriptionPanel.js',
  'SubscriptionPanel',
);
const textOf = (node) =>
  typeof node === 'string' ? node : (node?.children || []).map(textOf).join('');
const local = {
  routineCount: 2,
  sessionCount: 1,
  postCount: 0,
  updatedAt: '2026-11-14T10:00:00Z',
  routineNames: ['Phone11Check', 'New local routine'],
};
const savedCloud = {
  routineCount: 1,
  sessionCount: 0,
  postCount: 0,
  updatedAt: '2026-11-13T10:00:00Z',
  routineNames: ['Nns'],
};

async function mount({ panel = false, cloud: cloudOverrides, subscription: subOverrides } = {}) {
  const events = [];
  const alerts = [];
  const auth = { user: { id: 'account-a' }, error: null, recoveryMode: false };
  const subscription = {
    isPro: true,
    ready: true,
    configured: true,
    accessVerified: true,
    scopeConfirmed: true,
    scope: { lane: 'review', namespace: 'account-a:1', epoch: 1 },
    packages: [],
    refresh: async () => ({ isPro: true }),
    ...subOverrides,
  };
  const backupIntent = {};
  const recoveryIntent = {};
  const cloud = {
    status: 'conflict',
    getBackupPreview: async () => {
      events.push('preview-backup');
      return { local, cloud: savedCloud, intent: backupIntent };
    },
    getRecoveryPreview: async () => {
      events.push('preview-recovery');
      return { ...local, updatedAt: null, intent: recoveryIntent };
    },
    resolveConflict: async (choice, intent) => {
      events.push(['resolve', choice, intent]);
      return { status: 'synced' };
    },
    recoverDeviceCopy: async (intent) => {
      events.push(['recover', intent]);
      return { status: 'recovered' };
    },
    syncNow: async () => events.push('sync'),
    ...cloudOverrides,
  };
  const workout = {
    isWorkoutRunning: false,
    isMusicPlaying: false,
    isAudioSyncing: false,
  };
  const context = {
    React,
    useState: React.useState,
    useEffect: React.useEffect,
    useRef: React.useRef,
    ...Object.fromEntries(
      [
        'ActivityIndicator',
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
    Sheet: ({ visible, title, children, onClose }) =>
      visible ? React.createElement('Sheet', { title, onClose }, children) : null,
    StyleSheet: { create: (value) => value },
    Ionicons: 'Icon',
    useIsFocused: () => true,
    useTheme: () => ({ theme: {}, isDark: false, toggleTheme() {} }),
    useAuth: () => auth,
    useSubscription: () => subscription,
    useAccountData: () => cloud,
    useAds: () => ({ adsEnabled: false }),
    useWorkout: () => workout,
    useRoutineContext: () => ({
      routines: [{ id: 'local', name: 'Phone11Check' }],
      completedRoutines: [],
    }),
    usePostContext: () => ({ posts: [], addPost() {}, deletePost() {} }),
    useProfileData: () => ({ ready: true, picture: null, bio: '', links: {} }),
    useSpotifyConnection: () => ({ available: false, connecting: false }),
    useAppleMusicConnection: () => ({ available: false, connecting: false }),
    Alert: { alert: (...args) => alerts.push(args) },
    Linking: {},
    Clipboard: {},
    process: { env: {} },
  };
  new Script(panel ? subscriptionCode : profileCode).runInNewContext(context);
  const props = { visible: true, onClose() {}, onSignIn() {} };
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(context.Component, props));
  });
  return {
    events,
    alerts,
    backupIntent,
    recoveryIntent,
    renderer,
    text: () => textOf(renderer.toJSON()),
    button: (label) =>
      renderer.root.findAllByType('Pressable').find((node) => textOf(node).startsWith(label)),
    async press(label) {
      const button = this.button(label);
      assert.ok(button, `Button: ${label}`);
      await act(async () => {
        if (!button.props.disabled) await button.props.onPress();
      });
    },
    async confirm(label) {
      const confirm = alerts.at(-1)?.[2]?.find((item) => item.text === label);
      assert.ok(confirm, `Confirmation: ${label}`);
      await act(async () => confirm.onPress?.());
    },
    async closeSheet() {
      await act(async () => renderer.root.findByType('Sheet').props.onClose());
    },
    async update({
      auth: nextAuth,
      subscription: nextSub,
      cloud: nextCloud,
      workout: nextWorkout,
    } = {}) {
      Object.assign(auth, nextAuth);
      Object.assign(subscription, nextSub);
      Object.assign(cloud, nextCloud);
      Object.assign(workout, nextWorkout);
      await act(async () => renderer.update(React.createElement(context.Component, props)));
    },
    async close() {
      await act(async () => renderer.unmount());
    },
  };
}

test('backup comparison shows local-only routines and exact replacement direction before mutation', async (t) => {
  const ui = await mount();
  t.after(() => ui.close());
  await ui.press('Cloud backup');
  assert.match(ui.text(), /2 routines · 1 session · 0 posts/);
  assert.match(ui.text(), /Phone11Check · New local routine/);
  assert.match(ui.text(), /Nns/);
  assert.match(ui.text(), /Saved /);
  assert.deepEqual(ui.events, ['preview-backup']);
  await ui.press('Cloud → device: replace device data');
  assert.match(ui.alerts.at(-1)[0], /Replace this device with the cloud copy/);
  assert.match(ui.alerts.at(-1)[1], /Routines saved only on this device will stop appearing/);
  await ui.confirm('Cancel');
  assert.deepEqual(ui.events, ['preview-backup']);
  await ui.press('Device → cloud: keep this device');
  assert.match(ui.alerts.at(-1)[1], /Other devices will receive this device’s version/);
  await ui.confirm('Replace cloud backup');
  assert.deepEqual(ui.events, ['preview-backup', ['resolve', 'local', ui.backupIntent]]);
});

test('an old confirmation cannot mutate a different account or an active session', async (t) => {
  const ui = await mount();
  t.after(() => ui.close());
  await ui.press('Cloud backup');
  await ui.press('Cloud → device: replace device data');
  await ui.update({ workout: { isMusicPlaying: true } });
  await ui.confirm('Replace device data');
  assert.match(ui.alerts.at(-1)[0], /Finish your session/);
  assert.deepEqual(ui.events, ['preview-backup']);
  await ui.update({ workout: { isMusicPlaying: false } });
  await ui.press('Cloud → device: replace device data');
  const oldConfirmation = ui.alerts.at(-1)[2][1];
  await ui.update({ auth: { user: { id: 'account-b' } } });
  await act(async () => oldConfirmation.onPress());
  assert.deepEqual(ui.events, ['preview-backup']);
  assert.equal(ui.renderer.root.findAllByType('Sheet').length, 0);
});

test('Free accounts can review and explicitly recover a previous device copy while keeping both', async (t) => {
  const ui = await mount({ subscription: { isPro: false, accessVerified: false } });
  t.after(() => ui.close());
  await ui.press('Review previous device copies');
  assert.match(ui.text(), /Phone11Check/);
  assert.match(ui.text(), /Save time unavailable/);
  assert.match(ui.text(), /Nothing is uploaded until you review/);
  assert.deepEqual(ui.events, ['preview-recovery']);
  await ui.closeSheet();
  assert.deepEqual(ui.events, ['preview-recovery']);
  await ui.update({
    cloud: {
      getRecoveryPreview: async () => ({
        ...local,
        includesUndatedCopy: true,
        copyCount: 2,
        intent: ui.recoveryIntent,
      }),
    },
  });
  await ui.press('Review previous device copies');
  assert.match(ui.text(), /Includes an earlier device copy whose save time is unavailable/);
  await ui.press('Recover and keep both');
  assert.match(ui.alerts.at(-1)[1], /same ID are kept as separate copies/);
  await ui.confirm('Cancel');
  assert.equal(ui.events.filter(Array.isArray).length, 0);
  await ui.press('Recover and keep both');
  await ui.confirm('Recover and keep both');
  assert.deepEqual(ui.events.at(-1), ['recover', ui.recoveryIntent]);
  assert.match(ui.alerts.at(-1)[0], /Device records recovered/);
});

test('paused or failed backup work does not close review or claim success', async (t) => {
  const ui = await mount({
    cloud: {
      resolveConflict: async () => ({ status: 'conflict' }),
      recoverDeviceCopy: async () => ({ status: 'paused' }),
    },
  });
  t.after(() => ui.close());
  await ui.press('Cloud backup');
  await ui.press('Cloud → device: replace device data');
  await ui.confirm('Replace device data');
  assert.match(ui.text(), /The backup was not updated/);
  assert.ok(ui.button('Reload backup comparison'));
  await ui.closeSheet();
  await ui.press('Review previous device copies');
  await ui.press('Recover and keep both');
  await ui.confirm('Recover and keep both');
  assert.match(ui.text(), /Recovery paused/);
  assert.ok(ui.button('Read saved copy again'));
  assert.ok(!ui.alerts.some(([title]) => /records recovered|Backup updated/.test(title)));
});

test('local and unverified Pro states never advertise an existing cloud backup', async (t) => {
  const ui = await mount({ cloud: { status: 'local' } });
  t.after(() => ui.close());
  assert.match(ui.text(), /Cloud backup has not synced yet/);
  assert.doesNotMatch(ui.text(), /cloud backup is ready/);
  await ui.update({
    subscription: { accessVerified: false, error: 'Server verification unavailable' },
  });
  assert.match(ui.text(), /Server verification unavailable/);
  await ui.press('Cloud backup');
  assert.equal(ui.renderer.root.findByType('SubscriptionPanel').props.visible, true);
  assert.deepEqual(ui.events, []);
});

test('subscription refresh uses current verification status and newer server errors override success copy', async (t) => {
  const ui = await mount({ panel: true, subscription: { accessVerified: false } });
  t.after(() => ui.close());
  await ui.press('Refresh access');
  assert.match(ui.text(), /cloud access has not been verified/);
  assert.doesNotMatch(ui.text(), /Cloud backup is ready|Your routines, backed up/);
  await ui.update({ subscription: { error: 'Later server verification failed' } });
  assert.match(ui.text(), /Later server verification failed/);
  assert.doesNotMatch(ui.text(), /Pro membership found/);
});

test('visible subscription success expires with current membership without hiding pending or failed requests', async (t) => {
  const ui = await mount({ panel: true });
  t.after(() => ui.close());
  await ui.press('Refresh access');
  assert.match(ui.text(), /Pro membership found/);
  await ui.update({ subscription: { isPro: false, accessVerified: false, error: null } });
  assert.doesNotMatch(
    ui.text(),
    /Pro membership found|Pro access is verified|Cloud backup is ready/,
  );
  await ui.update({
    subscription: { refresh: async () => ({ pending: true }) },
  });
  await ui.press('Refresh access');
  await ui.update({ subscription: { accessVerified: true } });
  assert.match(ui.text(), /Purchase received. We are verifying your Pro access/);
  await ui.update({
    subscription: {
      refresh: async () => {
        throw new Error('Store request failed');
      },
    },
  });
  await ui.press('Refresh access');
  await ui.update({ subscription: { accessVerified: false } });
  assert.match(ui.text(), /Store request failed/);
});

test('a late subscription action cannot show the previous account success message', async (t) => {
  const pending = Promise.withResolvers();
  const ui = await mount({ panel: true, subscription: { refresh: () => pending.promise } });
  t.after(() => ui.close());
  let request;
  await act(async () => {
    request = ui.button('Refresh access').props.onPress();
  });
  await ui.update({ auth: { user: { id: 'account-b' } }, subscription: { isPro: false } });
  await act(async () => {
    pending.resolve({ isPro: true });
    await request;
  });
  assert.doesNotMatch(ui.text(), /Pro membership found/);
});
