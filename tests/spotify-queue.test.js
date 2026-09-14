import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandQueue } from '../src/services/spotify/queue.js';

test('a round cannot start halfway through a device transfer', async () => {
  const queue = createCommandQueue();
  const events = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const transfer = queue(async () => {
    events.push('transfer');
    await gate;
    events.push('confirmed');
  });
  const round = queue(async () => {
    events.push('round');
  });
  await Promise.resolve();
  assert.deepEqual(events, ['transfer']);
  release();
  await Promise.all([transfer, round]);
  assert.deepEqual(events, ['transfer', 'confirmed', 'round']);
});

test('a rejected command does not block later playback controls', async () => {
  const queue = createCommandQueue();
  await assert.rejects(
    queue(async () => {
      throw new Error('offline');
    }),
  );
  assert.equal(await queue(async () => 'resumed'), 'resumed');
});
