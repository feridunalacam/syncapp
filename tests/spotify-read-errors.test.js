import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import {
  resolvePlaybackDevice,
  canControlDevice,
  canControlVolume,
} from '../src/services/spotify/devices.js';
import { runVerifiedCommand } from '../src/services/spotify/commands.js';
import { startVerifiedTrack } from '../src/services/spotify/playback.js';
import { transferVerifiedPlayback } from '../src/services/spotify/transfer.js';

const source = readFileSync(new URL('../src/services/spotify/api.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
const diagnostic = { reportErrors: true };
const reply = (status, body) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const denied = (status = 403, message = 'Insufficient client scope') =>
  reply(status, { error: { status, message } });
function harness(respond) {
  const calls = [];
  const context = {
    SPOTIFY_CLIENT_ID: 'synthetic-client',
    URLSearchParams,
    AbortController,
    clearTimeout,
    setTimeout: (callback) => setTimeout(callback, 0),
    console: { error() {}, warn() {} },
    resolvePlaybackDevice,
    canControlDevice,
    canControlVolume,
    runVerifiedCommand,
    startVerifiedTrack,
    transferVerifiedPlayback,
    readSpotifyPages: async () => assert.fail('Unexpected library request'),
    fetch: async (input, options) => {
      const request = {
        path: new URL(input).pathname,
        method: options.method,
        authorization: options.headers.Authorization,
      };
      calls.push(request);
      return respond(request, calls.length);
    },
  };
  new Script(`${source}\nglobalThis.api = spotifyAPI;`).runInNewContext(context);
  return { api: context.api, calls };
}

test('legacy playback and active-device readers retain their null contract on authorization errors', async () => {
  const h = harness(() => denied());
  assert.equal(await h.api.getCurrentPlayback('synthetic'), null);
  assert.equal(await h.api.getActiveDevice('synthetic'), null);
});

test('legacy refreshed playback errors remain null while successful diagnostic reads retain playback and device identity', async () => {
  const legacy = harness((_request, index) => (index === 1 ? denied(401) : denied(403)));
  assert.equal(
    await legacy.api.getCurrentPlayback('synthetic', async () => 'synthetic-refreshed'),
    null,
  );
  const h = harness(() =>
    reply(200, {
      device: { id: 'synthetic-active', is_restricted: false },
      item: { uri: 'spotify:track:synthetic' },
      is_playing: true,
    }),
  );
  assert.equal(
    (await h.api.getCurrentPlayback('synthetic', null, 0, diagnostic)).item.uri,
    'spotify:track:synthetic',
  );
  assert.equal(await h.api.getActiveDevice('synthetic', null, diagnostic), 'synthetic-active');
  assert.equal(
    h.calls.some((request) => request.method === 'PUT'),
    false,
  );
});

test('a transient playback retry retains diagnostic authorization reporting', async () => {
  const h = harness((_request, index) => {
    if (index === 1) throw new TypeError('Network request failed');
    return denied(403, 'Playback permission was removed');
  });
  const result = await h.api.getCurrentPlayback('synthetic', null, 0, diagnostic);
  assert.equal(result.code, 403);
  assert.equal(result.error, 'Playback permission was removed');
  assert.equal(h.calls.length, 2);
});

for (const method of ['getCurrentPlayback', 'getActiveDevice']) {
  const read = (api, refresh) =>
    method === 'getCurrentPlayback'
      ? api[method]('synthetic', refresh, 0, diagnostic)
      : api[method]('synthetic', refresh, diagnostic);
  test(`diagnostic ${method} preserves a restriction without activation or transfer`, async () => {
    const h = harness(() => denied());
    const result = await read(h.api);
    assert.equal(result.success, false);
    assert.equal(result.code, 403);
    assert.equal(result.error, 'Insufficient client scope');
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].method, 'GET');
  });

  test(`diagnostic ${method} preserves the refreshed response's 403 rather than the original 401`, async () => {
    let refreshes = 0;
    const h = harness((_request, index) =>
      index === 1 ? denied(401, 'Expired synthetic token') : denied(403, 'Playback is restricted'),
    );
    const result = await read(h.api, async () => {
      refreshes++;
      return 'synthetic-refreshed';
    });
    assert.equal(result.code, 403);
    assert.equal(result.error, 'Playback is restricted');
    assert.equal(refreshes, 1);
    assert.equal(h.calls.length, 2);
    assert.equal(h.calls[1].authorization, 'Bearer synthetic-refreshed');
  });

  test(`diagnostic ${method} reports an unrefreshable 401 without activating a device`, async () => {
    const h = harness(() => denied(401, 'Token is not authorized'));
    const result = await read(h.api, async () => null);
    assert.equal(result.code, 401);
    assert.equal(result.error, 'Token is not authorized');
    assert.equal(h.calls.length, 1);
  });
}

for (const stage of ['devices', 'activation']) {
  test(`an authorization failure during idle-device ${stage} is preserved, including after refresh`, async () => {
    let deniedOnce = false;
    const h = harness((request) => {
      const target =
        stage === 'devices' ? request.path.endsWith('/devices') : request.method === 'PUT';
      if (target) {
        if (!deniedOnce) {
          deniedOnce = true;
          return denied(401, 'Expired synthetic token');
        }
        return denied(403, 'Device control is restricted');
      }
      return request.path.endsWith('/devices')
        ? reply(200, { devices: [{ id: 'synthetic-idle', is_active: false }] })
        : reply(204);
    });
    const result = await h.api.getActiveDevice(
      'synthetic',
      async () => 'synthetic-refreshed',
      diagnostic,
    );
    assert.equal(result.code, 403);
    assert.equal(result.error, 'Device control is restricted');
    assert.equal(
      h.calls.filter((request) => request.method === 'PUT').length,
      stage === 'devices' ? 0 : 2,
    );
  });
}

for (const status of [204, 404]) {
  test(`diagnostic ${status} no-playback still discovers and activates the only idle device`, async () => {
    const h = harness((request) => {
      if (request.method === 'PUT') return reply(204);
      if (request.path.endsWith('/devices'))
        return reply(200, { devices: [{ id: 'synthetic-idle', is_active: false }] });
      return status === 204
        ? reply(204)
        : reply(404, { error: { reason: 'NO_ACTIVE_DEVICE', message: 'No active device found' } });
    });
    assert.equal(await h.api.getCurrentPlayback('synthetic', null, 0, diagnostic), null);
    assert.equal(await h.api.getActiveDevice('synthetic', null, diagnostic), 'synthetic-idle');
    assert.equal(h.calls.filter((request) => request.method === 'PUT').length, 1);
  });
}

test('diagnostic absence never chooses among multiple idle devices', async () => {
  const h = harness((request) =>
    request.path.endsWith('/devices')
      ? reply(200, { devices: [{ id: 'one' }, { id: 'two' }] })
      : reply(204),
  );
  assert.equal(await h.api.getActiveDevice('synthetic', null, diagnostic), null);
  assert.equal(
    h.calls.some((request) => request.method === 'PUT'),
    false,
  );
});

test('service forwards diagnostic options without replacing the API retry-attempt argument', async () => {
  const calls = [];
  const serviceSource = readFileSync(
    new URL('../src/services/spotify/index.js', import.meta.url),
    'utf8',
  )
    .replace(/^import .*;\n/gm, '')
    .replace('export default spotifyService;', 'globalThis.service = spotifyService;');
  const context = {
    SPOTIFY_AVAILABLE: true,
    createCommandQueue: () => (operation) => operation(),
    spotifyAPI: {
      getCurrentPlayback: (...args) => calls.push(['playback', args]),
      getActiveDevice: (...args) => calls.push(['device', args]),
    },
  };
  new Script(serviceSource).runInNewContext(context);
  context.service.getCurrentPlayback('synthetic', null, diagnostic);
  context.service.getActiveDevice('synthetic', null, diagnostic);
  assert.deepEqual(calls[0], ['playback', ['synthetic', null, 0, diagnostic]]);
  assert.deepEqual(calls[1], ['device', ['synthetic', null, diagnostic]]);
});
