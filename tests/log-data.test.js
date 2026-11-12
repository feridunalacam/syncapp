import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { getLogDuration, getLogRounds } from '../src/domain/routines.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const source = readFileSync(
  new URL('../src/screens/Log/hooks/useLogData.js', import.meta.url),
  'utf8',
)
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
  .replace(/^export /gm, '');
const completedAt = '2026-11-12T10:00:00.000Z';
const logs = ['first', 'second'].map((id) => ({
  id: 'same-routine',
  sessionId: id,
  name: id,
  completedAt,
  rounds: 1,
  workSec: 10,
  restSec: 0,
}));
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function mount(t, records = logs) {
  const alerts = [],
    confirmations = [],
    deletions = [],
    timers = [],
    clipboardImages = [];
  let value,
    closed = false;
  const context = {
    ...React,
    getLogDuration,
    getLogRounds,
    useRoutineContext: () => ({
      completedRoutines: records,
      clearCompletedRoutines() {},
      removeCompletedRoutine: (...args) => deletions.push(args),
    }),
    usePostContext: () => ({ addPost() {} }),
    useConfirm: () => (options) => confirmations.push(options),
    Alert: { alert: (...args) => alerts.push(args) },
    Share: { share: async () => {} },
    Clipboard: {
      setImageAsync: async (value) => {
        clipboardImages.push(value);
      },
    },
    Platform: { OS: 'ios' },
    UIManager: {},
    LayoutAnimation: { configureNext() {}, Presets: { easeInEaseOut: {} } },
    setTimeout: (callback) => timers.push(callback),
  };
  new Script(`${source}\nglobalThis.hook = useLogData;`).runInNewContext(context);
  function Consumer() {
    value = context.hook();
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(Consumer));
  });
  const close = async () => {
    if (!closed) {
      closed = true;
      await act(async () => root.unmount());
    }
  };
  t.after(close);
  return {
    get value() {
      return value;
    },
    alerts,
    confirmations,
    deletions,
    timers,
    clipboardImages,
    close,
  };
}

test('a previous session capture cannot publish images over a newer selected session', async (t) => {
  const h = await mount(t);
  await act(async () => h.value.handlers.handleLogPress(logs[0]));
  const full = deferred(),
    transparent = deferred();
  h.value.refs.shareCardRef.current = { capture: () => full.promise };
  h.value.refs.shareCardTransparentRef.current = { capture: () => transparent.promise };
  let oldCapture;
  await act(async () => {
    oldCapture = h.value.handlers.handleShare();
  });
  assert.equal(h.value.state.isGenerating, true);
  await act(async () => h.value.handlers.handleLogPress(logs[1]));
  assert.equal(h.value.state.isGenerating, false);
  await act(async () => {
    full.resolve('data:image/png;base64,old-full');
    transparent.resolve('data:image/png;base64,old-transparent');
    await oldCapture;
  });
  assert.equal(h.value.state.selectedLog.sessionId, 'second');
  assert.equal(h.value.state.showShareModal, false);
  assert.equal(h.value.state.generatedImages.full, null);
  assert.deepEqual(h.alerts, []);
  h.value.refs.shareCardRef.current = { capture: async () => 'data:image/png;base64,new-full' };
  h.value.refs.shareCardTransparentRef.current = {
    capture: async () => 'data:image/png;base64,new-transparent',
  };
  await act(async () => h.value.handlers.handleShare());
  assert.equal(h.value.state.showShareModal, true);
  assert.equal(h.value.state.generatedImages.full, 'data:image/png;base64,new-full');
});

test('leaving Activity cancels a pending capture-ref wait without a late alert', async (t) => {
  const h = await mount(t);
  await act(async () => h.value.handlers.handleLogPress(logs[0]));
  let sharing;
  await act(async () => {
    sharing = h.value.handlers.handleShare();
  });
  assert.equal(h.timers.length, 1);
  await h.close();
  h.timers.shift()();
  await sharing;
  assert.equal(h.timers.length, 0);
  assert.deepEqual(h.alerts, []);
});

test('deleting another same-time session passes its immutable identity without clearing selection', async (t) => {
  const h = await mount(t);
  await act(async () => h.value.handlers.handleLogPress(logs[0]));
  await act(async () => h.value.handlers.handleDeleteLog(logs[0]));
  await act(async () => {
    h.value.handlers.handleLogPress(logs[1]);
    h.confirmations[0].onConfirm();
  });
  assert.equal(h.deletions[0].join(','), `same-routine,${completedAt},first`);
  assert.equal(h.value.state.selectedLog.sessionId, 'second');
});

for (const action of ['delete', 'clear', 'publish']) {
  test(`${action} retires a pending share synchronously before same-turn capture completion`, async (t) => {
    const h = await mount(t);
    await act(async () => h.value.handlers.handleLogPress(logs[0]));
    const full = deferred(),
      transparent = deferred();
    h.value.refs.shareCardRef.current = { capture: () => full.promise };
    h.value.refs.shareCardTransparentRef.current = { capture: () => transparent.promise };
    let sharing;
    await act(async () => {
      sharing = h.value.handlers.handleShare();
    });
    if (action === 'delete') await act(async () => h.value.handlers.handleDeleteLog(logs[0]));
    if (action === 'clear') await act(async () => h.value.handlers.handleClearAll());
    await act(async () => {
      if (action === 'publish') h.value.handlers.confirmPublish();
      else h.confirmations[0].onConfirm();
      full.resolve('data:image/png;base64,retired-full');
      transparent.resolve('data:image/png;base64,retired-transparent');
      await sharing;
    });
    assert.equal(h.value.state.selectedLog, null);
    assert.equal(h.value.state.showShareModal, false);
    assert.equal(h.value.state.generatedImages.full, null);
    assert.equal(h.value.state.isGenerating, false);
    assert.equal(
      h.alerts.some(([title]) => title === 'Error'),
      false,
    );
  });
}

test('capture uses the component options contract and Clipboard receives only bare PNG base64', async (t) => {
  const h = await mount(t);
  const base64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/c1kAAAAASUVORK5CYII=';
  await act(async () => h.value.handlers.handleLogPress(logs[0]));
  const capture = async (...args) => {
    assert.equal(
      args.length,
      0,
      'ViewShot.capture reads props.options and accepts no option argument',
    );
    return `data:image/png;base64,${base64}`;
  };
  h.value.refs.shareCardRef.current = { capture };
  h.value.refs.shareCardTransparentRef.current = { capture };
  await act(async () => h.value.handlers.handleShare());
  await act(async () => h.value.handlers.handleCopyImage('full'));
  await act(async () => h.value.handlers.handleCopyImage('transparent'));
  assert.deepEqual(h.clipboardImages, [base64, base64]);
});

test('an unexpected capture file path never reaches the image Clipboard API', async (t) => {
  const h = await mount(t);
  await act(async () => h.value.handlers.handleLogPress(logs[0]));
  h.value.refs.shareCardRef.current = { capture: async () => '/tmp/synthetic-image.png' };
  h.value.refs.shareCardTransparentRef.current = {
    capture: async () => '/tmp/synthetic-image.png',
  };
  await act(async () => h.value.handlers.handleShare());
  await act(async () => h.value.handlers.handleCopyImage('full'));
  assert.deepEqual(h.clipboardImages, []);
  assert.equal(h.alerts.at(-1)[0], 'Error');
  assert.equal(h.value.state.isCapturing, false);
});

test('positive sub-minute activity totals remain visible without inventing time for an empty log', async (t) => {
  for (const [seconds, expected] of [
    [0, '0m'],
    [1, '<1m'],
    [59, '<1m'],
    [60, '1m'],
    [3601, '1h 0m'],
  ]) {
    const h = await mount(t, seconds ? [{ ...logs[0], actualDurationSec: seconds }] : []);
    assert.equal(h.value.derived.stats.totalTime, expected);
  }
});
