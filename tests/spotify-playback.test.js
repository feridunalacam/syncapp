import test from 'node:test';
import assert from 'node:assert/strict';
import { startVerifiedTrack } from '../src/services/spotify/playback.js';

const uri = 'spotify:track:chosen';
const empty = {
  device: { id: 'mac', type: 'Computer', is_restricted: false },
  is_playing: false,
  item: null,
};
const playing = { ...empty, is_playing: true, item: { uri } };
function setup(overrides = {}) {
  const bodies = [];
  return {
    bodies,
    options: {
      uri,
      deviceId: 'mac',
      wait: async () => {},
      send: async (body) => {
        bodies.push(body);
        return { success: true };
      },
      read: async () => playing,
      lookup: async () => ({ uri, album: { uri: 'spotify:album:record' } }),
      ...overrides,
    },
  };
}

test('confirmed direct playback does not change context or fetch an album', async () => {
  const h = setup({ lookup: () => assert.fail('No lookup needed') });
  assert.equal((await startVerifiedTrack(h.options)).strategy, 'track');
  assert.equal(h.bodies.length, 1);
});

test('accepted but empty desktop playback recovers with the exact album track', async () => {
  let reads = 0;
  const h = setup({ read: async () => (++reads <= 3 ? empty : playing) });
  assert.equal((await startVerifiedTrack(h.options)).strategy, 'album');
  assert.deepEqual(h.bodies[1], {
    context_uri: 'spotify:album:record',
    offset: { uri },
    position_ms: 0,
  });
});

test('a rejected command is not retried as another context', async () => {
  const h = setup({
    send: async () => ({ success: false, code: 403 }),
    read: () => assert.fail('No poll after rejection'),
  });
  assert.deepEqual(await startVerifiedTrack(h.options), { success: false, code: 403 });
});

test('missing state, a different device or a different song never triggers a fallback', async () => {
  for (const state of [null, { ...playing, item: { uri: 'spotify:track:other' } }]) {
    const h = setup({
      read: async () => state,
      lookup: () => assert.fail('Must not replace different or unknown playback'),
    });
    assert.equal((await startVerifiedTrack(h.options)).success, false);
    assert.equal(h.bodies.length, 1);
  }
});

test('stop during confirmation cancels the fallback', async () => {
  let cancelled = false;
  const h = setup({
    wait: async () => {
      cancelled = true;
    },
    isCancelled: () => cancelled,
    lookup: () => assert.fail('Cancelled'),
  });
  assert.equal((await startVerifiedTrack(h.options)).cancelled, true);
  assert.equal(h.bodies.length, 1);
});

test('known context devices skip the previously failing direct command', async () => {
  const h = setup({ preferContext: true, positionMs: 1200 });
  assert.equal((await startVerifiedTrack(h.options)).strategy, 'album');
  assert.equal(h.bodies.length, 1);
  assert.equal(h.bodies[0].position_ms, 1200);
  assert.equal(h.bodies[0].offset.uri, uri);
});

test('HTTP success after fallback is still not reported as playback without confirmation', async () => {
  const h = setup({ read: async () => empty });
  assert.equal((await startVerifiedTrack(h.options)).success, false);
  assert.equal(h.bodies.length, 2);
});

test('relinked Spotify track counts as the requested song', async () => {
  const h = setup({
    read: async () => ({
      ...playing,
      item: { uri: 'spotify:track:replacement', linked_from: { uri } },
    }),
  });
  assert.equal((await startVerifiedTrack(h.options)).confirmed, true);
});

test('empty-player recovery depends on state, not computer/phone/tablet names', async () => {
  for (const type of ['Computer', 'Smartphone', 'Tablet', 'Unknown']) {
    let reads = 0;
    const h = setup({
      read: async () => (++reads <= 3 ? { ...empty, device: { ...empty.device, type } } : playing),
    });
    assert.equal((await startVerifiedTrack(h.options)).strategy, 'album', type);
  }
});

test('a user device transfer during start yields to Spotify without another play request', async () => {
  const h = setup({
    read: async () => ({ ...empty, device: { id: 'phone', type: 'Smartphone' } }),
    lookup: () => assert.fail('Do not fight a transfer'),
  });
  const result = await startVerifiedTrack(h.options);
  assert.equal(result.externalChange, true);
  assert.equal(result.deviceId, 'phone');
  assert.equal(result.success, true);
  assert.equal(result.confirmed, false);
  assert.equal(h.bodies.length, 1);
});

test('explicit transfer waits for the previous device to settle without treating it as a new choice', async () => {
  let reads = 0;
  const h = setup({
    preferContext: true,
    previousDeviceId: 'phone',
    read: async () => (++reads < 3 ? { ...playing, device: { id: 'phone' } } : playing),
  });
  assert.equal((await startVerifiedTrack(h.options)).confirmed, true);
  assert.equal(h.bodies.length, 1);
});

test('a third device supersedes an explicit transfer without further commands', async () => {
  const h = setup({
    preferContext: true,
    previousDeviceId: 'phone',
    read: async () => ({ ...playing, device: { id: 'tablet' } }),
  });
  const result = await startVerifiedTrack(h.options);
  assert.equal(result.externalChange, true);
  assert.equal(result.deviceId, 'tablet');
  assert.equal(h.bodies.length, 1);
});
