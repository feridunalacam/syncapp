import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const source = readFileSync(
  new URL('../src/services/deviceMusicLibrary.js', import.meta.url),
  'utf8',
)
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
test('device audio browsing requests only audio permission and reads every page', async () => {
  const permissions = [];
  const pages = [];
  const context = {
    MediaLibrary: {
      MediaType: { audio: 'audio' },
      SortBy: { modificationTime: 'modificationTime' },
      async requestPermissionsAsync(...args) {
        permissions.push(args);
        return { status: 'granted' };
      },
      async getAssetsAsync(options) {
        pages.push(options);
        return {
          assets: [
            {
              id: pages.length,
              filename: `song${pages.length}.mp3`,
              uri: `file:///song${pages.length}.mp3`,
            },
          ],
          hasNextPage: pages.length === 1,
          endCursor: 'page-two',
        };
      },
    },
  };
  new Script(`${source}\nglobalThis.load = loadDeviceMusic;`).runInNewContext(context);
  const tracks = await context.load();
  assert.equal(permissions[0][0], false);
  assert.equal(permissions[0][1].join(','), 'audio');
  assert.equal(pages[1].after, 'page-two');
  assert.equal(tracks.length, 2);
  assert.equal(tracks[0].platform, 'device');
});
test('denying audio permission leaves Files as the actionable fallback', async () => {
  const context = {
    MediaLibrary: {
      requestPermissionsAsync: async () => ({ status: 'denied' }),
      getAssetsAsync() {
        throw new Error('Must not browse after denial');
      },
    },
  };
  new Script(`${source}\nglobalThis.load = loadDeviceMusic;`).runInNewContext(context);
  await assert.rejects(context.load(), (error) => /Files/.test(error.userMessage));
});
