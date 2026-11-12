import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import {
  createSafeStateFromPath,
  MAX_NAVIGATION_PATH_LENGTH,
} from '../src/navigation/safeLinking.js';

const require = createRequire(import.meta.url);
const { getStateFromPath } = require('@react-navigation/core');
const { transformSync } = require('@babel/core');
const config = { screens: { Home: 'routine/:routineId' } };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test('malformed navigation input never reaches the installed vulnerable parser', () => {
  let calls = 0;
  const safe = createSafeStateFromPath((...args) => {
    calls++;
    return getStateFromPath(...args);
  });
  for (const value of [
    '%80'.repeat(200),
    '%C2'.repeat(200),
    '%FE'.repeat(200),
    '%E0%A4%A',
    '%zz',
  ]) {
    assert.equal(safe(`routine/fixture?unexpected=${value}`, config), undefined);
    assert.equal(safe(`routine/${value}`, config), undefined);
  }
  for (const value of [null, undefined, 4, {}, 'x'.repeat(MAX_NAVIGATION_PATH_LENGTH + 1)])
    assert.equal(safe(value, config), undefined);
  assert.equal(calls, 0);
});

test('valid Unicode paths and query parameters retain installed React Navigation behavior', () => {
  const safe = createSafeStateFromPath(getStateFromPath);
  for (const path of [
    'routine/quick-burst',
    `routine/${encodeURIComponent('İstanbul koşu 🏃')}?note=${encodeURIComponent('Tempo + 50%')}`,
    'routine/fixture?literal=%2580&caption=hello+world',
  ])
    assert.deepEqual(safe(path, config), getStateFromPath(path, config));
  const boundary = `routine/${'x'.repeat(MAX_NAVIGATION_PATH_LENGTH - 'routine/'.length)}`;
  assert.equal(
    safe(boundary, config).routes[0].params.routineId.length,
    boundary.length - 'routine/'.length,
  );
});

test('the actual app wires guarded navigation and keeps Auth/Spotify callbacks separate', async (t) => {
  const source = readFileSync(new URL('../App.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace('export default function App', 'function App');
  const compiled = transformSync(`${source}\nglobalThis.Content = AppContent;`, {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
  const context = {
    ...React,
    React,
    createSafeStateFromPath,
    getStateFromPath,
    WebBrowser: { maybeCompleteAuthSession() {} },
    useTheme: () => ({ theme: { background: '#000' }, isDark: true }),
    getNavTheme: () => ({}),
    useRoutineContext: () => ({ isLoaded: true }),
    Linking: { createURL: () => 'syncapp://' },
    NavigationContainer: 'NavigationContainer',
    StatusBar: 'StatusBar',
    TabNavigator: 'TabNavigator',
  };
  new Script(compiled).runInNewContext(context);
  let root;
  await act(async () => {
    root = create(React.createElement(context.Content));
  });
  t.after(async () => act(async () => root.unmount()));
  const { linking } = root.root.findByType('NavigationContainer').props;
  assert.equal(
    linking.getStateFromPath(`routine/fixture?unexpected=${'%80'.repeat(200)}`, linking.config),
    undefined,
  );
  assert.equal(
    linking.getStateFromPath('routine/quick-burst', linking.config).routes[0].params.routineId,
    'quick-burst',
  );
  assert.equal(linking.filter('syncapp://auth/recovery?code=synthetic-fixture'), false);
  assert.equal(linking.filter('syncapp://spotify-callback?code=synthetic-fixture'), false);
  assert.equal(linking.filter('syncapp://routine/quick-burst'), true);
});
