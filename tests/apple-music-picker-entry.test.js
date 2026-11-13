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
  new URL('../src/screens/Routine/components/MusicSearchModal.js', import.meta.url),
  'utf8',
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
  .replace('export const MusicSearchModal', 'const MusicSearchModal');
const compiled = transformSync(`${source}\nglobalThis.Picker = MusicSearchModal;`, {
  configFile: false,
  babelrc: false,
  plugins: ['@babel/plugin-transform-react-jsx'],
}).code;

async function mount(t, { sound = false, ready = true, companion = true } = {}) {
  const events = [];
  let focused = true;
  let apple = {
    companionAvailable: companion,
    timedAvailable: false,
    available: companion,
    connected: false,
    ready,
    player: { open: () => events.push('open-player') },
  };
  const music = {
    reset: () => events.push('reset-picker'),
    clearSearch: () => events.push('legacy-clear-search'),
    loadPlaylists: () => events.push('legacy-playlists'),
    searchMusic: () => events.push('legacy-search'),
    popularSongs: [],
  };
  const nativeNames = [
    'View',
    'Text',
    'Pressable',
    'ScrollView',
    'KeyboardAvoidingView',
    'Surface',
    'GlassSurface',
    'PickerTabs',
    'PrimaryAction',
    'PickerState',
    'SearchField',
    'MusicRow',
    'Artwork',
    'BrowserAudioPanel',
  ];
  const context = {
    ...React,
    React,
    ...Object.fromEntries(nativeNames.map((name) => [name, name])),
    Modal: (props) =>
      React.createElement('NativeModal', props, props.visible ? props.children : null),
    Platform: { OS: 'ios' },
    StyleSheet: { create: (styles) => styles, absoluteFill: {} },
    Ionicons: 'Icon',
    useTheme: () => ({ theme: {} }),
    useIsFocused: () => focused,
    usePlatformContext: () => ({
      selectedPlatform: 'device',
      connectedPlatforms: { device: { connected: true } },
    }),
    useAppleMusicConnection: () => apple,
    useSpotifyConnection: () => ({ available: false }),
    useMusicSearch: () => music,
    useDeviceMediaPicker: () => ({}),
    DEFAULT_VOICES: [],
    WEB_MEDIA_IMPORT_AVAILABLE: false,
    loadDeviceMusic: () => events.push('device-read'),
    setTimeout,
    clearTimeout,
  };
  new Script(compiled).runInNewContext(context);
  function Harness() {
    const [visible, setVisible] = React.useState(true);
    return React.createElement(context.Picker, {
      visible,
      onClose: () => {
        events.push('close-picker');
        setVisible(false);
      },
      attachSongToRound: () => events.push('attach-song'),
      attachPlaylistToRound: () => events.push('attach-playlist'),
      selectedRoundForSong: 1,
      songType: 'work',
      isForCountdownSound: sound,
    });
  }
  let renderer;
  await act(async () => {
    renderer = create(React.createElement(Harness));
  });
  let unmounted = false;
  const unmount = async () => {
    if (unmounted) return;
    unmounted = true;
    await act(async () => renderer.unmount());
  };
  t.after(unmount);
  return {
    events,
    renderer,
    unmount,
    get apple() {
      return apple;
    },
    async updateApple(value) {
      apple = { ...apple, ...value };
      await act(async () => renderer.update(React.createElement(Harness)));
    },
    async setFocused(value) {
      focused = value;
      await act(async () => renderer.update(React.createElement(Harness)));
    },
    async selectApple() {
      const tabs = renderer.root.findByType('PickerTabs');
      assert.ok(tabs.props.items.some((item) => item.id === 'appleMusic'));
      await act(async () => tabs.props.onChange('appleMusic'));
    },
    openAction() {
      return renderer.root
        .findAllByType('PrimaryAction')
        .find((node) => node.props.label === 'Open Apple Music player');
    },
  };
}

test('release round picker reaches the manual Apple player after native dismissal without attaching audio', async (t) => {
  const h = await mount(t);
  await h.selectApple();
  assert.ok(h.openAction());
  assert.equal(
    h.events.some((event) => event.startsWith('legacy-')),
    false,
  );
  await act(async () => h.openAction().props.onPress());
  const modal = h.renderer.root.findByType('NativeModal');
  assert.equal(modal.props.visible, false);
  assert.equal(h.events.includes('open-player'), false, 'the two native modals never overlap');
  await act(async () => modal.props.onDismiss());
  await act(async () => modal.props.onDismiss());
  assert.equal(h.events.filter((event) => event === 'open-player').length, 1);
  assert.equal(h.events.includes('attach-song') || h.events.includes('attach-playlist'), false);
});

test('closing the Apple tab normally never opens the player', async (t) => {
  const h = await mount(t);
  await h.selectApple();
  await act(async () =>
    h.renderer.root.findByProps({ accessibilityLabel: 'Close music picker' }).props.onPress(),
  );
  await act(async () => h.renderer.root.findByType('NativeModal').props.onDismiss?.());
  assert.equal(h.events.includes('open-player'), false);
});

test('late native dismissal cannot open a retired picker or unavailable companion', async (t) => {
  for (const retire of ['unmount', 'unavailable']) {
    const h = await mount(t);
    await h.selectApple();
    await act(async () => h.openAction().props.onPress());
    const dismiss = h.renderer.root.findByType('NativeModal').props.onDismiss;
    if (retire === 'unmount') await h.unmount();
    else await h.updateApple({ companionAvailable: false });
    await act(async () => dismiss());
    assert.equal(h.events.includes('open-player'), false);
  }
});

test('countdown sound selection and unavailable platforms never offer the companion', async (t) => {
  for (const options of [{ sound: true }, { companion: false }]) {
    const h = await mount(t, options);
    const tabs = h.renderer.root.findByType('PickerTabs');
    assert.equal(
      tabs.props.items.some((item) => item.id === 'appleMusic'),
      false,
    );
  }
});

test('a retained screen loses its pending handoff on blur, even if it refocuses before native dismissal', async (t) => {
  const h = await mount(t);
  await h.selectApple();
  await act(async () => h.openAction().props.onPress());
  const dismiss = h.renderer.root.findByType('NativeModal').props.onDismiss;
  await h.setFocused(false);
  await h.setFocused(true);
  await act(async () => dismiss());
  assert.equal(h.events.includes('open-player'), false);
});

test('an unready player cannot dismiss the picker or start a delayed handoff', async (t) => {
  const h = await mount(t, { ready: false });
  await h.selectApple();
  assert.equal(h.openAction().props.disabled, true);
  await act(async () => h.openAction().props.onPress());
  assert.equal(h.events.includes('close-picker') || h.events.includes('open-player'), false);
});
