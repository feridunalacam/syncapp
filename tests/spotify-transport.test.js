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
import { readSpotifyPages } from '../src/services/spotify/library.js';
import { createCommandQueue } from '../src/services/spotify/queue.js';

const source = readFileSync(new URL('../src/services/spotify/api.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace(/^export /gm, '');
const serviceSource = readFileSync(
  new URL('../src/services/spotify/index.js', import.meta.url),
  'utf8',
)
  .replace(/^import .*;\n/gm, '')
  .replace('export default spotifyService;', 'globalThis.service = spotifyService;');
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const reply = (status, body) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const player = (playing, uri = 'spotify:track:old', deviceId = 'desktop') => ({
  device: { id: deviceId, is_restricted: false },
  is_playing: playing,
  item: { uri },
  context: { uri: 'spotify:playlist:chosen' },
});
function harness(respond) {
  const calls = [];
  const timers = new Map();
  let timerId = 0;
  const context = {
    SPOTIFY_CLIENT_ID: 'synthetic-client',
    SPOTIFY_AVAILABLE: true,
    URLSearchParams,
    AbortController,
    setTimeout(callback, ms) {
      const id = ++timerId;
      timers.set(id, { callback, ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    console: { error() {}, warn() {} },
    resolvePlaybackDevice,
    canControlDevice,
    canControlVolume,
    runVerifiedCommand,
    startVerifiedTrack,
    transferVerifiedPlayback,
    readSpotifyPages,
    createCommandQueue,
    fetch: (input, options) => {
      const request = { url: new URL(input), ...options };
      calls.push(request);
      return respond(request, calls.length);
    },
  };
  new Script(`${source}\nglobalThis.api = spotifyAPI;\n${serviceSource}`).runInNewContext(context);
  // Playback verification itself is already covered with controlled delays in
  // spotify-commands/playback/transfer; these tests exercise the HTTP work.
  const transportWait = context.api.wait;
  context.api.wait = async () => {};
  return {
    api: context.api,
    service: context.service,
    calls,
    timers,
    transportWait,
    expireRequest() {
      const timer = [...timers.entries()].find(([, entry]) => entry.ms === 6000);
      assert.ok(timer, 'the HTTP deadline is armed');
      timers.delete(timer[0]);
      timer[1].callback();
    },
  };
}

for (const shuffle of [false, true]) {
  test(`playlist start applies shuffle=${shuffle} on the actual active device before playback`, async () => {
    let playing = false;
    const h = harness((request) => {
      if (request.url.pathname.endsWith('/play')) playing = true;
      return request.method === 'GET'
        ? reply(200, player(playing, undefined, 'phone'))
        : reply(204);
    });
    assert.equal(
      (await h.api.playPlaylist('token', 'chosen', 'old-device', shuffle)).confirmed,
      true,
    );
    const writes = h.calls.filter((request) => request.method === 'PUT');
    assert.deepEqual(
      writes.map((request) => request.url.pathname),
      ['/v1/me/player/shuffle', '/v1/me/player/play'],
    );
    assert.equal(writes[0].url.searchParams.get('state'), String(shuffle));
    assert.ok(writes.every((request) => request.url.searchParams.get('device_id') === 'phone'));
    assert.equal(h.timers.size, 0);
  });
}

test('failed playlist shuffle is actionable and cannot start the playlist', async () => {
  const h = harness((request) =>
    request.url.pathname.endsWith('/shuffle')
      ? reply(403, { error: { message: 'Shuffle is restricted' } })
      : reply(200, player(false)),
  );
  const result = await h.api.playPlaylist('token', 'chosen', 'desktop', false);
  assert.equal(result.success, false);
  assert.equal(result.code, 403);
  assert.equal(result.error, 'Shuffle is restricted');
  assert.equal(
    h.calls.some((request) => request.url.pathname.endsWith('/play')),
    false,
  );
});

test('cancellation between shuffle acknowledgement and play prevents the start', async () => {
  const pending = deferred();
  let cancelled = false;
  const h = harness((request) =>
    request.url.pathname.endsWith('/shuffle') ? pending.promise : reply(200, player(false)),
  );
  const result = h.api.playPlaylist('token', 'chosen', 'desktop', false, {
    isCancelled: () => cancelled,
  });
  await flush();
  cancelled = true;
  pending.resolve(reply(204));
  assert.equal((await result).cancelled, true);
  assert.equal(
    h.calls.some((request) => request.url.pathname.endsWith('/play')),
    false,
  );
});

for (const method of ['setShuffle', 'setRepeat', 'setVolume']) {
  test(`${method} returns structured provider failure rather than a bare false`, async () => {
    const h = harness(() => reply(403, { error: { message: 'Premium playback is restricted' } }));
    const result = await h.api[method]('token', method === 'setRepeat' ? 'track' : true, 'desktop');
    assert.equal(result.success, false);
    assert.equal(result.code, 403);
    assert.equal(result.error, 'Premium playback is restricted');
  });
}

for (const stage of ['preflight', 'play', 'confirmation', 'body', 'refresh']) {
  test(`urgent pause aborts a stalled ${stage}, retires queued starts and ignores late completion`, async () => {
    const held = deferred();
    const reached = deferred();
    let stalled = false;
    let playing = stage === 'play';
    let track = 'spotify:track:old';
    let heldSignal;
    let refreshes = 0;
    const h = harness((request) => {
      const path = request.url.pathname;
      const hold =
        !stalled &&
        ((stage === 'preflight' && request.method === 'GET') ||
          (stage === 'play' && path.endsWith('/play')) ||
          (stage === 'confirmation' && request.method === 'GET' && playing) ||
          (stage === 'body' && path.endsWith('/play')) ||
          (stage === 'refresh' && request.method === 'GET'));
      if (hold) {
        stalled = true;
        heldSignal = request.signal;
        if (stage === 'body') {
          reached.resolve();
          return { status: 204, ok: true, headers: new Headers(), text: () => held.promise };
        }
        if (stage === 'refresh') return reply(401, { error: { message: 'Expired token' } });
        reached.resolve();
        return held.promise; // Deliberately ignores abort to probe late responses.
      }
      if (path.endsWith('/play')) {
        playing = true;
        track = JSON.parse(request.body).uris[0];
      }
      if (path.endsWith('/pause')) playing = false;
      return request.method === 'GET' ? reply(200, player(playing, track)) : reply(204);
    });
    const old = h.service.playTrack('token', 'spotify:track:old', 'desktop', {
      refreshCallback: () => {
        refreshes++;
        reached.resolve();
        return held.promise;
      },
    });
    await reached.promise;
    const obsolete = h.service.playPlaylist('token', 'obsolete', 'desktop', true);
    const paused = h.service.pause('token', null, 'desktop');
    assert.equal((await old).cancelled, true);
    assert.equal((await obsolete).cancelled, true);
    assert.equal((await paused).confirmed, true);
    if (stage !== 'refresh') assert.equal(heldSignal.aborted, true);
    assert.equal(
      (await h.service.playTrack('token', 'spotify:track:new', 'desktop')).confirmed,
      true,
    );
    const callCount = h.calls.length;
    held.resolve(stage === 'body' ? '' : stage === 'refresh' ? 'late-token' : reply(204));
    await flush();
    assert.equal(
      h.calls.length,
      callCount,
      'late response cannot trigger verification, refresh or fallback',
    );
    assert.equal(track, 'spotify:track:new');
    assert.equal(playing, true);
    assert.equal(refreshes, stage === 'refresh' ? 1 : 0);
    assert.equal(h.timers.size, 0);
  });
}

test('immediate cancellation releases an outer queue before its pause is enqueued', async () => {
  const reached = deferred();
  let signal;
  const h = harness((request) => {
    if (request.url.pathname.endsWith('/play')) {
      signal = request.signal;
      reached.resolve();
      return new Promise(() => {});
    }
    return request.method === 'GET' ? reply(200, player(false)) : reply(204);
  });
  const old = h.service.playTrack('token', 'spotify:track:old', 'desktop');
  await reached.promise;
  assert.equal(h.service.cancelPending().success, true);
  assert.equal(signal.aborted, true);
  assert.equal((await old).cancelled, true);
  assert.equal((await h.service.pause('token', null, 'desktop')).confirmed, true);
});

for (const bodyStalls of [false, true]) {
  test(`deadline aborts a never-settling ${bodyStalls ? 'response body' : 'fetch'} and frees the mutation queue`, async () => {
    const reached = deferred();
    let signal;
    let first = true;
    const h = harness((request) => {
      if (first) {
        first = false;
        signal = request.signal;
        reached.resolve();
        return bodyStalls
          ? { status: 200, ok: true, headers: new Headers(), text: () => new Promise(() => {}) }
          : new Promise(() => {});
      }
      return reply(204);
    });
    const old = h.service.next('token', null, 'desktop');
    await reached.promise;
    h.expireRequest();
    const result = await old;
    assert.equal(result.success, false);
    assert.equal(result.code, 'SPOTIFY_TIMEOUT');
    assert.match(result.error, /timed out/);
    assert.equal(signal.aborted, true);
    assert.equal((await h.service.setRepeat('token', 'off', 'desktop')).success, true);
    assert.equal(h.timers.size, 0);
  });
}

test('active-device timeout cannot fall through into device activation', async () => {
  const h = harness(() => new Promise(() => {}));
  const playback = h.api.play('token');
  await flush();
  h.expireRequest();
  assert.equal((await playback).code, 'SPOTIFY_TIMEOUT');
  assert.equal(h.calls.length, 1);
});

test('a stalled refresh times out without a late token starting a retry', async () => {
  const reached = deferred();
  const refresh = deferred();
  const h = harness(() => reply(401, { error: { message: 'Expired token' } }));
  const command = h.service.next(
    'old-token',
    () => {
      reached.resolve();
      return refresh.promise;
    },
    'desktop',
  );
  await reached.promise;
  h.expireRequest();
  assert.equal((await command).code, 'SPOTIFY_TIMEOUT');
  refresh.resolve('late-token');
  await flush();
  assert.equal(h.calls.length, 1);
  assert.equal((await h.service.setShuffle('token', false, 'desktop')).success, false);
});

test('diagnostic playback timeout is actionable and is not retried as a transient network error', async () => {
  const h = harness(() => new Promise(() => {}));
  const read = h.service.getCurrentPlayback('token', null, { reportErrors: true });
  await flush();
  h.expireRequest();
  assert.equal((await read).code, 'SPOTIFY_TIMEOUT');
  assert.equal(h.calls.length, 1);
  assert.equal(h.timers.size, 0);
});

test('cancellation wakes the real verification delay without another read or fallback', async () => {
  const h = harness((request) =>
    request.method === 'GET' ? reply(200, player(false)) : reply(204),
  );
  h.api.wait = h.transportWait;
  const command = h.service.playTrack('token', 'spotify:track:old', 'desktop');
  await flush();
  assert.ok([...h.timers.values()].some((timer) => timer.ms === 350));
  h.service.cancelPending();
  assert.equal((await command).cancelled, true);
  assert.equal(h.calls.length, 2);
  assert.equal(h.timers.size, 0);
});

test('normal refresh retries once with the new token while keeping transport cancellation', async () => {
  let refreshes = 0;
  const h = harness((_request, count) =>
    count === 1 ? reply(401, { error: { message: 'Expired token' } }) : reply(204),
  );
  const result = await h.service.next(
    'old-token',
    async () => {
      refreshes++;
      return 'new-token';
    },
    'desktop',
  );
  assert.equal(result.success, true);
  assert.equal(refreshes, 1);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].headers.Authorization, 'Bearer new-token');
  assert.ok(
    h.calls.every((request) => request.signal instanceof AbortSignal && !request.signal.aborted),
  );
});

test('library HTTP requests use the same deadline and actual AbortSignal', async () => {
  let signal;
  const h = harness((request) => {
    signal = request.signal;
    return new Promise(() => {});
  });
  const library = h.service.getUserPlaylists('token');
  const rejected = assert.rejects(library, (error) => error.code === 'SPOTIFY_TIMEOUT');
  await flush();
  h.expireRequest();
  await rejected;
  assert.equal(signal.aborted, true);
});

test('urgent stop does not cancel an independent metadata read', async () => {
  const started = deferred();
  const metadata = deferred();
  let holdMetadata = false;
  let metadataSignal;
  const h = harness((request) => {
    if (request.url.pathname.endsWith('/play')) {
      started.resolve();
      return new Promise(() => {});
    }
    if (holdMetadata) {
      holdMetadata = false;
      metadataSignal = request.signal;
      return metadata.promise;
    }
    return request.method === 'GET' ? reply(200, player(false)) : reply(204);
  });
  const old = h.service.playTrack('token', 'spotify:track:old', 'desktop');
  await started.promise;
  holdMetadata = true;
  const read = h.service.getCurrentPlayback('token');
  await flush();
  await h.service.pause('token', null, 'desktop');
  assert.equal((await old).cancelled, true);
  assert.equal(metadataSignal.aborted, false);
  metadata.resolve(reply(200, player(false)));
  assert.equal((await read).is_playing, false);
});
