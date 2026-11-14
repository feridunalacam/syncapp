import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { createRequire } from 'node:module';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { getRoutineDuration, getLogDuration, getLogRounds } from '../src/domain/routines.js';
import { formatTime } from '../src/utils/timeFormatters.js';
import { navigateToCreateRoutine } from '../src/navigation/navigationHelpers.js';

const require = createRequire(import.meta.url);
const { transformSync } = require('@babel/core');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = (relative) =>
  readFileSync(new URL(`../src/${relative}`, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/^export default function/gm, 'function')
    .replace(/^export /gm, '');
const textOf = (node) =>
  typeof node === 'string' ? node : (node?.children || []).map(textOf).join('');
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/c1kAAAAASUVORK5CYII=';

function nativeViewShot(captures) {
  // Exercise the installed component, including its props.options-based capture
  // contract. Only the unavailable native bridge/layout are substituted.
  const View = React.forwardRef((props, ref) => {
    React.useLayoutEffect(() => {
      props.onLayout?.({ nativeEvent: { layout: { width: 320, height: 350 } } });
    }, [props.onLayout]);
    return React.createElement('View', { ...props, ref });
  });
  const body = readFileSync(
    new URL('../node_modules/react-native-view-shot/src/index.js', import.meta.url),
    'utf8',
  );
  const compiled = transformSync(body, {
    configFile: false,
    babelrc: false,
    plugins: [
      '@babel/plugin-transform-flow-strip-types',
      '@babel/plugin-transform-react-jsx',
      '@babel/plugin-transform-modules-commonjs',
    ],
  }).code;
  const exports = {};
  new Script(compiled).runInNewContext({
    exports,
    __DEV__: false,
    setTimeout,
    cancelAnimationFrame() {},
    require(name) {
      if (name === 'react') return React;
      if (name === 'react-native')
        return { View, Platform: { OS: 'ios' }, findNodeHandle: () => 1 };
      if (name === './RNViewShot')
        return {
          __esModule: true,
          default: {
            async captureRef(_view, options) {
              captures.push(options);
              return options.result === 'data-uri'
                ? `data:image/png;base64,${PNG_BASE64}`
                : '/tmp/synthetic-capture.png';
            },
            releaseCapture() {},
          },
        };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return exports.default;
}

async function mount(t, screen, count = 5000) {
  let from = 0,
    to = 3;
  const routines = Array.from({ length: count }, (_, index) => ({
    id: `routine-${index}`,
    name: `Routine ${index}`,
    rounds: 1,
    workSec: 10,
    restSec: 0,
  }));
  const completedAt = new Date().toISOString();
  const completed = routines.map((routine, index) => ({
    ...routine,
    sessionId: `session-${index}`,
    completedAt,
    actualDurationSec: 10,
    roundsCompleted: 1,
  }));
  const confirms = [],
    removed = [],
    selected = [],
    navigationCalls = [],
    copied = [],
    shared = [],
    captures = [];
  // Native lists own windowing. This narrow adapter asks the actual screen for
  // a three-row window, exposing accidental eager mapping outside renderItem.
  function FlatList(props) {
    return React.createElement(
      'FlatList',
      props,
      props.ListHeaderComponent,
      props.data
        .slice(from, to)
        .map((item, offset) =>
          React.createElement(
            React.Fragment,
            { key: props.keyExtractor(item, from + offset) },
            props.renderItem({ item, index: from + offset }),
          ),
        ),
    );
  }
  function SectionList(props) {
    let index = 0;
    const visible = [];
    for (const section of props.sections) {
      let header = false;
      for (const item of section.data) {
        if (index >= from && index < to) {
          if (!header) {
            header = true;
            visible.push(
              React.createElement(
                React.Fragment,
                { key: section.title },
                props.renderSectionHeader({ section }),
              ),
            );
          }
          visible.push(
            React.createElement(
              React.Fragment,
              { key: props.keyExtractor(item, index) },
              props.renderItem({ item, index, section }),
            ),
          );
        }
        index++;
      }
    }
    return React.createElement('SectionList', props, props.ListHeaderComponent, ...visible);
  }
  const ViewShot = nativeViewShot(captures);
  const native = Object.fromEntries(
    ['View', 'Text', 'Pressable', 'ScrollView', 'TextInput', 'Image', 'ActivityIndicator'].map(
      (name) => [name, name],
    ),
  );
  const scope = {
    ...React,
    React,
    ...native,
    FlatList,
    SectionList,
    ViewShot,
    Surface: 'Surface',
    IntervalPreview: 'IntervalPreview',
    ScreenWrapper: 'ScreenWrapper',
    ScreenHeader: 'ScreenHeader',
    GlassSurface: 'GlassSurface',
    EmptyState: 'EmptyState',
    SessionShareCard: 'SessionShareCard',
    Ionicons: 'Icon',
    StyleSheet: { create: (styles) => styles },
    Sheet: ({ visible, title, onClose, children }) =>
      visible ? React.createElement('Sheet', { title, onClose }, children) : null,
    useTheme: () => ({ theme: {} }),
    useRoutineContext: () => ({
      routines,
      completedRoutines: completed,
      reorderRoutines: (...args) => removed.push(['reorder', ...args]),
      deleteRoutine: (id) => removed.push(['routine', id]),
      clearCompletedRoutines() {},
      removeCompletedRoutine: (...args) => removed.push(['session', ...args]),
    }),
    useWorkout: () => ({
      selectedRoutine: null,
      isWorkoutRunning: false,
      selectRoutine: (id) => selected.push(id),
    }),
    usePostContext: () => ({ addPost() {} }),
    useConfirm: () => (options) => confirms.push(options),
    Alert: { alert() {} },
    Share: {
      share: async (value) => {
        shared.push(value);
      },
    },
    Clipboard: {
      setImageAsync: async (value) => {
        copied.push(value);
      },
    },
    LayoutAnimation: { configureNext() {}, Presets: { easeInEaseOut: {} } },
    Platform: { OS: 'ios' },
    UIManager: {},
    getRoutineDuration,
    getLogDuration,
    getLogRounds,
    formatTime,
    navigateToCreateRoutine,
  };
  const hook = screen === 'Log' ? source('screens/Log/hooks/useLogData.js') : '';
  const body = source(
    `screens/${screen === 'Log' ? 'Log/LogScreen' : 'Routine/RoutineListScreen'}.js`,
  );
  const code = transformSync(
    `${hook}\n${body}\nglobalThis.Component = ${screen === 'Log' ? 'LogScreen' : 'RoutineListScreen'};`,
    { configFile: false, babelrc: false, plugins: ['@babel/plugin-transform-react-jsx'] },
  ).code;
  new Script(code).runInNewContext(scope);
  const navigation = {
    getState: () => ({ routeNames: ['CreateRoutine'] }),
    navigate: (...args) => navigationCalls.push(args),
  };
  const element = () => React.createElement(scope.Component, { navigation, embedded: true });
  let root;
  await act(async () => {
    root = create(element(), { createNodeMock: () => ({}) });
  });
  t.after(async () => act(async () => root.unmount()));
  return {
    root,
    routines,
    completed,
    confirms,
    removed,
    selected,
    navigationCalls,
    copied,
    shared,
    captures,
    async window(start, end) {
      from = start;
      to = end;
      await act(async () => root.update(element()));
    },
    async press(label) {
      const button = root.root
        .findAllByType('Pressable')
        .find((node) => node.props.accessibilityLabel === label || textOf(node) === label);
      assert.ok(button, label);
      await act(async () => button.props.onPress());
    },
  };
}

test('Training windows a large library and preserves edit, open, reorder and delete targets', async (t) => {
  const h = await mount(t, 'Routine');
  const list = h.root.root.findByType('FlatList');
  assert.equal(list.props.data.length, 5000);
  assert.equal(h.root.root.findAllByType('Surface').length, 3);
  assert.equal(
    list.props.keyExtractor(h.routines[0], 0),
    list.props.keyExtractor(h.routines[0], 4999),
  );
  await h.press('Edit Routine 0');
  assert.equal(h.navigationCalls[0][0], 'CreateRoutine');
  assert.equal(h.navigationCalls[0][1].templateRoutine.id, 'routine-0');
  await h.press('Open Routine 0 in Timer');
  assert.deepEqual(h.selected, ['routine-0']);
  assert.equal(h.navigationCalls[1][0], 'Home');
  await h.press('Organize');
  await h.press('Move Routine 0 down');
  assert.deepEqual(h.removed[0], ['reorder', 0, 1]);
  await h.window(4997, 5000);
  assert.equal(h.root.root.findAllByType('Surface').length, 3);
  await h.press('Delete Routine 4999');
  assert.equal(h.removed.length, 1, 'Delete must wait for confirmation');
  await act(async () => h.confirms[0].onConfirm());
  assert.deepEqual(h.removed[1], ['routine', 'routine-4999']);
});

test('empty Training keeps its create action without mounting a list', async (t) => {
  const h = await mount(t, 'Routine', 0);
  assert.equal(h.root.root.findAllByType('FlatList').length, 0);
  const empty = h.root.root.findByType('EmptyState');
  assert.equal(empty.props.actionLabel, 'Create routine');
  await act(async () => empty.props.onAction());
  assert.equal(h.navigationCalls[0][0], 'CreateRoutine');
});

test('Activity windows imported history while preserving statistics, sharing and exact delete identity', async (t) => {
  const h = await mount(t, 'Log');
  const list = h.root.root.findByType('SectionList');
  assert.equal(
    list.props.sections.reduce((count, section) => count + section.data.length, 0),
    5000,
  );
  assert.equal(list.props.stickySectionHeadersEnabled, false);
  assert.equal(h.root.root.findAllByType('Surface').length, 3);
  assert.match(textOf(h.root.toJSON()), /5000/);
  assert.equal(
    list.props.keyExtractor(h.completed[0], 0),
    list.props.keyExtractor(h.completed[0], 4999),
  );
  await h.press('View Routine 0 session');
  await h.press('Create share image');
  assert.equal(
    h.root.root.findByType('Image').props.source.uri,
    `data:image/png;base64,${PNG_BASE64}`,
  );
  assert.equal(h.captures.length, 2);
  for (const options of h.captures) {
    assert.equal(options.format, 'png');
    assert.equal(options.result, 'data-uri');
    assert.equal(options.quality, 1);
  }
  await h.press('Copy image');
  assert.deepEqual(h.copied, [PNG_BASE64]);
  await h.press('Share session text');
  assert.equal(h.shared[0].title, 'Workout: Routine 0');
  await h.press('Edit session history');
  await h.window(4997, 5000);
  assert.equal(h.root.root.findAllByType('Surface').length, 3);
  await h.press('Delete Routine 4999 session');
  assert.equal(h.removed.length, 0);
  await act(async () => h.confirms[0].onConfirm());
  assert.equal(
    h.removed[0].join(','),
    `session,routine-4999,${h.completed[4999].completedAt},session-4999`,
  );
});
