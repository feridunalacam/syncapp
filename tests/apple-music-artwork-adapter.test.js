import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppleMusicService } from '../src/services/appleMusic/adapter.js';

test('older native clients and unsupported clients quietly keep library browsing usable', async () => {
  const old = createAppleMusicService({ supported: true });
  assert.deepEqual(await old.getPlaylistArtwork(null, ['p.one']), []);
  let lookups = 0;
  const native = { supported: false };
  Object.defineProperty(native, 'getPlaylistArtwork', {
    get() {
      lookups++;
      throw new Error('No bridge');
    },
  });
  assert.deepEqual(await createAppleMusicService(native).getPlaylistArtwork(null, ['p.one']), []);
  assert.equal(lookups, 0);
});

test('artwork crosses the optional bridge with one capped exact-ID array and no credentials', async () => {
  const calls = [];
  const service = createAppleMusicService({
    supported: true,
    async getPlaylistArtwork(...args) {
      calls.push(args);
      return [];
    },
  });
  const ids = Array.from({ length: 12 }, (_, index) => `p.${index}`);
  await service.getPlaylistArtwork('synthetic-capability', ['pl.catalog', 'p.0', ...ids, null]);
  assert.deepEqual(calls, [[ids.slice(0, 8)]]);
  await service.getPlaylistArtwork(null, ['pl.catalog', 'p.bad/route']);
  await service.getPlaylistArtwork(null, null);
  assert.equal(calls.length, 1);
});

test('artwork remains image-only decoration matched by exact library ID', async () => {
  const service = createAppleMusicService({
    supported: true,
    getPlaylistArtwork: async () => [
      {
        id: 'p.two',
        image: 'https://example.test/two.jpg',
        artworkSource: 'catalog',
        name: 'Not copied',
      },
      { id: 'p.unrequested', image: 'https://example.test/other.jpg' },
      { id: 'p.one', image: 'https://example.test/one.jpg', artworkSource: 'library' },
      { id: 'p.one', image: 'https://example.test/duplicate.jpg' },
      { id: 'p.bad', image: 'file:///private/artwork.jpg' },
      { id: 'p.credentials', image: 'https://user:secret@example.test/image.jpg' },
    ],
  });
  assert.deepEqual(
    await service.getPlaylistArtwork(null, ['p.one', 'p.two', 'p.bad', 'p.credentials']),
    [
      { id: 'p.one', image: 'https://example.test/one.jpg', artworkSource: 'library' },
      { id: 'p.two', image: 'https://example.test/two.jpg', artworkSource: 'catalog' },
    ],
  );
});

test('optional artwork failures and malformed replies do not become playback or connection errors', async () => {
  const failing = createAppleMusicService({
    supported: true,
    getPlaylistArtwork: async () => {
      throw new Error('Offline');
    },
  });
  const malformed = createAppleMusicService({
    supported: true,
    getPlaylistArtwork: async () => ({ data: [] }),
  });
  assert.deepEqual(await failing.getPlaylistArtwork(null, ['p.one']), []);
  assert.deepEqual(await malformed.getPlaylistArtwork(null, ['p.one']), []);
});
