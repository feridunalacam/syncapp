import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAppleMusicService } from '../src/services/appleMusic/adapter.js';

const source = readFileSync(
  new URL('../modules/sync-apple-music/ios/SyncAppleMusicModule.swift', import.meta.url),
  'utf8',
);
const signatures = Object.fromEntries(
  [...source.matchAll(/AsyncFunction\("([^"]+)"\)\s*\{\s*\(([^)]*)\)\s*async/g)].map(
    ([, method, parameters]) => [
      method,
      parameters.trim()
        ? parameters.split(',').map((parameter) => parameter.split(':')[1].trim())
        : [],
    ],
  ),
);

// A JavaScript fake normally ignores surplus arguments. This fake instead
// enforces the exact current Expo bridge closure, including ignored Swift args.
function strictNative() {
  const calls = [];
  const native = { supported: true };
  for (const [method, parameters] of Object.entries(signatures)) {
    native[method] = async (...args) => {
      assert.equal(args.length, parameters.length, `${method}: native argument count`);
      parameters.forEach((type, index) => {
        const value = args[index];
        if (type === 'String') assert.equal(typeof value, 'string', `${method}[${index}]`);
        else if (type === 'Bool') assert.equal(typeof value, 'boolean', `${method}[${index}]`);
        else if (type === '[String]') {
          assert.ok(Array.isArray(value), `${method}[${index}]: array`);
          assert.ok(
            value.every((item) => typeof item === 'string'),
            `${method}[${index}]: strings`,
          );
        } else throw new Error(`Add explicit native contract validation for ${type}`);
      });
      calls.push({ method, args });
      return method === 'getPlaylistArtwork' ? [] : { success: true };
    };
  }
  return { native, calls };
}

test('track, playlist and resume adapter calls match the actual Swift bridge argument counts and types', async () => {
  assert.deepEqual(signatures.playTrack, ['String', 'Bool']);
  assert.deepEqual(signatures.playPlaylist, ['String', 'Bool']);
  assert.deepEqual(signatures.resume, ['String', 'Bool']);
  const h = strictNative();
  const service = createAppleMusicService(h.native);
  await service.playTrack('native:appleMusic', 'apple-music:song:123');
  await service.playPlaylist('native:appleMusic', 'p.playlist', 'appleMusic', true);
  await service.playPlaylist('native:appleMusic', 'p.playlist', 'appleMusic', false);
  await service.play('native:appleMusic', 'appleMusic');
  assert.deepEqual(h.calls, [
    { method: 'playTrack', args: ['123', false] },
    { method: 'playPlaylist', args: ['p.playlist', true] },
    { method: 'playPlaylist', args: ['p.playlist', false] },
    { method: 'resume', args: ['', false] },
  ]);
});

test('optional library artwork uses the exact one-array Swift bridge and preserves library IDs', async () => {
  assert.deepEqual(signatures.getPlaylistArtwork, ['[String]']);
  const h = strictNative();
  const service = createAppleMusicService(h.native);
  assert.deepEqual(await service.getPlaylistArtwork(null, ['p.one', 'p.two']), []);
  assert.deepEqual(h.calls, [{ method: 'getPlaylistArtwork', args: [['p.one', 'p.two']] }]);
  await assert.rejects(h.native.getPlaylistArtwork('p.one'), /array/);
  await assert.rejects(h.native.getPlaylistArtwork(['p.one', 2]), /strings/);
  await assert.rejects(h.native.getPlaylistArtwork(['p.one'], false), /native argument count/);
});

test('the strict native boundary rejects missing, surplus and wrongly typed transport arguments', async () => {
  const h = strictNative();
  for (const method of ['playTrack', 'playPlaylist', 'resume']) {
    await assert.rejects(h.native[method]('123'), /native argument count/);
    await assert.rejects(h.native[method]('123', false, 'surplus'), /native argument count/);
    await assert.rejects(h.native[method]('123', undefined), /boolean/);
    await assert.rejects(h.native[method](123, false), /string/);
  }
  await assert.rejects(h.native.pause('surplus'), /native argument count/);
  assert.deepEqual(h.calls, []);
});

test('cancelled starts never cross the strict native boundary', async () => {
  const h = strictNative();
  const service = createAppleMusicService(h.native);
  const options = { isCancelled: () => true };
  assert.equal(
    (await service.playTrack(null, 'apple-music:song:123', null, options)).cancelled,
    true,
  );
  assert.equal(
    (await service.playPlaylist(null, 'p.playlist', null, true, options)).cancelled,
    true,
  );
  assert.equal((await service.play(null, null, options)).cancelled, true);
  assert.deepEqual(h.calls, []);
});

test('both native queue entry points opt out of Recently Played before playback with an iOS availability guard', () => {
  const controller = readFileSync(
    new URL('../modules/sync-apple-music/ios/AppleMusicController.swift', import.meta.url),
    'utf8',
  );
  for (const method of ['playTrack', 'playPlaylist']) {
    const start = controller.indexOf(`  func ${method}(`);
    assert.ok(start >= 0, `${method}: native entry point exists`);
    const body = controller.slice(start, controller.indexOf('\n  }', start));
    const queue = body.indexOf('player.queue = ApplicationMusicPlayer.Queue(');
    const begin = body.indexOf('return try await begin(ticket)');
    assert.ok(queue >= 0 && begin > queue, `${method}: queue is installed before playback`);
    assert.match(
      body.slice(queue, begin),
      /if #available\(iOS 26\.4, \*\)\s*\{\s*player\.queue\.affectsListeningHistory\s*=\s*false\s*\}/,
      `${method}: Recently Played opt-out is applied before preparing or playing the queue`,
    );
  }
});
