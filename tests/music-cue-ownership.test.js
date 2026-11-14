import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { useAudioController } from '../src/hooks/useAudioController.js';
import { createCueHandoff } from '../src/services/alerts/cueHandoff.js';
import { createAppleMusicCompanionController } from '../src/services/appleMusic/companion.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const ok = { success: true };
const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const song = (id, platform = 'appleMusic') => ({
  id,
  name: `Song ${id}`,
  platform,
  duration_ms: 60000,
  uri: platform === 'appleMusic' ? `apple-music:song:${id}` : `file:///${id}.mp3`,
});

// Only native outputs are faked. Registration, cue ownership, source suspension,
// conditional resume and hook command serialization all run their actual code.
async function mount(t, source) {
  const events = [];
  const cues = [];
  const controls = { device: {}, apple: {}, outputStop: null };
  let outputPlaying = false;
  let audio;
  let root;
  let mounted = true;
  const native = (name) => {
    const state = { playing: false, track: null };
    const service = {
      getAccessToken: async () => ({ accessToken: 'native:appleMusic' }),
      getActiveDevice: async () => 'device',
      async playTrack(_token, uri) {
        events.push(`${name}.track:${uri}`);
        state.track = song(
          uri
            .split(/[:/]/)
            .at(-1)
            .replace(/\.mp3$/, ''),
          name === 'apple' ? 'appleMusic' : 'device',
        );
        state.playing = true;
        return ok;
      },
      async play(_token, _device, options) {
        events.push(`${name}.resume.request`);
        const result = await (controls[name].resume?.(options) ?? ok);
        if (result?.success !== false && !result?.cancelled) state.playing = true;
        events.push(`${name}.resume.ack`);
        return result;
      },
      async pause() {
        events.push(`${name}.pause.request`);
        const result = await (controls[name].pause?.() ?? ok);
        if (result !== false && result?.success !== false) state.playing = false;
        events.push(`${name}.pause.ack`);
        return result;
      },
      async cleanup() {
        events.push(`${name}.cleanup.request`);
        const result = await (controls[name].cleanup?.() ?? ok);
        if (result !== false && result?.success !== false) {
          state.playing = false;
          state.track = null;
        }
        events.push(`${name}.cleanup.ack`);
        return result;
      },
      setVolume: async () => ok,
      setRepeat: async () => ok,
      setShuffle: async () => ok,
      async getCurrentPlayback() {
        if (controls[name].playback) return controls[name].playback();
        return { item: state.track, is_playing: state.playing, progress_ms: 1000 };
      },
    };
    return { state, service };
  };
  const device = native('device');
  const apple = native('apple');
  const handoff = createCueHandoff({
    needsMusicHandoff: () => device.state.playing || companion.isActive(),
    async stopOutput(owner) {
      events.push(`cue.stop.request:${owner}`);
      await controls.outputStop?.(owner);
      outputPlaying = false;
      events.push(`cue.stop.ack:${owner}`);
    },
  });
  const companion = createAppleMusicCompanionController({
    service: apple.service,
    pollIntervalMs: 100000,
    beforePlay: () => handoff.stop('workout'),
  });
  const unregisterApple = handoff.register({ suspendForCue: companion.suspendForCue });
  const registerCueSource = handoff.register;
  const requestCue = (owner = 'workout', event = { kind: 'signal' }) => {
    const done = deferred();
    const cue = { done, event, owner, played: false, pending: null };
    cue.pending = handoff.run(owner, event, async () => {
      assert.equal(
        device.state.playing || apple.state.playing,
        false,
        'native music is quiet before cue output',
      );
      cue.played = true;
      outputPlaying = true;
      events.push(`cue.start:${owner}`);
      return done.promise;
    });
    cue.pending.catch(() => {});
    cues.push(cue);
    return cue;
  };
  const playCue = (event) => requestCue('legacy', event).pending;
  const routine = {
    rounds: 2,
    workSec: 30,
    restSec: 10,
    endWorkSound: { uri: 'file:///gong.wav', platform: 'device', name: 'Gong' },
    roundsData: [
      { workSong: song('first', 'device') },
      { workSong: song('replacement', 'device') },
    ],
  };
  function Harness() {
    audio = useAudioController({
      selectedRoutine: routine,
      services: { device: device.service },
      connectedPlatforms: { device: { connected: true } },
      countdownSoundPlayer: { stop: async () => ok },
      stopLocalCues: () => handoff.stop('workout'),
      isExternalMusicActive: () => companion.isActive(),
      registerCueSource,
      playCue,
    });
    return null;
  }
  await act(async () => {
    root = create(React.createElement(Harness));
  });
  const unmountAccount = async () => {
    if (!mounted) return;
    mounted = false;
    unregisterApple();
    await act(async () => {
      root.unmount();
      await companion.dispose();
      await flush();
    });
  };
  t.after(async () => {
    controls.outputStop = null;
    controls.device = {};
    controls.apple = {};
    cues.forEach((cue) => cue.done.resolve({ completed: true }));
    await act(async () => {
      await handoff.stop('workout');
      await handoff.stop('legacy');
    });
    await unmountAccount();
    await flush();
  });
  const step = async (operation) => {
    let result;
    await act(async () => {
      result = await operation();
      await flush();
    });
    return result;
  };
  await step(() =>
    source === 'apple' ? companion.playTrack(song('first')) : audio.handlePhaseChange('work', 1),
  );
  events.length = 0;
  return {
    events,
    cues,
    controls,
    companion,
    handoff,
    device,
    apple,
    step,
    unmountAccount,
    get audio() {
      return audio;
    },
    get outputPlaying() {
      return outputPlaying;
    },
    async cue(event) {
      let result;
      await act(async () => {
        result = requestCue('workout', event);
        await flush();
      });
      return result;
    },
    async finish(cue) {
      return step(async () => {
        cue.done.resolve({ completed: true });
        return cue.pending;
      });
    },
    async boundary(kind) {
      if (kind === 'account-unmount') return unmountAccount();
      return step(async () => {
        if (kind === 'background') {
          companion.setAppActive(false);
          audio.cancelCueResume();
          return audio.pauseMusic();
        }
        if (kind === 'end') {
          companion.cancelCueResume();
          return audio.cancelCueResume();
        }
        if (kind === 'manual-pause')
          return source === 'apple' ? companion.pause() : audio.pauseMusic();
        if (kind === 'stop') return source === 'apple' ? companion.clear() : audio.stopMusic();
        if (kind === 'changed-track')
          return source === 'apple'
            ? companion.playTrack(song('replacement'))
            : audio.handlePhaseChange('work', 2);
        throw new Error(`Unknown boundary ${kind}`);
      });
    },
  };
}

for (const source of ['device', 'apple']) {
  test(`${source}: cue waits for native pause and resumes music only after cue stop acknowledgement`, async (t) => {
    const h = await mount(t, source);
    const paused = deferred();
    const drained = deferred();
    h.controls[source].pause = () => paused.promise;
    const cue = await h.cue();
    assert.equal(cue.played, false);
    await h.step(() => paused.resolve(ok));
    assert.equal(cue.played, true);
    assert.equal(h.outputPlaying, true);
    h.controls.outputStop = () => drained.promise;
    await h.step(() => cue.done.resolve({ completed: true }));
    assert.equal(h.events.includes(`${source}.resume.request`), false);
    h.controls.outputStop = null;
    await h.step(() => drained.resolve());
    assert.equal((await cue.pending).completed, true);
    await h.step(() => flush());
    const pauseAck = h.events.indexOf(`${source}.pause.ack`);
    const cueStart = h.events.indexOf('cue.start:workout');
    const cueStopAck = h.events.lastIndexOf('cue.stop.ack:workout');
    const resume = h.events.indexOf(`${source}.resume.request`);
    assert.ok(pauseAck < cueStart && cueStart < cueStopAck && cueStopAck < resume);
    assert.equal(h[source].state.playing, true);
  });

  for (const boundary of [
    'manual-pause',
    'stop',
    'end',
    'background',
    'account-unmount',
    'changed-track',
  ]) {
    test(`${source}: ${boundary} during a cue prevents a late automatic resume`, async (t) => {
      const h = await mount(t, source);
      const cue = await h.cue();
      assert.equal(cue.played, true);
      await h.boundary(boundary);
      await h.finish(cue);
      await h.step(() => flush());
      assert.equal(h.events.includes(`${source}.resume.request`), false);
      if (boundary === 'changed-track') {
        assert.equal(h[source].state.track.id, 'replacement');
        assert.equal(h[source].state.playing, true, 'only the new explicit selection plays');
      } else assert.equal(h[source].state.playing, false);
    });
  }

  test(`${source}: music already paused before the cue is never automatically started`, async (t) => {
    const h = await mount(t, source);
    await h.boundary('manual-pause');
    h.events.length = 0;
    const cue = await h.cue();
    assert.equal(cue.played, true);
    await h.finish(cue);
    await h.step(() => flush());
    assert.equal(h.events.includes(`${source}.resume.request`), false);
    assert.equal(h[source].state.playing, false);
  });

  test(`${source}: a new cue waits for an older automatic resume acknowledgement and then pauses it`, async (t) => {
    const h = await mount(t, source);
    const resumed = deferred();
    let resumes = 0;
    h.controls[source].resume = () => (++resumes === 1 ? resumed.promise : ok);
    const first = await h.cue();
    await h.finish(first);
    await h.step(() => flush());
    assert.equal(resumes, 1);
    const next = await h.cue();
    assert.equal(next.played, false, 'new output cannot overlap the still-pending old resume');
    await h.step(() => resumed.resolve(ok));
    assert.equal(next.played, true);
    const resumeAck = h.events.indexOf(`${source}.resume.ack`);
    const secondPause = h.events.lastIndexOf(`${source}.pause.ack`);
    assert.ok(resumeAck < secondPause);
    assert.equal(h[source].state.playing, false);
    await h.finish(next);
  });

  test(`${source}: a stale paused poll begun during resume acknowledgement cannot suppress the next cue resume`, async (t) => {
    const h = await mount(t, source);
    const resumed = deferred();
    const polled = deferred();
    let resumes = 0;
    let reads = 0;
    h.controls[source].resume = () => (++resumes === 1 ? resumed.promise : ok);
    const first = await h.cue();
    await h.finish(first);
    assert.equal(resumes, 1);
    assert.equal(h[source].state.playing, false, 'native resume is not acknowledged yet');
    h.controls[source].playback = () => {
      reads++;
      return polled.promise;
    };
    let polling;
    await act(async () => {
      polling = source === 'apple' ? h.companion.refresh() : h.audio.fetchPlayback();
      await flush();
    });
    assert.equal(reads, 1, 'the stale sample starts during the pending native resume');
    await h.step(() => resumed.resolve(ok));
    h.controls[source].playback = null;
    await h.step(() =>
      polled.resolve({ item: h[source].state.track, is_playing: false, progress_ms: 1000 }),
    );
    await h.step(() => polling);
    const playing = () =>
      source === 'apple' ? h.companion.getState().playing : h.audio.isMusicPlaying;
    assert.equal(
      playing(),
      true,
      'a transition-era paused sample cannot overwrite acknowledged playing intent',
    );
    const next = await h.cue();
    assert.equal(next.played, true);
    await h.finish(next);
    await h.step(() => flush());
    assert.equal(resumes, 2, 'the second cue still restores music that was playing');
    assert.equal(playing(), true);
  });

  test(`${source}: failed music pause blocks the cue and allows a later acknowledged suspension`, async (t) => {
    const h = await mount(t, source);
    h.controls[source].pause = () => ({ success: false, error: `${source} pause failed` });
    const cue = await h.cue();
    await assert.rejects(cue.pending, new RegExp(`${source} pause failed`));
    assert.equal(cue.played, false);
    assert.equal(h[source].state.playing, true, 'failed pause never claims native silence');
    assert.equal(h.events.includes(`${source}.resume.request`), false);
    h.controls[source].pause = null;
    await h.step(() => flush());
    const retry = await h.cue();
    assert.equal(retry.played, true);
    await h.finish(retry);
  });
}

test('checked device stop failure retains the hook source and blocks cue output until cleanup recovery', async (t) => {
  const h = await mount(t, 'device');
  h.controls.device.pause = () => ({ success: false, error: 'Device pause failed' });
  h.controls.device.cleanup = () => ({ success: false, error: 'Device cleanup failed' });
  assert.equal((await h.step(() => h.audio.stopMusic())).success, false);
  const cue = await h.cue();
  await assert.rejects(cue.pending, /Device pause failed/);
  assert.equal(cue.played, false);
  assert.equal(h.events.includes('device.resume.request'), false);
  assert.equal(h.device.state.playing, true);
  h.controls.device = {};
  await h.step(() => h.audio.stopMusic());
  assert.equal(
    h.events.filter((event) => event === 'device.cleanup.request').length,
    2,
    'retry reaches the retained active source',
  );
  const recovered = await h.cue();
  assert.equal(recovered.played, true);
  await h.finish(recovered);
});

test('the real hook routes a legacy gong through the registered ownership handoff', async (t) => {
  const h = await mount(t, 'device');
  let pending;
  await act(async () => {
    pending = h.audio.playCountdownSound('endWork');
    await flush();
  });
  const cue = h.cues.at(-1);
  assert.equal(cue.owner, 'legacy');
  assert.equal(cue.event.sound.uri, 'file:///gong.wav');
  assert.equal(cue.played, true);
  assert.equal(h.device.state.playing, false);
  await h.finish(cue);
  assert.equal((await pending).completed, true);
  await h.step(() => flush());
  assert.equal(h.device.state.playing, true);
});
