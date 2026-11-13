import test from 'node:test';
import assert from 'node:assert/strict';
import { createCueHandoff } from '../src/services/alerts/cueHandoff.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const flush = () => new Promise(setImmediate);
function clock() {
  let time = 0,
    next = 0;
  const jobs = new Map();
  return {
    now: () => time,
    schedule(callback, delay) {
      jobs.set(++next, { callback, at: time + delay });
      return next;
    },
    cancel(id) {
      jobs.delete(id);
    },
    async advance(target) {
      for (;;) {
        const job = [...jobs]
          .filter(([, value]) => value.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!job) break;
        jobs.delete(job[0]);
        time = job[1].at;
        job[1].callback();
        await flush();
      }
      time = target;
      await flush();
    },
  };
}
function harness(options = {}) {
  const time = clock();
  const calls = [];
  const handoff = createCueHandoff({
    ...time,
    stopOutput: async (owner) => {
      calls.push(`stop:${owner}`);
      await options.stop?.(owner);
    },
    needsMusicHandoff: options.needsMusicHandoff || (() => false),
  });
  function source(name, suspend) {
    return handoff.register({
      async suspendForCue(options) {
        calls.push(`pause:${name}`);
        if (suspend) return suspend(options);
        return {
          resume: async () => {
            calls.push(`resume:${name}`);
          },
          release: () => {
            calls.push(`release:${name}`);
          },
        };
      },
    });
  }
  return { handoff, time, calls, source };
}

test('cue output waits for every music pause acknowledgement and native cue drain precedes resume', async () => {
  const firstPause = deferred(),
    secondPause = deferred(),
    cueDone = deferred(),
    drained = deferred();
  let stops = 0;
  const h = harness({ stop: () => (++stops === 2 ? drained.promise : undefined) });
  h.source('device', () => firstPause.promise);
  h.source('apple', () => secondPause.promise);
  const run = h.handoff.run('workout', {}, async () => {
    h.calls.push('cue');
    return cueDone.promise;
  });
  await flush();
  firstPause.resolve({
    resume: async () => h.calls.push('resume:device'),
    release: () => h.calls.push('release:device'),
  });
  await flush();
  assert.equal(h.calls.includes('cue'), false);
  secondPause.resolve({
    resume: async () => h.calls.push('resume:apple'),
    release: () => h.calls.push('release:apple'),
  });
  await flush();
  assert.equal(h.calls.includes('cue'), true);
  cueDone.resolve({ completed: true });
  await flush();
  assert.equal(
    h.calls.some((value) => value.startsWith('resume:')),
    false,
  );
  drained.resolve();
  assert.equal((await run).completed, true);
  await flush();
  assert.ok(h.calls.indexOf('resume:device') > h.calls.indexOf('cue'));
  assert.equal(h.calls.filter((value) => value.startsWith('release:')).length, 2);
});

test('stop acknowledges native output without waiting for music pause and releases a late pause ticket', async () => {
  const paused = deferred();
  const h = harness();
  let isCancelled;
  h.source('music', (options) => {
    isCancelled = options.isCancelled;
    return paused.promise;
  });
  const run = h.handoff.run('workout', {}, () => {
    assert.fail('Cancelled cue must not play');
  });
  await flush();
  await h.handoff.stop('workout');
  assert.equal(isCancelled(), true);
  assert.equal((await run).cancelled, true);
  assert.equal(h.calls.includes('resume:music'), false);
  paused.resolve({
    resume: async () => h.calls.push('resume:music'),
    release: () => h.calls.push('release:music'),
  });
  await flush();
  assert.deepEqual(h.calls.slice(-2), ['resume:music', 'release:music']);
});

test('stopping preview does not cancel the current workout cue or resume its music early', async () => {
  const cueDone = deferred();
  const h = harness();
  h.source('music');
  let cancelled;
  const run = h.handoff.run('workout', {}, (check) => {
    cancelled = check;
    return cueDone.promise;
  });
  await flush();
  await h.handoff.stop('preview');
  assert.equal(cancelled(), false);
  assert.equal(h.calls.includes('resume:music'), false);
  cueDone.resolve({ completed: true });
  await run;
  await flush();
  assert.equal(h.calls.filter((value) => value === 'resume:music').length, 1);
});

test('3 2 1 and gong share one suspended burst with no resume in countdown grace periods', async () => {
  const h = harness();
  h.source('music');
  for (let count = 3; count > 0; count--) {
    const expiresAt = (4 - count) * 1000;
    await h.handoff.run('workout', { kind: 'count', expiresAt }, async () => ({ completed: true }));
    await h.time.advance(expiresAt);
    assert.equal(h.calls.includes('resume:music'), false);
  }
  await h.handoff.run('workout', { kind: 'boundary' }, async () => ({ completed: true }));
  await flush();
  assert.equal(h.calls.filter((value) => value === 'pause:music').length, 1);
  assert.equal(h.calls.filter((value) => value === 'resume:music').length, 1);
  assert.equal(h.calls.filter((value) => value === 'release:music').length, 1);
});

test('an isolated countdown releases only after expiresAt plus the 250ms grace', async () => {
  const h = harness();
  h.source('music');
  await h.handoff.run('workout', { kind: 'count', expiresAt: 1000 }, async () => ({}));
  await h.time.advance(1249);
  assert.equal(h.calls.includes('resume:music'), false);
  await h.time.advance(1250);
  assert.equal(h.calls.includes('resume:music'), true);
});

test('a cue expiring while music pauses is skipped and the acknowledged source is restored', async () => {
  const paused = deferred();
  const h = harness();
  h.source('music', () => paused.promise);
  const run = h.handoff.run('workout', { expiresAt: 10 }, () => assert.fail('Expired cue'));
  await h.time.advance(11);
  paused.resolve({
    resume: async () => h.calls.push('resume'),
    release: () => h.calls.push('release'),
  });
  assert.equal((await run).cancelled, true);
  await flush();
  assert.deepEqual(h.calls.slice(-2), ['resume', 'release']);
});

test('music ownership with no source acknowledgement skips output, while a no-music cue can play', async () => {
  for (const needs of [true, false]) {
    const h = harness({ needsMusicHandoff: () => needs });
    h.source('unrelated', async () => null);
    let outputs = 0;
    const result = await h.handoff.run('workout', {}, async () => {
      outputs++;
      return { completed: true };
    });
    assert.equal(outputs, needs ? 0 : 1);
    assert.equal(needs ? result.cancelled : result.completed, true);
  }
});

test('account unregister cancels stale output and releases its late ticket without resuming old music', async () => {
  const paused = deferred();
  const h = harness();
  const remove = h.source('old', () => paused.promise);
  assert.equal(h.handoff.hasSources(), true);
  const old = h.handoff.run('workout', {}, () => assert.fail('Old account cue'));
  await flush();
  remove();
  assert.equal(h.handoff.hasSources(), false);
  assert.equal((await old).cancelled, true);
  h.source('new');
  const fresh = h.handoff.run('workout', {}, async () => {
    h.calls.push('cue:new');
    return {};
  });
  paused.resolve({
    resume: async () => h.calls.push('resume:old'),
    release: () => h.calls.push('release:old'),
  });
  await fresh;
  await flush();
  assert.equal(h.calls.includes('resume:old'), false);
  assert.equal(h.calls.filter((value) => value === 'release:old').length, 1);
  assert.ok(h.calls.indexOf('cue:new') > h.calls.indexOf('release:old'));
});

test('completed-workout resumeMusic false remains sticky through the burst and still releases tickets', async () => {
  const h = harness();
  h.source('music');
  await h.handoff.run(
    'workout',
    { kind: 'count', expiresAt: 1000, resumeMusic: false },
    async () => ({}),
  );
  await h.handoff.run('workout', {}, async () => ({}));
  await flush();
  assert.equal(h.calls.includes('resume:music'), false);
  assert.equal(h.calls.filter((value) => value === 'release:music').length, 1);
});

for (const failAt of [1, 2]) {
  test(`failed native drain ${failAt} retains tickets until explicit recovery and never resumes`, async () => {
    let stops = 0;
    const h = harness({
      stop: () => {
        if (++stops === failAt) throw new Error('Native silence unconfirmed');
      },
    });
    h.source('music');
    await assert.rejects(
      h.handoff.run('workout', {}, async () => ({})),
      /Native silence unconfirmed/,
    );
    await flush();
    assert.equal(stops, failAt, 'failure does not trigger automatic stop retry');
    assert.equal(h.calls.includes('resume:music'), false);
    assert.equal(h.calls.includes('release:music'), false);
    await h.handoff.stop('workout');
    await flush();
    assert.equal(h.calls.includes('resume:music'), false);
    assert.equal(h.calls.filter((value) => value === 'release:music').length, 1);
  });
}

test('stop never waits for a queued music resume', async () => {
  const resumed = deferred();
  const h = harness();
  h.source('music', async () => ({
    resume: () => {
      h.calls.push('resume');
      return resumed.promise;
    },
    release: () => h.calls.push('release'),
  }));
  await h.handoff.run('workout', {}, async () => ({}));
  await flush();
  assert.equal(h.calls.includes('resume'), true);
  await h.handoff.stop('workout');
  assert.equal(h.calls.includes('release'), false);
  resumed.resolve();
  await flush();
  assert.equal(h.calls.includes('release'), true);
});

test('rapid cues cancel promptly, drain before the new output, and ignore stale output completion', async () => {
  const oldDone = deferred(),
    freshDone = deferred(),
    oldDrain = deferred();
  let stops = 0;
  const h = harness({ stop: () => (++stops === 2 ? oldDrain.promise : undefined) });
  h.source('music');
  const old = h.handoff.run('workout', {}, async () => {
    h.calls.push('cue:old');
    return oldDone.promise;
  });
  await flush();
  const fresh = h.handoff.run('workout', {}, async () => {
    h.calls.push('cue:fresh');
    return freshDone.promise;
  });
  assert.equal((await old).cancelled, true);
  await flush();
  assert.equal(h.calls.includes('cue:fresh'), false);
  oldDrain.resolve();
  await flush();
  assert.equal(h.calls.includes('cue:fresh'), true);
  const stopsBeforeStaleCompletion = stops;
  oldDone.reject(new Error('Retired native callback'));
  await flush();
  assert.equal(stops, stopsBeforeStaleCompletion, 'old callback must not stop the new cue');
  assert.equal(h.calls.includes('resume:music'), false);
  freshDone.resolve({ completed: true });
  await fresh;
  await flush();
  assert.equal(h.calls.filter((value) => value === 'pause:music').length, 1);
  assert.equal(h.calls.filter((value) => value === 'resume:music').length, 1);
});

test('a source pause failure prevents the cue and still retires other acknowledged tickets', async () => {
  const h = harness();
  h.source('paused');
  h.source('failed', async () => {
    throw new Error('Music pause failed');
  });
  await assert.rejects(
    h.handoff.run('workout', {}, () => assert.fail('Unacknowledged music')),
    /Music pause failed/,
  );
  await flush();
  assert.equal(h.calls.includes('resume:paused'), false);
  assert.equal(h.calls.includes('release:paused'), true);
});

test('a newer cue also waits for an older outstanding native stop acknowledgement', async () => {
  const firstStop = deferred();
  let stops = 0;
  const h = harness({ stop: () => (++stops === 1 ? firstStop.promise : undefined) });
  h.source('music');
  const old = h.handoff.run('workout', {}, () => assert.fail('Superseded cue'));
  const fresh = h.handoff.run('workout', {}, async () => {
    h.calls.push('cue:fresh');
    return {};
  });
  assert.equal((await old).cancelled, true);
  await flush();
  assert.equal(h.calls.includes('cue:fresh'), false);
  firstStop.resolve();
  await fresh;
  await flush();
  assert.equal(h.calls.filter((value) => value === 'resume:music').length, 1);
});

test('an older outstanding stop failure prevents the newer cue despite its own successful stop', async () => {
  const firstStop = deferred();
  let stops = 0;
  const h = harness({ stop: () => (++stops === 1 ? firstStop.promise : undefined) });
  h.source('music');
  const old = h.handoff.run('workout', {}, () => assert.fail('Superseded cue'));
  await flush();
  const fresh = h.handoff.run('workout', {}, () => assert.fail('Unconfirmed native silence'));
  const rejected = assert.rejects(fresh, /Old native stop failed/);
  assert.equal((await old).cancelled, true);
  await flush();
  firstStop.reject(new Error('Old native stop failed'));
  await rejected;
  await flush();
  assert.equal(h.calls.includes('release:music'), false);
  await h.handoff.stop('workout');
  await flush();
  assert.equal(h.calls.includes('resume:music'), false);
  assert.equal(h.calls.filter((value) => value === 'release:music').length, 1);
});

test('a changed source user intent prevents actual resume while its local ticket still releases', async () => {
  const cueDone = deferred();
  let intent = 0;
  const h = harness();
  h.source('music', async () => {
    const captured = intent;
    return {
      resume: async () => {
        if (intent === captured) h.calls.push('native-resume');
      },
      release: () => h.calls.push('release'),
    };
  });
  const run = h.handoff.run('workout', {}, () => cueDone.promise);
  await flush();
  intent++; // Manual pause, end, replacement, or an account change.
  cueDone.resolve({});
  await run;
  await flush();
  assert.equal(h.calls.includes('native-resume'), false);
  assert.equal(h.calls.filter((value) => value === 'release').length, 1);
});

test('ticket cleanup still runs once if its conditional resume rejects', async () => {
  const h = harness();
  h.source('music', async () => ({
    resume: async () => {
      throw new Error('Native music unavailable');
    },
    release: () => h.calls.push('release'),
  }));
  await h.handoff.run('workout', {}, async () => ({}));
  await flush();
  assert.equal(h.calls.filter((value) => value === 'release').length, 1);
});

test('a stop and immediate next phase cue retain the same paused music intent', async () => {
  const oldDone = deferred(),
    paused = deferred();
  const h = harness();
  h.source('music', () => paused.promise);
  const old = h.handoff.run('workout', {}, () => oldDone.promise);
  await flush();
  const stopped = h.handoff.stop('workout');
  const next = h.handoff.run('workout', {}, async () => ({}));
  paused.resolve({
    resume: async () => h.calls.push('resume'),
    release: () => h.calls.push('release'),
  });
  await Promise.all([stopped, next]);
  await flush();
  assert.equal((await old).cancelled, true);
  assert.equal(h.calls.filter((value) => value === 'pause:music').length, 1);
  assert.deepEqual(h.calls.slice(-2), ['resume', 'release']);
  oldDone.resolve({});
});

test('a new cue waits for an already-started release without losing remaining source resumes', async () => {
  const resumed = deferred();
  const h = harness();
  h.source('first', async () => ({
    resume: () => resumed.promise,
    release: () => h.calls.push('release:first'),
  }));
  h.source('second');
  await h.handoff.run('workout', {}, async () => ({}));
  await flush();
  let newOutput = false;
  const next = h.handoff.run('workout', {}, async () => {
    newOutput = true;
    return {};
  });
  await flush();
  assert.equal(newOutput, false);
  resumed.resolve();
  await next;
  await flush();
  assert.equal(h.calls.filter((value) => value === 'resume:second').length, 2);
  assert.equal(h.calls.filter((value) => value === 'release:second').length, 2);
});
