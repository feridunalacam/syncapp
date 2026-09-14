import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoRefresh } from '../src/lib/autoRefresh.js';
const settle = () => new Promise(setImmediate);
function clock() {
  const jobs = new Map();
  let id = 0;
  return {
    jobs,
    schedule: (callback, delay) => {
      jobs.set(++id, { callback, delay });
      return id;
    },
    cancel: (key) => jobs.delete(key),
    async tick() {
      const [key, job] = jobs.entries().next().value;
      jobs.delete(key);
      await job.callback();
    },
  };
}
test('refreshes on entry, then after one minute, and stops when hidden', async () => {
  const time = clock();
  let calls = 0;
  const refresh = createAutoRefresh(async () => {
    calls++;
  }, time);
  assert.equal(calls, 0);
  refresh.setActive(true);
  await settle();
  assert.equal(calls, 1);
  assert.equal(time.jobs.size, 1);
  assert.equal([...time.jobs.values()][0].delay, 60000);
  await time.tick();
  assert.equal(calls, 2);
  assert.equal(time.jobs.size, 1);
  refresh.setActive(false);
  assert.equal(time.jobs.size, 0);
  refresh.setActive(true);
  await settle();
  assert.equal(calls, 3);
  refresh.setActive(false);
});
test('rapid background/foreground changes do not overlap requests or duplicate timers', async () => {
  const time = clock();
  let finish;
  let calls = 0;
  const refresh = createAutoRefresh(() => {
    calls++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  }, time);
  refresh.setActive(true);
  refresh.setActive(false);
  refresh.setActive(true);
  refresh.setActive(true);
  assert.equal(calls, 1);
  assert.equal(time.jobs.size, 0);
  finish();
  await settle();
  assert.equal(time.jobs.size, 1);
  refresh.setActive(false);
});
test('request failure retries at the normal cadence, but late completion while hidden never schedules', async () => {
  const time = clock();
  const refresh = createAutoRefresh(async () => {
    throw new Error('offline');
  }, time);
  refresh.setActive(true);
  await settle();
  assert.equal(time.jobs.size, 1);
  refresh.setActive(false);
  assert.equal(time.jobs.size, 0);
  let finish;
  const delayed = createAutoRefresh(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
    time,
  );
  delayed.setActive(true);
  delayed.setActive(false);
  finish();
  await settle();
  assert.equal(time.jobs.size, 0);
});
