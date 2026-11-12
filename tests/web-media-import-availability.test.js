import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { webMediaImportAvailable } from '../src/services/mediaImport/config.js';
import { normalizeDetectedMedia } from '../src/domain/musicLibrary.js';
import { resolveProfile } from '../scripts/check-release-config.mjs';

const { transformSync } = createRequire(import.meta.url)('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const folder = 'screens/Routine/components/musicSearch/';

function fixture({ dev = false, profile = 'production', enabled = 'false' } = {}) {
  const calls = {
    legacyLoads: 0,
    webHooks: 0,
    injections: [],
    scans: [],
    opened: [],
    alerts: [],
    fs: [],
    persisted: [],
    documents: 0,
    selected: [],
  };
  const metadata = new Map([
    [
      'routines',
      JSON.stringify([
        {
          id: 'retained-routine',
          roundsData: [
            {
              workSong: {
                uri: 'https://example.org/owner-original.wav',
                source: 'url',
                platform: 'device',
              },
            },
          ],
        },
      ]),
    ],
  ]);
  const original = new Map(metadata);
  const cache = new Map();
  const components = Object.fromEntries(
    ['View', 'Text', 'Pressable', 'ScrollView', 'TextInput', 'WebView'].map((name) => [name, name]),
  );
  const globals = {
    __DEV__: dev,
    process: {
      env: { EXPO_PUBLIC_BUILD_PROFILE: profile, EXPO_PUBLIC_WEB_MEDIA_IMPORT_ENABLED: enabled },
    },
    console: { error() {} },
    setInterval: (callback) => {
      calls.scans.push(callback);
      return callback;
    },
    clearInterval: (id) => {
      const at = calls.scans.indexOf(id);
      if (at >= 0) calls.scans.splice(at, 1);
    },
  };
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative);
    const exports = {};
    const compiled = transformSync(
      readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8'),
      {
        configFile: false,
        babelrc: false,
        plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'],
      },
    ).code;
    const require = (name) => {
      if (name === 'react') return React;
      if (name === 'react-native')
        return {
          ...components,
          Keyboard: { dismiss() {} },
          Alert: { alert: (...args) => calls.alerts.push(args) },
        };
      if (name === '@expo/vector-icons/Ionicons') return 'Icon';
      if (name === 'react-native-webview') return { WebView: 'WebView' };
      if (name.endsWith('/context/ThemeContext')) return { useTheme: () => ({ theme: {} }) };
      if (name.endsWith('/services/mediaImport/config'))
        return load('services/mediaImport/config.js');
      if (name.endsWith('/services/alerts/assets')) return { CUE_SOUND_OPTIONS: [] };
      if (name.endsWith('/domain/musicLibrary')) return { normalizeDetectedMedia };
      if (name === './constants') return load(folder + 'constants.js');
      if (name === './MusicPickerParts')
        return {
          PrimaryAction: 'PrimaryAction',
          SearchField: 'SearchField',
          MusicRow: 'MusicRow',
          PickerState: 'PickerState',
        };
      if (name === './LegacyBrowserAudioPanel') {
        calls.legacyLoads++;
        return load(folder + 'LegacyBrowserAudioPanel.js');
      }
      if (name === './useMediaWebView') {
        const actual = load(folder + 'useMediaWebView.js').useMediaWebView;
        return {
          useMediaWebView: (options) => {
            calls.webHooks++;
            return actual(options);
          },
        };
      }
      if (name === 'expo-linking') return { openURL: async (url) => calls.opened.push(url) };
      if (name === 'expo-document-picker')
        return {
          getDocumentAsync: async () => {
            calls.documents++;
            return {
              canceled: false,
              assets: [{ name: 'Original.wav', uri: 'file:///cache/original.wav' }],
            };
          },
        };
      if (name === 'expo-image-picker') return {};
      if (name === 'expo-file-system/legacy')
        return {
          makeDirectoryAsync: async (...args) => calls.fs.push(['mkdir', ...args]),
          downloadAsync: async (url, file) => {
            calls.fs.push(['download', url, file]);
            return { status: 200, uri: file };
          },
        };
      if (name.endsWith('/lib/localMedia'))
        return {
          mediaDirectory: () => {
            calls.fs.push(['directory']);
            return 'file:///documents/media/';
          },
          persistLocalMedia: async (uri, name) => {
            calls.persisted.push([uri, name]);
            return 'file:///documents/media/owner-original.wav';
          },
        };
      throw new Error(`Unexpected module ${name}`);
    };
    new Script(compiled).runInNewContext({ exports, require, ...globals });
    cache.set(relative, exports);
    return exports;
  }
  const config = load('services/mediaImport/config.js');
  const Panel = load(folder + 'BrowserAudioPanel.js').default;
  const hook = load(folder + 'useDeviceMediaPicker.js').useDeviceMediaPicker;
  let picker;
  function Harness({ panel = true }) {
    picker = hook({
      onSongSelected: (song) => {
        calls.selected.push(song);
        metadata.set('new-selection', JSON.stringify(song));
      },
    });
    return panel ? React.createElement(Panel, { picker }) : null;
  }
  return {
    calls,
    metadata,
    original,
    config,
    Harness,
    get picker() {
      return picker;
    },
    bookmarks: load(folder + 'constants.js').BOOKMARK_SITES,
  };
}

async function mount(t, h, props) {
  let root;
  await act(async () => {
    root = create(React.createElement(h.Harness, props));
  });
  t.after(async () => act(async () => root.unmount()));
  return root;
}

test('web media import requires exact owner development; release, preview and missing flags fail closed', () => {
  for (const dev of [undefined, false, true, 'true'])
    for (const profile of [undefined, '', 'development', 'preview', 'production', 'unknown'])
      for (const enabled of [undefined, '', false, true, 'false', 'true', 'TRUE'])
        assert.equal(
          webMediaImportAvailable({ dev, profile, enabled }),
          dev === true && profile === 'development' && enabled === 'true',
        );
});

test('actual release panel never loads the legacy WebView, extractor hook, URL field or scanner', async (t) => {
  for (const profile of ['production', 'preview']) {
    const h = fixture({ dev: true, profile, enabled: 'true' });
    const root = await mount(t, h);
    assert.equal(h.config.WEB_MEDIA_IMPORT_AVAILABLE, false);
    assert.equal(h.calls.legacyLoads, 0);
    assert.equal(h.calls.webHooks, 0);
    assert.equal(root.root.findAllByType('WebView').length, 0);
    assert.equal(root.root.findAllByType('SearchField').length, 0);
    assert.equal(root.root.findAllByType('TextInput').length, 0);
    assert.deepEqual(h.calls.scans, []);
    assert.deepEqual(h.calls.injections, []);
    assert.deepEqual(h.calls.opened, []);
    assert.deepEqual(h.calls.fs, []);
    assert.deepEqual(h.calls.selected, []);
    assert.deepEqual(h.metadata, h.original);
  }
});

test('release direct import callbacks cannot read URL metadata, download, emit a song or change records', async (t) => {
  const h = fixture();
  await mount(t, h, { panel: false });
  const unreadable = new Proxy(
    {},
    { get: () => assert.fail('Blocked URL arguments must not be read') },
  );
  await act(async () => {
    assert.equal(await h.picker.downloadFromUrl(unreadable, unreadable), false);
    assert.equal(h.picker.addFromUrl(unreadable, unreadable), false);
    assert.equal(h.picker.handleMediaClick(unreadable), false);
  });
  assert.equal(h.picker.isDownloading, false);
  assert.equal(h.calls.alerts.length, 3);
  for (const args of h.calls.alerts) {
    assert.equal(args.length, 2, 'No hidden Download/Play from URL actions');
    assert.match(args[1], /Choose from Files/);
  }
  assert.deepEqual(h.calls.fs, []);
  assert.deepEqual(h.calls.persisted, []);
  assert.deepEqual(h.calls.selected, []);
  assert.deepEqual(h.metadata, h.original);
});

test('release bookmarks use only the four existing external URLs and Files still imports normally', async (t) => {
  const h = fixture();
  const root = await mount(t, h);
  const links = root.root.findAllByType('Pressable');
  assert.equal(links.length, 4);
  for (const site of h.bookmarks) {
    const link = links.find((node) => node.props.accessibilityLabel === `Open ${site.name}`);
    assert.equal(link.props.accessibilityRole, 'link');
    await act(async () => link.props.onPress());
  }
  assert.deepEqual(
    h.calls.opened,
    Array.from(h.bookmarks, (site) => site.url),
  );
  const files = root.root.findByType('PrimaryAction');
  assert.equal(files.props.label, 'Choose from Files');
  await act(async () => files.props.onPress());
  assert.equal(h.calls.documents, 1);
  assert.deepEqual(h.calls.persisted, [['file:///cache/original.wav', 'Original.wav']]);
  assert.equal(h.calls.selected.length, 1);
  assert.equal(h.calls.selected[0].uri, 'file:///documents/media/owner-original.wav');
  assert.equal(h.calls.selected[0].platform, 'device');
  assert.equal(h.metadata.get('routines'), h.original.get('routines'));
  assert.deepEqual(h.calls.fs, []);
  assert.equal(h.calls.legacyLoads, 0);
});

test('explicit development retains the existing embedded scanner and URL import callbacks', async (t) => {
  const h = fixture({ dev: true, profile: 'development', enabled: 'true' });
  const root = await mount(t, h);
  assert.equal(h.calls.legacyLoads, 1);
  assert.equal(h.calls.webHooks, 1);
  const webview = root.root.findByType('WebView');
  webview.props.ref.current = { injectJavaScript: (script) => h.calls.injections.push(script) };
  await act(async () => webview.props.onLoadEnd());
  assert.equal(h.calls.injections.length, 1);
  assert.equal(h.calls.scans.length, 1);
  await act(async () => {
    h.picker.addFromUrl('https://example.org/owner-original.wav', 'Original.wav');
    await h.picker.downloadFromUrl('https://example.org/owner-original.wav', 'Original.wav');
    h.picker.handleMediaClick({ url: 'https://example.org/owner-original.wav', name: 'Original' });
  });
  assert.equal(h.calls.selected.length, 2);
  assert.equal(h.calls.selected[0].uri, 'https://example.org/owner-original.wav');
  assert.equal(h.calls.fs.filter(([method]) => method === 'download').length, 1);
  assert.equal(h.calls.alerts[0][2].length, 3);
});

test('actual EAS environments leave web media importing off outside owner development', () => {
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  assert.equal(resolveProfile(eas, 'development').env.EXPO_PUBLIC_WEB_MEDIA_IMPORT_ENABLED, 'true');
  for (const profile of ['preview', 'production'])
    assert.equal(resolveProfile(eas, profile).env.EXPO_PUBLIC_WEB_MEDIA_IMPORT_ENABLED, 'false');
});
