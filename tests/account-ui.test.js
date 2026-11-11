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
const source = readFileSync(
  new URL('../src/components/account/AccountPanel.js', import.meta.url),
  'utf8',
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
  .replace('export default function AccountPanel', 'function AccountPanel');
const compiled = transformSync(`${source}\nglobalThis.Component = AccountPanel;`, {
  configFile: false,
  babelrc: false,
  plugins: ['@babel/plugin-transform-react-jsx'],
}).code;

async function mount(overrides = {}) {
  const events = [];
  const auth = {
    ready: true,
    configured: true,
    user: null,
    recoveryMode: false,
    async signIn() {
      events.push('signin');
    },
    async signUp() {
      events.push('signup');
      return { requiresConfirmation: true };
    },
    async sendPasswordReset() {
      events.push('reset');
    },
    async updatePassword() {
      events.push('update');
    },
    async deleteAccount() {
      events.push('delete');
    },
    ...overrides,
  };
  const context = {
    React,
    useState: React.useState,
    useEffect: React.useEffect,
    useRef: React.useRef,
    ActivityIndicator: 'ActivityIndicator',
    Pressable: 'Pressable',
    ScrollView: 'ScrollView',
    Text: 'Text',
    TextInput: 'TextInput',
    View: 'View',
    StyleSheet: { create: (value) => value },
    Sheet: ({ children }) => React.createElement('Sheet', null, children),
    useAuth: () => auth,
    useTheme: () => ({
      theme: { text: '#111', textSecondary: '#555', accent: '#345', error: '#f00' },
    }),
    process: { env: {} },
    Alert: { alert() {} },
    Linking: { async openURL() {} },
  };
  new Script(compiled).runInNewContext(context);
  let renderer;
  let props = {
    visible: true,
    onClose() {
      events.push('close');
    },
    onManageSubscription() {},
  };
  await act(async () => {
    renderer = create(React.createElement(context.Component, props));
  });
  const textOf = (node) =>
    typeof node === 'string' ? node : (node?.children || []).map(textOf).join('');
  return {
    events,
    text: () => textOf(renderer.toJSON()),
    button: (label) =>
      renderer.root.findAllByType('Pressable').find((node) => textOf(node) === label),
    async press(label) {
      await act(async () => {
        const button = this.button(label);
        assert.ok(button, label);
        if (!button.props.disabled) await button.props.onPress();
      });
    },
    async fill(label, value) {
      await act(async () => {
        renderer.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value);
      });
    },
    async visible(value) {
      props = { ...props, visible: value };
      await act(async () => renderer.update(React.createElement(context.Component, props)));
    },
    async close() {
      await act(async () => renderer.unmount());
    },
  };
}

test('sign-up validates confirmation and requires email verification before claiming success', async () => {
  const ui = await mount();
  try {
    await ui.press('Create an account');
    await ui.fill('Email address', 'person@example.com');
    await ui.fill('Password', 'long-enough-password');
    await ui.fill('Confirm password', 'different-password');
    await ui.press('Create account');
    assert.deepEqual(ui.events, []);
    assert.match(ui.text(), /passwords do not match/);
    await ui.fill('Confirm password', 'long-enough-password');
    await ui.press('Create account');
    assert.deepEqual(ui.events, ['signup']);
    assert.match(ui.text(), /Check your email to confirm your account/);
  } finally {
    await ui.close();
  }
});

test('account deletion requires an exact typed confirmation and explains store cancellation', async () => {
  const ui = await mount({ user: { id: 'one', email: 'person@example.com' } });
  try {
    await ui.press('Delete account…');
    assert.match(ui.text(), /does not cancel an App Store or Google Play subscription/);
    assert.equal(ui.button('Permanently delete account').props.disabled, true);
    await ui.fill('Type DELETE to confirm account deletion', 'delete');
    await ui.press('Permanently delete account');
    assert.deepEqual(ui.events, []);
    await ui.fill('Type DELETE to confirm account deletion', 'DELETE');
    await ui.press('Permanently delete account');
    assert.deepEqual(ui.events, ['delete', 'close']);
  } finally {
    await ui.close();
  }
});

test('password reset gives a non-enumerating confirmation and never signs a user in', async () => {
  const ui = await mount();
  try {
    await ui.press('Forgot password?');
    await ui.fill('Email address', 'person@example.com');
    await ui.press('Send reset link');
    assert.deepEqual(ui.events, ['reset']);
    assert.match(ui.text(), /If an account uses this email/);
  } finally {
    await ui.close();
  }
});

test('recovery deep link opens password update rather than sign-in', async () => {
  const ui = await mount({ recoveryMode: true, user: { id: 'one', email: 'person@example.com' } });
  try {
    await ui.fill('New password', 'replacement-password');
    await ui.fill('Confirm password', 'replacement-password');
    await ui.press('Update password');
    assert.deepEqual(ui.events, ['update']);
    assert.match(ui.text(), /Your password has been updated/);
  } finally {
    await ui.close();
  }
});

test('unconfigured account services cannot send authentication requests', async () => {
  const ui = await mount({ configured: false });
  try {
    assert.equal(ui.button('Sign in').props.disabled, true);
    assert.match(ui.text(), /Account services are being set up/);
    await ui.press('Sign in');
    assert.deepEqual(ui.events, []);
  } finally {
    await ui.close();
  }
});
