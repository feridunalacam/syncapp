import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePlaybackDevice } from '../src/services/spotify/devices.js';

test('uses the active phone without transferring to the first listed computer', async () => {
  const id = await resolvePlaybackDevice([{ id: 'mac' }, { id: 'phone', is_active: true }], () =>
    assert.fail('An active device must not trigger a transfer'),
  );
  assert.equal(id, 'phone');
});

test('a restricted active device does not redirect music to another device', async () => {
  const id = await resolvePlaybackDevice(
    [{ id: 'phone', is_active: true, is_restricted: true }, { id: 'mac' }],
    () => assert.fail('Must not transfer away from restricted active playback'),
  );
  assert.equal(id, null);
});

test('missing or restricted devices cannot be selected', async () => {
  for (const devices of [null, [], [null, { id: null }, { id: 'speaker', is_restricted: true }]]) {
    assert.equal(
      await resolvePlaybackDevice(devices, () => assert.fail('No device to activate')),
      null,
    );
  }
});

test('a failed transfer never falls back to an unactivated device', async () => {
  assert.equal(
    await resolvePlaybackDevice([{ id: 'mac' }], async () => ({ success: false, code: 403 })),
    null,
  );
});

test('only a successful transfer selects an inactive controllable device', async () => {
  const calls = [];
  const id = await resolvePlaybackDevice(
    [{ id: 'restricted', is_restricted: true }, { id: 'phone' }],
    async (deviceId) => {
      calls.push(deviceId);
      return { success: true };
    },
  );
  assert.equal(id, 'phone');
  assert.deepEqual(calls, ['phone']);
});

test('multiple idle devices require a user choice rather than an arbitrary transfer', async () => {
  assert.equal(
    await resolvePlaybackDevice([{ id: 'phone' }, { id: 'surface' }], () =>
      assert.fail('Ambiguous target'),
    ),
    null,
  );
});
