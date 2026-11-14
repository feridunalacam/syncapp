import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import {
  appleMusicAvailable,
  appleMusicCompanionAvailable,
  APPLE_MUSIC_UNAVAILABLE_MESSAGE,
} from '../src/services/appleMusic/config.js';
import { createAppleMusicService } from '../src/services/appleMusic/adapter.js';
import { resolveProfile } from '../scripts/check-release-config.mjs';

const configSource = readFileSync(
  new URL('../src/services/appleMusic/config.js', import.meta.url),
  'utf8',
).replace(/^export /gm, '');
const serviceSource = readFileSync(
  new URL('../src/services/appleMusic/index.js', import.meta.url),
  'utf8',
)
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace('export const appleMusicCompanionService =', 'globalThis.companion =')
  .replace(
    'export default createAppleMusicService',
    'globalThis.service = createAppleMusicService',
  );

function builtService({ dev = false, profile, enabled, companionEnabled, platform = 'ios' } = {}) {
  let lookups = 0;
  const calls = [];
  const native = new Proxy(
    { supported: true },
    {
      get: (target, key) =>
        key === 'supported'
          ? target.supported
          : async () => {
              calls.push(key);
              if (key === 'authorize' || key === 'getConnectionState')
                return { status: 'authorized', canPlayCatalogContent: true };
              return { success: true };
            },
    },
  );
  const scope = {
    __DEV__: dev,
    process: {
      env: {
        EXPO_PUBLIC_BUILD_PROFILE: profile,
        EXPO_PUBLIC_APPLE_MUSIC_ENABLED: enabled,
        EXPO_PUBLIC_APPLE_MUSIC_COMPANION_ENABLED: companionEnabled,
      },
    },
    Platform: { OS: platform },
    createAppleMusicService,
    requireOptionalNativeModule: (name) => {
      assert.equal(name, 'SyncAppleMusic');
      lookups++;
      return native;
    },
  };
  new Script(`${configSource}\n${serviceSource}`).runInNewContext(scope);
  return {
    service: scope.service,
    companion: scope.companion,
    calls,
    get lookups() {
      return lookups;
    },
  };
}

test('native Apple Music requires explicit owner development, with missing or spoofed configuration denied', () => {
  for (const dev of [undefined, false, true, 'true'])
    for (const profile of [undefined, '', 'development', 'preview', 'production', 'unknown'])
      for (const enabled of [undefined, '', false, true, 'false', 'true', 'TRUE'])
        assert.equal(
          appleMusicAvailable({ dev, profile, enabled }),
          dev === true && profile === 'development' && enabled === 'true',
        );
});

test('actual default service does not even look up the native bridge in release, preview, or an unconfigured build', async () => {
  for (const options of [
    { dev: true, profile: 'production', enabled: 'true' },
    { dev: true, profile: 'preview', enabled: 'true' },
    { dev: false, profile: 'development', enabled: 'true' },
    { dev: true, profile: 'development' },
    { dev: true, enabled: 'true' },
    { dev: true, profile: 'development', enabled: 'true', platform: 'android' },
  ]) {
    const h = builtService(options);
    assert.equal(h.service.available, false);
    const operations = [
      () => h.service.authorize(),
      () => h.service.getAccessToken(),
      () => h.service.search('retained-marker', 'song'),
      () => h.service.getUserPlaylists(),
      () => h.service.getPlaylistTracks(null, 'p.saved'),
      () => h.service.playTrack(null, 'apple-music:song:123'),
      () => h.service.playPlaylist(null, 'p.saved'),
      () => h.service.play(),
      () => h.service.pause(),
      () => h.service.releaseCurrent(),
      () => h.service.getActiveDevice(),
      () => h.service.getCurrentPlayback(),
      () => h.service.setRepeat(null, 'track'),
      () => h.service.setShuffle(null, true),
      () => h.service.next(),
      () => h.service.previous(),
    ];
    for (const operation of operations)
      await assert.rejects(operation(), (error) => error.code === 'unavailable');
    await h.service.cleanup();
    assert.equal((await h.service.play(null, null, { isCancelled: () => true })).cancelled, true);
    assert.equal(h.lookups, 0);
    assert.deepEqual(h.calls, []);
  }
});

test('explicit owner development retains native authorization, search and playback controls', async () => {
  const h = builtService({ dev: true, profile: 'development', enabled: 'true' });
  assert.equal(h.service.available, true);
  await h.service.authorize();
  await h.service.search(null, 'workout');
  await h.service.playTrack(null, 'apple-music:song:123');
  await h.service.pause();
  await h.service.play();
  assert.equal(h.lookups, 1);
  assert.deepEqual(h.calls, ['authorize', 'search', 'playTrack', 'pause', 'resume']);
  const blocked = builtService({ dev: true, profile: 'production', enabled: 'true' });
  await assert.rejects(blocked.service.getAccessToken(), {
    message: APPLE_MUSIC_UNAVAILABLE_MESSAGE,
  });
});

test('actual EAS inheritance preserves owner development while keeping preview and production explicitly off', () => {
  const eas = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  assert.equal(resolveProfile(eas, 'development').env.EXPO_PUBLIC_APPLE_MUSIC_ENABLED, 'true');
  for (const profile of ['preview', 'production'])
    assert.equal(resolveProfile(eas, profile).env.EXPO_PUBLIC_APPLE_MUSIC_ENABLED, 'false');
});

test('the companion requires an explicit flag and recognized profile independently of timed development', () => {
  for (const profile of [undefined, '', 'development', 'preview', 'production', 'unknown'])
    for (const enabled of [undefined, '', false, true, 'false', 'true', 'TRUE'])
      assert.equal(
        appleMusicCompanionAvailable({ profile, enabled }),
        ['development', 'preview', 'production'].includes(profile) && enabled === 'true',
      );
});

test('production and preview companion opt-in never opens any timed service entry point', async () => {
  for (const profile of ['preview', 'production']) {
    const h = builtService({ dev: false, profile, enabled: 'true', companionEnabled: 'true' });
    assert.equal(h.lookups, 1);
    assert.equal(h.service.available, false);
    assert.equal(h.companion.available, true);
    await h.companion.authorize();
    await h.companion.playPlaylist(null, 'p.explicit');
    const companionCalls = h.calls.slice();
    for (const operation of [
      () => h.service.authorize(),
      () => h.service.getAccessToken(),
      () => h.service.search(null, 'saved song'),
      () => h.service.getUserPlaylists(),
      () => h.service.getPlaylistTracks(null, 'p.saved'),
      () => h.service.playTrack(null, 'apple-music:song:123'),
      () => h.service.playPlaylist(null, 'p.saved'),
      () => h.service.play(),
      () => h.service.pause(),
      () => h.service.getCurrentPlayback(),
      () => h.service.next(),
      () => h.service.previous(),
      () => h.service.setShuffle(null, true),
      () => h.service.setRepeat(null, 'track'),
      () => h.service.releaseCurrent(),
    ])
      await assert.rejects(operation(), (error) => error.code === 'unavailable');
    await h.service.cleanup();
    assert.deepEqual(h.calls, companionCalls, 'a timed caller cannot mutate the companion queue');
  }
});

test('companion disabled and unsupported-platform builds never obtain its native service', async () => {
  for (const options of [
    { profile: 'production' },
    { profile: 'production', companionEnabled: 'false' },
    { profile: 'unknown', companionEnabled: 'true' },
    { companionEnabled: 'true' },
    { profile: 'production', companionEnabled: 'true', platform: 'android' },
    { profile: 'production', companionEnabled: 'true', platform: 'web' },
  ]) {
    const h = builtService(options);
    assert.equal(h.lookups, 0);
    assert.equal(h.companion.available, false);
    await assert.rejects(h.companion.authorize(), (error) => error.code === 'unavailable');
  }
  const timedOnly = builtService({ dev: true, profile: 'development', enabled: 'true' });
  assert.equal(timedOnly.service.available, true);
  assert.equal(timedOnly.companion.available, false);
  await assert.rejects(timedOnly.companion.playPlaylist(null, 'p.saved'));
});
