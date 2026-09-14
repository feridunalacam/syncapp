import test from 'node:test';
import assert from 'node:assert/strict';
import { runVerifiedCommand } from '../src/services/spotify/commands.js';
import { canControlVolume } from '../src/services/spotify/devices.js';

const state = {
  device: { id: 'selected', is_restricted: false },
  is_playing: true,
  item: { uri: 'track' },
};
const options = {
  deviceId: 'selected',
  send: async () => ({ success: true }),
  read: async () => state,
  matches: (p) => p.is_playing,
  wait: async () => {},
};

test('command confirmation works identically across reported device types', async () => {
  for (const type of ['Computer', 'Smartphone', 'Tablet', 'Speaker', 'Unknown']) {
    const result = await runVerifiedCommand({
      ...options,
      read: async () => ({ ...state, device: { ...state.device, type } }),
    });
    assert.equal(result.confirmed, true, type);
  }
});
test('acknowledgement alone cannot confirm resume', async () => {
  const r = await runVerifiedCommand({
    ...options,
    read: async () => ({ ...state, is_playing: false }),
  });
  assert.equal(r.code, 'PLAYBACK_UNCONFIRMED');
});
test('pause confirmation requires a stopped player', async () => {
  const r = await runVerifiedCommand({
    ...options,
    read: async () => ({ ...state, is_playing: false }),
    matches: (p) => p.is_playing === false,
  });
  assert.equal(r.confirmed, true);
});
test('changed devices are reported rather than accepted as success', async () => {
  const r = await runVerifiedCommand({
    ...options,
    read: async () => ({ ...state, device: { id: 'other' } }),
  });
  assert.equal(r.code, 'DEVICE_CHANGED');
});
test('restricted devices and authorization failures are not retried as success', async () => {
  assert.equal(
    (
      await runVerifiedCommand({
        ...options,
        read: async () => ({ ...state, device: { id: 'selected', is_restricted: true } }),
      })
    ).code,
    'DEVICE_RESTRICTED',
  );
  assert.equal(
    (
      await runVerifiedCommand({
        ...options,
        send: async () => ({ success: false, code: 401 }),
        read: () => assert.fail('No polling after rejected command'),
      })
    ).code,
    401,
  );
});
test('cancelling a command prevents late successful UI state', async () => {
  let cancelled = false;
  const r = await runVerifiedCommand({
    ...options,
    isCancelled: () => cancelled,
    wait: async () => {
      cancelled = true;
    },
  });
  assert.equal(r.cancelled, true);
  assert.notEqual(r.confirmed, true);
});
test('volume support comes from capabilities rather than OS assumptions', () => {
  assert.equal(canControlVolume({ id: 'ios', type: 'Smartphone', supports_volume: false }), false);
  assert.equal(
    canControlVolume({ id: 'windows', type: 'Computer', supports_volume: false }),
    false,
  );
  assert.equal(canControlVolume({ id: 'tablet', type: 'Tablet', supports_volume: true }), true);
  assert.equal(
    canControlVolume({ id: 'restricted', supports_volume: true, is_restricted: true }),
    false,
  );
});

test('an external transfer before pause targets the new device without touching the old one', async () => {
  const targets = [];
  let reads = 0;
  const r = await runVerifiedCommand({
    ...options,
    followDeviceChanges: true,
    read: async () => ({ ...state, device: { id: 'iphone' }, is_playing: ++reads === 1 }),
    send: async (target) => {
      targets.push(target);
      return { success: true };
    },
    matches: (p) => p.is_playing === false,
  });
  assert.equal(r.confirmed, true);
  assert.deepEqual(targets, ['iphone']);
});

test('a transfer during a command follows the new device once', async () => {
  const targets = [];
  let reads = 0;
  const r = await runVerifiedCommand({
    ...options,
    followDeviceChanges: true,
    read: async () => ({
      ...state,
      device: { id: ++reads === 1 ? 'selected' : 'tablet' },
      is_playing: reads < 3,
    }),
    send: async (target) => {
      targets.push(target);
      return { success: true };
    },
    matches: (p) => !p.is_playing,
  });
  assert.equal(r.confirmed, true);
  assert.deepEqual(targets, ['selected', 'tablet']);
});

test('already paused playback does not receive a redundant pause', async () => {
  const r = await runVerifiedCommand({
    ...options,
    followDeviceChanges: true,
    skipIfAlreadyApplied: true,
    read: async () => ({ ...state, is_playing: false }),
    matches: (p) => !p.is_playing,
    send: () => assert.fail('Already paused'),
  });
  assert.equal(r.confirmed, true);
});

test('explicit device selection waits while Spotify still reports the old device', async () => {
  let reads = 0;
  const r = await runVerifiedCommand({
    ...options,
    waitForTarget: true,
    read: async () => ({ ...state, device: { id: ++reads < 3 ? 'old' : 'selected' } }),
  });
  assert.equal(r.confirmed, true);
  assert.equal(reads, 3);
});

test('device disappearing after preflight retries the new device once, not the old one', async () => {
  let reads = 0;
  const targets = [];
  const result = await runVerifiedCommand({
    deviceId: 'old',
    followDeviceChanges: true,
    wait: async () => {},
    read: async () => ({
      device: { id: ++reads === 1 ? 'old' : 'new' },
      is_playing: targets.length < 2,
    }),
    send: async (id) => {
      targets.push(id);
      return targets.length === 1 ? { success: false, code: 404 } : { success: true };
    },
    matches: (state) => state.is_playing === false,
  });
  assert.equal(result.confirmed, true);
  assert.deepEqual(targets, ['old', 'new']);
});
