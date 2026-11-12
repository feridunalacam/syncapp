import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { recoverySessionIdentity } from '../src/lib/authRecoveryState.js';

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
  const alerts = [];
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
    async signInWithOAuth(provider) {
      events.push(provider);
      return { session: {} };
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
    AppleSignInButton: ({ onPress, disabled }) =>
      React.createElement('Pressable', { onPress, disabled }, 'Continue with Apple'),
    useAuth: () => auth,
    recoverySessionIdentity,
    useTheme: () => ({
      theme: { text: '#111', textSecondary: '#555', accent: '#345', error: '#f00' },
    }),
    process: { env: {} },
    Alert: {
      alert(...args) {
        alerts.push(args);
      },
    },
    Linking: {
      async openURL(url) {
        events.push(url);
      },
    },
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
    alerts,
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
    async changeAuth(values) {
      Object.assign(auth, values);
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

test('confirmed legacy Apple deletion presents manual Apple revocation instructions and only the fixed Apple support URL', async () => {
  const ui = await mount({
    user: { id: 'one' },
    deleteAccount: async () => ({
      deleted: true,
      apple_revocation: { status: 'manual_required', url: 'https://untrusted.invalid' },
    }),
  });
  try {
    await ui.press('Delete account…');
    await ui.fill('Type DELETE to confirm account deletion', 'DELETE');
    await ui.press('Permanently delete account');
    assert.equal(ui.alerts.length, 1);
    assert.equal(ui.alerts[0][0], 'Account deleted');
    assert.match(ui.alerts[0][1], /Settings.*Sign in with Apple.*Sync/);
    await ui.alerts[0][2].find((button) => button.text === 'Apple instructions').onPress();
    assert.equal(ui.events.at(-1), 'https://support.apple.com/102571');
  } finally {
    await ui.close();
  }
});

test('remote deletion manual Apple follow-up survives a failed device cleanup', async () => {
  const ui = await mount({
    user: { id: 'one' },
    deleteAccount: async () => {
      const failure = new Error(
        'Your account was deleted, but some device records could not be removed.',
      );
      failure.apple_revocation = { status: 'manual_required' };
      throw failure;
    },
  });
  try {
    await ui.press('Delete account…');
    await ui.fill('Type DELETE to confirm account deletion', 'DELETE');
    await ui.press('Permanently delete account');
    assert.match(ui.text(), /some device records could not be removed/);
    assert.equal(ui.alerts.length, 1);
    assert.match(ui.alerts[0][1], /Settings.*Sign in with Apple/);
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

test('a delayed sign-in cannot dismiss a recovery accepted while its request was pending', async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const ui = await mount({ signIn: () => pending });
  try {
    await ui.fill('Email address', 'person@example.com');
    await ui.fill('Password', 'offline-password');
    await ui.press('Sign in');
    await ui.changeAuth({
      recoveryMode: true,
      user: { id: 'recovery', email: 'recovery@example.test' },
    });
    await act(async () => finish());
    assert.deepEqual(ui.events, []);
    assert.match(ui.text(), /Set a new password/);
    assert.equal(ui.button('Update password').props.disabled, false);
  } finally {
    await ui.close();
  }
});

test('an earlier recovery completion cannot replace the next account recovery form', async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const ui = await mount({
    recoveryMode: true,
    user: { id: 'earlier', email: 'earlier@example.test' },
    updatePassword: () => pending,
  });
  try {
    await ui.fill('New password', 'replacement-password');
    await ui.fill('Confirm password', 'replacement-password');
    await ui.press('Update password');
    await ui.changeAuth({ user: { id: 'newer', email: 'newer@example.test' } });
    await act(async () => finish());
    assert.match(ui.text(), /Set a new password/);
    assert.doesNotMatch(ui.text(), /Your password has been updated/);
    assert.ok(ui.button('Update password'));
  } finally {
    await ui.close();
  }
});

test('social sign-in options appear in sign-in and sign-up, require no password, and close after success', async () => {
  const ui = await mount();
  try {
    assert.ok(ui.button('Continue with Google'));
    assert.ok(ui.button('Continue with Apple'));
    await ui.press('Continue with Google');
    assert.deepEqual(ui.events, ['google', 'close']);
    await ui.press('Create an account');
    assert.ok(ui.button('Continue with Apple'));
    assert.ok(ui.button('Continue with Google'));
  } finally {
    await ui.close();
  }
});

test('cancelling social sign-in preserves the form without an error and guest mode remains available', async () => {
  const ui = await mount({ signInWithOAuth: async () => ({ cancelled: true }) });
  try {
    await ui.press('Continue with Apple');
    assert.deepEqual(ui.events, []);
    assert.doesNotMatch(ui.text(), /cancelled|Enter your password/);
    await ui.press('Continue without an account');
    assert.deepEqual(ui.events, ['close']);
  } finally {
    await ui.close();
  }
});
