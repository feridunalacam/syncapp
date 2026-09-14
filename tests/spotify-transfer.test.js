import test from 'node:test';
import assert from 'node:assert/strict';
import { transferVerifiedPlayback } from '../src/services/spotify/transfer.js';

const source = {
  device: { id: 'phone' },
  is_playing: true,
  item: { uri: 'spotify:track:one' },
  progress_ms: 1234,
};
const target = { ...source, device: { id: 'desktop' } };
const wait = async () => {};

test('confirmed transfer preserves playing and paused states without restarting a track', async () => {
  for (const playing of [true, false]) {
    let sent = false;
    const result = await transferVerifiedPlayback({
      deviceId: 'desktop',
      wait,
      read: async () => ({ ...(sent ? target : source), is_playing: playing }),
      transfer: async (play) => {
        assert.equal(play, playing);
        sent = true;
        return { success: true };
      },
      restore: () => assert.fail('No recovery for confirmed transfer'),
    });
    assert.equal(result.confirmed, true);
  }
});

test('accepted no-op transfer restores the same song at its current position once', async () => {
  let restores = 0;
  const result = await transferVerifiedPlayback({
    deviceId: 'desktop',
    wait,
    read: async () => (restores ? target : source),
    transfer: async () => ({ success: true }),
    restore: async (uri, position, previous) => {
      assert.equal(uri, source.item.uri);
      assert.equal(position, 1234);
      assert.equal(previous, 'phone');
      restores++;
      return { success: true, confirmed: true };
    },
  });
  assert.equal(restores, 1);
  assert.equal(result.playback.device.id, 'desktop');
});

test('empty transferred player restores the previous song position', async () => {
  let reads = 0;
  const result = await transferVerifiedPlayback({
    deviceId: 'desktop',
    wait,
    read: async () => (++reads === 1 ? source : { ...target, item: null, is_playing: false }),
    transfer: async () => ({ success: true }),
    restore: async (_, position) => {
      assert.equal(position, 1234);
      return { success: true, confirmed: true };
    },
  });
  assert.equal(result.confirmed, true);
});

test('failed, paused, missing, restricted or superseded transfers never restart music', async () => {
  const changed = [
    null,
    { ...source, device: { id: 'third-device' } },
    { ...source, item: { uri: 'spotify:track:new-user-choice' } },
    { ...source, is_playing: false },
    { ...source, device: { id: 'phone', is_restricted: true } },
  ];
  for (const state of changed) {
    let reads = 0;
    const result = await transferVerifiedPlayback({
      deviceId: 'desktop',
      wait,
      read: async () => (++reads === 1 ? source : state),
      transfer: async () => ({ success: true }),
      restore: () => assert.fail('Do not override newer Spotify state'),
    });
    assert.equal(result.success, false);
  }
  for (const accepted of [{ success: true }, { success: false, code: 403 }]) {
    const result = await transferVerifiedPlayback({
      deviceId: 'desktop',
      wait,
      read: async () => ({ ...source, is_playing: false }),
      transfer: async () => accepted,
      restore: () => assert.fail('Do not start paused music'),
    });
    assert.equal(result.success, false);
  }
});
