import test from 'node:test';
import assert from 'node:assert/strict';
import { createCueController } from '../src/services/alerts/controller.js';

const settle = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

function createClock() {
  let current = 0;
  let index = 0;
  const jobs = new Map();
  return {
    jobs,
    now: () => current,
    schedule: (callback, delay) => {
      const id = ++index;
      jobs.set(id, { callback, at: current + delay });
      return id;
    },
    cancel: (id) => jobs.delete(id),
    async advance(to, late = false) {
      if (late) current = to;
      while (true) {
        const next = [...jobs]
          .filter(([, job]) => job.at <= to)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, job] = next;
        jobs.delete(id);
        if (!late) current = job.at;
        // A pending native load must not block the next timer in the fake clock.
        job.callback();
        await settle();
      }
      current = to;
      await settle();
    },
  };
}

const cue = (name, atMs = 0) => ({
  atMs,
  sound: { uri: `speech://${name}` },
  volume: 80,
  language: 'en-US',
});
const countdown = () => [
  cue('count/3'),
  cue('count/2', 1000),
  cue('count/1', 2000),
  cue('go', 3000),
];

function setup(implementation) {
  const time = createClock();
  const heard = [];
  const stopped = [];
  const output = {
    async stop() {
      stopped.push(time.now());
    },
    async play(event, cancelled) {
      if (implementation) return implementation(event, cancelled, { time, heard });
      if (cancelled()) return { cancelled: true };
      heard.push({ uri: event.sound.uri, at: time.now() });
      return { completed: true };
    },
  };
  return { time, heard, stopped, output, controller: createCueController({ output, ...time }) };
}

test('preview follows its schedule and completes after the final cue', async () => {
  const { controller, time, heard } = setup();
  const done = controller.preview(countdown());
  await settle();
  await time.advance(3000);
  assert.deepEqual(heard, [
    { uri: 'speech://count/3', at: 0 },
    { uri: 'speech://count/2', at: 1000 },
    { uri: 'speech://count/1', at: 2000 },
    { uri: 'speech://go', at: 3000 },
  ]);
  assert.deepEqual(await done, { completed: true });
  assert.equal(time.jobs.size, 0);
});

test('leaving the preview stops its sound, settles its promise, and removes future cues', async () => {
  const { controller, time, heard, stopped } = setup();
  const done = controller.preview(countdown());
  await settle();
  await time.advance(0);
  await controller.stop('preview');
  assert.deepEqual(await done, { cancelled: true });
  assert.equal(time.jobs.size, 0);
  await time.advance(5000);
  assert.equal(heard.length, 1);
  assert.ok(stopped.length >= 2);
});

test('global stop cancels a scheduled preview before its first timer', async () => {
  const { controller, time, heard } = setup();
  const done = controller.preview(countdown());
  await controller.stop();
  assert.deepEqual(await done, { cancelled: true });
  await time.advance(5000);
  assert.deepEqual(heard, []);
  assert.equal(time.jobs.size, 0);
});

test('replacing a preview cancels the old sequence and preserves only the new one', async () => {
  const { controller, time, heard } = setup();
  const first = controller.preview(countdown());
  await settle();
  await time.advance(0);
  await time.advance(100);
  const replacement = controller.preview([cue('rest')]);
  await settle();
  assert.deepEqual(await first, { cancelled: true });
  await time.advance(100);
  assert.deepEqual(await replacement, { completed: true });
  await time.advance(5000);
  assert.deepEqual(
    heard.map((event) => event.uri),
    ['speech://count/3', 'speech://rest'],
  );
});

test('a workout cue takes authority over preview and preview cleanup cannot stop it', async () => {
  const { controller, time, heard, stopped } = setup();
  const preview = controller.preview(countdown());
  await settle();
  await time.advance(0);
  await controller.play(cue('start'));
  assert.deepEqual(await preview, { cancelled: true });
  const beforeCleanup = stopped.length;
  await controller.stop('preview');
  assert.equal(stopped.length, beforeCleanup);
  await time.advance(5000);
  assert.deepEqual(
    heard.map((event) => event.uri),
    ['speech://count/3', 'speech://start'],
  );
});

test('cancelling a preview during native loading prevents that sound from starting later', async () => {
  const load = deferred();
  const { controller, time, heard } = setup(async (event, cancelled, environment) => {
    await load.promise;
    if (cancelled()) return { cancelled: true };
    environment.heard.push({ uri: event.sound.uri, at: environment.time.now() });
    return { completed: true };
  });
  const preview = controller.preview([cue('go')]);
  await settle();
  await time.advance(0);
  await controller.stop('preview');
  assert.deepEqual(await preview, { cancelled: true });
  load.resolve();
  await settle();
  assert.deepEqual(heard, []);
});

test('a slow final preview load expires even without a later cue to cancel it', async () => {
  const load = deferred();
  const { controller, time, heard } = setup(async (event, cancelled, environment) => {
    await load.promise;
    if (cancelled()) return { cancelled: true };
    environment.heard.push(event.sound.uri);
    return { completed: true };
  });
  const preview = controller.preview([cue('go')]);
  await settle();
  await time.advance(0);
  await time.advance(600);
  load.resolve();
  assert.deepEqual(await preview, { cancelled: true });
  assert.deepEqual(heard, []);
});

test('a new workout cue cancels a slow older cue without queuing a backlog', async () => {
  const oldLoad = deferred();
  const { controller, heard } = setup(async (event, cancelled, environment) => {
    if (event.sound.uri === 'speech://go') await oldLoad.promise;
    if (cancelled()) return { cancelled: true };
    environment.heard.push(event.sound.uri);
    return { completed: true };
  });
  const old = controller.play(cue('go'));
  await settle();
  assert.deepEqual(await controller.play(cue('rest')), { completed: true });
  oldLoad.resolve();
  assert.deepEqual(await old, { cancelled: true });
  assert.deepEqual(heard, ['speech://rest']);
});

test('expired workout cues are skipped before output loading', async () => {
  const { controller, time, heard } = setup();
  await time.advance(1000);
  const result = await controller.play({ ...cue('go'), expiresAt: 800 });
  assert.deepEqual(result, { cancelled: true });
  assert.deepEqual(heard, []);
});

test('backgrounded preview timers do not replay missed numbers', async () => {
  const { controller, time, heard } = setup();
  const preview = controller.preview(countdown());
  await settle();
  await time.advance(5000, true);
  assert.deepEqual(await preview, { cancelled: true });
  assert.deepEqual(heard, []);
  assert.equal(time.jobs.size, 0);
});

test('preview errors release the sequence and a subsequent preview still works', async () => {
  let fail = true;
  const { controller, time, heard } = setup(async (event, cancelled, environment) => {
    if (fail) throw new Error('Cannot load cue');
    if (cancelled()) return { cancelled: true };
    environment.heard.push(event.sound.uri);
    return { completed: true };
  });
  const rejected = assert.rejects(controller.preview(countdown()), /Cannot load cue/);
  await settle();
  await time.advance(0);
  await rejected;
  assert.equal(time.jobs.size, 0);
  fail = false;
  const next = controller.preview([cue('start')]);
  await settle();
  await time.advance(0);
  assert.deepEqual(await next, { completed: true });
  assert.deepEqual(heard, ['speech://start']);
});

test('an error from an obsolete load cannot cancel the newer cue', async () => {
  const oldLoad = deferred();
  const { controller, heard } = setup(async (event, cancelled, environment) => {
    if (event.sound.uri === 'speech://go') await oldLoad.promise;
    if (cancelled()) return { cancelled: true };
    environment.heard.push(event.sound.uri);
    return { completed: true };
  });
  const old = controller.play(cue('go'));
  await settle();
  await controller.play(cue('rest'));
  oldLoad.reject(new Error('Old network request failed'));
  assert.deepEqual(await old, { cancelled: true });
  assert.deepEqual(heard, ['speech://rest']);
});
