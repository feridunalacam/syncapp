import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import {
  buildTimeline,
  getRoutineDuration,
  normalizeRoutine,
  validateRoutine,
} from '../src/domain/routines.js';
import { normalizeAlertConfig } from '../src/domain/alerts.js';
import { sessionToLog } from '../src/domain/workout.js';
import { formatTime } from '../src/utils/timeFormatters.js';
import { createRoutineSelectionController } from '../src/navigation/routineSelection.js';
import { navigateToCreateRoutine } from '../src/navigation/navigationHelpers.js';
import { lightTheme } from '../src/themes/lightTheme.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const textOf = (node) => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  return (node?.children || []).map(textOf).join('');
};
function load(relative, exported, scope) {
  const source = readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/^export default /gm, '')
    .replace(/^export /gm, '');
  const code = transformSync(`(function () { ${source}\nreturn ${exported}; })()`, {
    configFile: false,
    babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx'],
  }).code;
  return new Script(code).runInNewContext(scope);
}
const paths = {
  Training: 'screens/Training/TrainingScreen.js',
  Home: 'screens/Home/HomeScreen.js',
  CreateRoutine: 'screens/Routine/CreateRoutineScreen.js',
};
const appleTrack = {
  id: 'manual-song',
  name: 'Manual Song',
  artists: [{ name: 'Manual Artist' }],
  album: { images: [{ url: 'https://example.test/manual-cover.jpg' }] },
};

async function mount(
  t,
  screen,
  { connection = {}, player: playerOverrides = {}, platform = 'ios' } = {},
) {
  const events = [];
  const scene = {};
  const action =
    (name) =>
    async (...args) => {
      events.push({ name, args });
      return { success: true };
    };
  const routine = normalizeRoutine({
    id: 'existing-routine',
    name: 'Existing routine',
    rounds: 1,
    workSec: 30,
    restSec: 10,
    roundsData: [
      { workSong: { name: 'Saved local music', uri: 'file:///saved.mp3', platform: 'device' } },
    ],
  });
  const workout = {
    selectedRoutine: routine,
    isWorkoutRunning: true,
    isPaused: false,
    currentPhase: 'work',
    currentRound: 1,
    timeRemaining: 27,
    phaseProgress: 10,
    session: { status: 'running', index: 0 },
    track: null,
    musicProgress: 0,
    isMusicPlaying: false,
    ...Object.fromEntries(
      [
        'selectRoutine',
        'toggle',
        'stop',
        'skipForward',
        'skipBackward',
        'toggleShuffle',
        'skipPrevious',
        'skipNext',
        'toggleRepeat',
      ].map((name) => [name, action(`timer.${name}`)]),
    ),
  };
  const player = {
    ownsQueue: false,
    reserved: false,
    busy: false,
    previousOwnerPending: false,
    playing: false,
    track: null,
    open: action('apple.open'),
    close: action('apple.close'),
    playTrack: action('apple.playTrack'),
    playPlaylist: action('apple.playPlaylist'),
    pause: action('apple.pause'),
    resume: action('apple.resume'),
    clear: action('apple.clear'),
    isActive: () =>
      !!(player.ownsQueue || player.reserved || player.busy || player.previousOwnerPending),
    ...playerOverrides,
  };
  const apple = {
    available: true,
    companionAvailable: true,
    timedAvailable: false,
    connected: false,
    ready: true,
    connecting: false,
    connect: action('apple.connect'),
    disconnect: action('apple.disconnect'),
    search: action('apple.search'),
    getPlaylists: action('apple.library'),
    getPlaylistTracks: action('apple.tracks'),
    ...connection,
    player,
  };
  const transition = {
    duration() {
      return this;
    },
    reduceMotion() {
      return this;
    },
  };
  const preview = {
    previewCue: action('cue.preview'),
    stopPreview: action('cue.stopPreview'),
    previewing: null,
  };
  const scope = {
    ...React,
    React,
    ...Object.fromEntries(
      [
        'View',
        'Text',
        'TextInput',
        'Pressable',
        'TouchableOpacity',
        'ScrollView',
        'ActivityIndicator',
        'FlatList',
      ].map((name) => [name, name]),
    ),
    StyleSheet: { create: (styles) => styles, hairlineWidth: 1 },
    Platform: { OS: platform },
    Ionicons: 'Icon',
    Surface: 'Surface',
    GlassSurface: 'GlassSurface',
    ScreenWrapper: 'ScreenWrapper',
    MusicArtwork: 'MusicArtwork',
    TimerDesign: 'TimerDesign',
    MusicPlayerPreview: 'MusicPlayerPreview',
    SpotifyDevicePicker: 'SpotifyDevicePicker',
    FormFieldError: 'FormFieldError',
    RoundEditor: 'RoundEditor',
    RoundConfiguration: 'RoundConfiguration',
    PlaylistCard: 'PlaylistCard',
    AdvancedSettings: 'AdvancedSettings',
    MusicSearchModal: 'MusicSearchModal',
    LogScreen: 'LogScreen',
    RoutineListScreen: (props) =>
      React.createElement('RoutineListScreen', props, 'Saved routine list'),
    Sheet: ({ visible, children }) =>
      visible ? React.createElement('Sheet', null, children) : null,
    Animated: { View: 'AnimatedView' },
    FadeInDown: transition,
    FadeOutUp: transition,
    LinearTransition: transition,
    ReduceMotion: { System: 'system' },
    useTheme: () => ({ theme: lightTheme }),
    useAppleMusicConnection: () => apple,
    useWorkout: () => workout,
    useRoutineContext: () => ({
      routines: [routine],
      addRoutine: action('routine.add'),
      updateRoutine: action('routine.update'),
    }),
    useSpotifyConnection: () => ({ available: false }),
    useAlertPreview: () => preview,
    useSessionAds: () => ({
      busy: false,
      adSupported: false,
      startOrToggle: action('timer.startOrToggle'),
      finish: action('timer.finish'),
      recordRoutineSelection: action('timer.recordSelection'),
    }),
    useAuth: () => {
      throw new Error('Workout music must not request a Sync account.');
    },
    useSubscription: () => {
      throw new Error('Workout music must not request Sync Pro.');
    },
    Alert: { alert: (...args) => events.push({ name: 'alert', args }) },
    normalizeRoutine,
    validateRoutine,
    normalizeAlertConfig,
    getRoutineDuration,
    buildTimeline,
    sessionToLog,
    formatTime,
    createRoutineSelectionController,
    navigateToCreateRoutine,
  };
  scope.AppleMusicMiniPlayer = load(
    'components/common/AppleMusicPlayerPanel.js',
    'AppleMusicMiniPlayer',
    scope,
  );
  scope.AppleMusicWorkoutControl = load(
    'components/common/AppleMusicWorkoutControl.js',
    'AppleMusicWorkoutControl',
    scope,
  );
  const formHook = load('screens/Routine/hooks/useRoutineForm.js', 'useRoutineForm', scope);
  scope.useRoutineForm = (options) => {
    const form = formHook(options);
    scene.form = form;
    const observed = { ...form };
    for (const name of ['attachSongToRound', 'attachPlaylistToRound', 'handleSaveRoutine']) {
      observed[name] = (...args) => {
        events.push({ name: `form.${name}`, args });
        return form[name](...args);
      };
    }
    return observed;
  };
  const Component =
    screen === 'Control'
      ? scope.AppleMusicWorkoutControl
      : load(paths[screen], `${screen}Screen`, scope);
  const navigation = Object.fromEntries(
    ['navigate', 'goBack', 'setParams'].map((name) => [name, action(`navigation.${name}`)]),
  );
  const element = () =>
    React.createElement(Component, {
      navigation,
      route: { params: screen === 'CreateRoutine' ? { templateRoutine: routine } : {} },
    });
  let root;
  await act(async () => {
    root = create(element());
  });
  t.after(async () => act(async () => root.unmount()));
  return {
    root,
    events,
    scene,
    workout,
    routine,
    apple,
    player,
    Control: scope.AppleMusicWorkoutControl,
    text: () => textOf(root.toJSON()),
    nodes: (type) => root.root.findAllByType(type),
    button: (label) =>
      root.root.findAllByType('Pressable').find((node) => node.props.accessibilityLabel === label),
    async press(label) {
      await act(async () => {
        const button = this.button(label);
        assert.ok(button, label);
        if (!button.props.disabled) await button.props.onPress?.();
      });
    },
    async fillName(value) {
      await act(async () =>
        root.root.findByProps({ accessibilityLabel: 'Routine name' }).props.onChangeText(value),
      );
    },
    async update(values = {}, playerValues = {}) {
      Object.assign(apple, values);
      Object.assign(player, playerValues);
      await act(async () => root.update(element()));
    },
    formState: () => JSON.stringify(scene.form),
  };
}

for (const screen of Object.keys(paths)) {
  test(`${screen} opens the companion player without starting music, changing the timer or saving routine audio`, async (t) => {
    const ui = await mount(t, screen, {
      connection: {
        companionAvailable: true,
        timedAvailable: false,
        connected: false,
        ready: false,
      },
    });
    assert.deepEqual(ui.events, [], 'the entry has no mount-time work');
    assert.match(ui.text(), /Choose songs and playlists/);
    assert.match(ui.text(), /Plays independently of the timer/);
    assert.equal(ui.button('Choose Apple Music songs and playlists').props.disabled, false);
    if (screen === 'CreateRoutine') await ui.fillName('Unsaved routine edit');
    const formBefore = ui.formState();
    const routineBefore = JSON.stringify(ui.routine);
    const workoutBefore = JSON.stringify(ui.workout);
    await ui.press('Choose Apple Music songs and playlists');
    assert.deepEqual(
      ui.events.map((event) => event.name),
      ['apple.open'],
    );
    assert.equal(JSON.stringify(ui.workout), workoutBefore);
    assert.equal(JSON.stringify(ui.routine), routineBefore);
    assert.equal(ui.formState(), formBefore);
    assert.equal(ui.nodes('Modal').length, 0);
    assert.equal(
      ui.nodes('FlatList').length,
      0,
      'screens reuse the global player rather than mount another one',
    );
    if (screen === 'Training') {
      assert.ok(
        ui.text().indexOf('Choose songs and playlists') < ui.text().indexOf('Saved routine list'),
      );
      assert.equal(ui.nodes('RoutineListScreen')[0].props.embedded, true);
    }
    if (screen === 'CreateRoutine') {
      assert.equal(
        ui.nodes('PlaylistCard').length,
        0,
        'companion access does not restore timed Apple playlist assignment',
      );
      assert.equal(ui.nodes('RoundEditor')[0].props.workSong.uri, 'file:///saved.mp3');
      assert.ok(ui.nodes('MusicSearchModal').every((node) => node.props.visible === false));
      const soundPicker = ui
        .nodes('MusicSearchModal')
        .find((node) => node.props.isForCountdownSound);
      assert.ok(soundPicker, 'the separate countdown picker is preserved');
    }
  });

  test(`${screen} reuses the existing paused mini-player with controls separate from the running timer`, async (t) => {
    const ui = await mount(t, screen, {
      connection: { connected: true },
      player: { ownsQueue: true, playing: false, track: appleTrack },
    });
    assert.deepEqual(ui.events, []);
    assert.equal(ui.button('Choose Apple Music songs and playlists'), undefined);
    assert.match(ui.text(), /Manual SongManual Artist/);
    assert.equal(ui.nodes('MusicArtwork').length, 1, 'the existing mini-player is used once');
    assert.equal(
      ui.nodes('MusicArtwork')[0].props.item.album.images[0].url,
      appleTrack.album.images[0].url,
    );
    const workoutBefore = JSON.stringify(ui.workout);
    const formBefore = ui.formState();
    await ui.press('Resume Apple Music');
    await ui.update({}, { playing: true });
    await ui.press('Pause Apple Music');
    await ui.press('Open Apple Music player');
    assert.deepEqual(
      ui.events.map((event) => event.name),
      ['apple.resume', 'apple.pause', 'apple.open'],
    );
    assert.equal(JSON.stringify(ui.workout), workoutBefore);
    assert.equal(ui.formState(), formBefore);
  });
}

test('busy and previous-owner recovery states reuse the existing mini-player without extra playback work', async (t) => {
  const ui = await mount(t, 'Control', { player: { reserved: true, busy: true } });
  assert.match(ui.text(), /Preparing music/);
  assert.equal(ui.button('Choose Apple Music songs and playlists'), undefined);
  assert.equal(ui.button('Resume Apple Music'), undefined);
  assert.deepEqual(ui.events, []);
  await ui.press('Open Apple Music player');
  await ui.update({}, { reserved: false, busy: false, previousOwnerPending: true });
  assert.match(ui.text(), /previous Apple Music queue/);
  assert.ok(ui.button('Stop and clear'));
  assert.deepEqual(
    ui.events.map((event) => event.name),
    ['apple.open'],
  );
});

test('Android and companion-disabled screens add no entry or blank spacing and preserve legacy timed assignment', async (t) => {
  for (const screen of Object.keys(paths)) {
    for (const timedAvailable of [false, true]) {
      const ui = await mount(t, screen, {
        platform: timedAvailable ? 'ios' : 'android',
        connection: { companionAvailable: false, timedAvailable },
      });
      assert.equal(ui.button('Choose Apple Music songs and playlists'), undefined);
      assert.equal(ui.button('Open Apple Music player'), undefined);
      const control = ui.root.root.findByType(ui.Control);
      assert.equal(control.children.length, 0, 'disabled controls add no layout wrapper');
      assert.deepEqual(ui.events, []);
      if (screen === 'CreateRoutine') {
        const cards = ui.nodes('PlaylistCard');
        assert.equal(cards.length, timedAvailable ? 1 : 0);
        if (timedAvailable) assert.equal(cards[0].props.platformId, 'appleMusic');
      }
    }
  }
});

test('an unavailable player opener is visibly disabled and never triggers fallback playback or connection', async (t) => {
  const ui = await mount(t, 'Control', { player: { open: undefined } });
  assert.equal(ui.button('Choose Apple Music songs and playlists').props.disabled, true);
  await ui.press('Choose Apple Music songs and playlists');
  assert.deepEqual(ui.events, []);
});
