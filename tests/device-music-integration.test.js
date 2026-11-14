import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import React, { act } from 'react';
import { create } from 'react-test-renderer';
import { useAudioController } from '../src/hooks/useAudioController.js';
import * as workout from '../src/domain/workout.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
function deviceService(schedule = setTimeout) {
  let failLoad = false;
  let bufferResume = false;
  let cancelled = false;
  const events = [];
  const scope = {
    console: { error() {} },
    setTimeout: schedule,
    clearTimeout,
    Audio: {
      setAudioModeAsync: async () => {},
      Sound: {
        async createAsync({ uri }) {
          if (failLoad) throw new Error('Audio source is offline');
          let playing = false;
          let starts = 0;
          return {
            sound: {
              setOnPlaybackStatusUpdate() {},
              setIsLoopingAsync: async () => {},
              setStatusAsync: async () => {},
              setVolumeAsync: async () => {},
              async playAsync() {
                events.push(['play', uri]);
                playing = true;
                return {
                  isLoaded: true,
                  isPlaying: ++starts > 1 && bufferResume ? false : playing,
                  isBuffering: starts > 1 && bufferResume,
                };
              },
              async getStatusAsync() {
                return {
                  isLoaded: true,
                  isPlaying: playing,
                  isBuffering: bufferResume,
                  durationMillis: 10000,
                  positionMillis: 1000,
                };
              },
              async pauseAsync() {
                playing = false;
                events.push(['pause', uri]);
              },
              async unloadAsync() {
                playing = false;
                events.push(['unload', uri]);
              },
            },
          };
        },
      },
    },
  };
  const player = readFileSync(
    new URL('../src/services/audio/ExpoAVPlayer.js', import.meta.url),
    'utf8',
  )
    .replace(/^import .*;\n/gm, '')
    .replace('export default ExpoAVPlayer;', '');
  const service = readFileSync(
    new URL('../src/services/deviceMusicService.js', import.meta.url),
    'utf8',
  )
    .replace(/^import .*;\n/gm, '')
    .replace('export default deviceMusicService;', 'globalThis.service = deviceMusicService;');
  new Script(`${player}\n${service}`).runInNewContext(scope);
  return {
    service: scope.service,
    events,
    fail: (value) => {
      failLoad = value;
    },
    buffer: (value) => {
      bufferResume = value;
    },
    cancel: () => {
      cancelled = true;
    },
    cancelled: () => cancelled,
  };
}

test('the device service forwards resume cancellation and waits for buffering readiness', async () => {
  const h = deviceService();
  await h.service.playTrack('device', 'https://example.org/audio.mp3');
  await h.service.pause();
  h.buffer(true);
  let ready = false;
  const pending = h.service
    .play('device', 'device', { isCancelled: h.cancelled })
    .then((result) => {
      ready = true;
      return result;
    });
  await new Promise(setImmediate);
  assert.equal(ready, false);
  h.cancel();
  assert.equal((await pending).cancelled, true);
  h.buffer(false);
  assert.equal((await h.service.play('device', 'device')).success, true);
  await h.service.cleanup();
});

test('a real device service can recover after a failed load and the shared controller pause', async (t) => {
  const h = deviceService();
  let audio;
  const routine = {
    rounds: 1,
    roundsData: [
      { workSong: { uri: 'https://example.org/audio.mp3', platform: 'url', name: 'Web audio' } },
    ],
  };
  function Harness() {
    audio = useAudioController({
      selectedRoutine: routine,
      services: { device: h.service },
      connectedPlatforms: { device: { connected: true } },
      countdownSoundPlayer: { stop: async () => {} },
    });
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(Harness));
  });
  t.after(async () => act(async () => root.unmount()));
  h.fail(true);
  let failed;
  await act(async () => {
    failed = await audio.handlePhaseChange('work', 1);
  });
  assert.equal(failed.success, false);
  await act(async () => audio.pauseMusic());
  h.fail(false);
  let retried;
  // WorkoutContext restarts the current phase when audioError is present.
  await act(async () => {
    retried = await audio.handlePhaseChange('work', 1);
  });
  assert.notEqual(retried?.success, false);
  assert.equal(audio.audioError, null);
  assert.equal(audio.isMusicPlaying, true);
  assert.equal(h.events.filter(([event]) => event === 'play').length, 1);
  await act(async () => audio.stopMusic());
});

test('device resume cancellation is honored before any audible play command', async () => {
  const h = deviceService();
  await h.service.playTrack('device', 'file:///audio.mp3');
  await h.service.pause();
  const result = await h.service.play('device', 'device', { isCancelled: () => true });
  assert.equal(result.cancelled, true);
  assert.equal(h.events.filter(([event]) => event === 'play').length, 1);
  await h.service.cleanup();
});

test('legacy device URI-array playback remains supported', async () => {
  const h = deviceService();
  assert.equal(
    (await h.service.play('device', 'device', ['file:///audio.mp3'], 1000)).success,
    true,
  );
  assert.equal(h.events[0][0], 'play');
  assert.equal(h.events[0][1], 'file:///audio.mp3');
  await h.service.cleanup();
});

test('the real timer and device adapter preserve interval time throughout a buffered resume', async (t) => {
  const polling = [];
  const h = deviceService((callback) => {
    polling.push(callback);
  });
  let now = 1000,
    tick,
    timer,
    audio;
  const source = readFileSync(new URL('../src/screens/Home/TimerLogic.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '')
    .replace(/^export /gm, '');
  const scope = {
    ...React,
    ...workout,
    Date: { now: () => now },
    AppState: { addEventListener: () => ({ remove() {} }) },
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval: () => {
      tick = null;
    },
    setTimeout: () => 1,
    clearTimeout() {},
  };
  new Script(`${source}\nglobalThis.hook = useTimerLogic;`).runInNewContext(scope);
  const routine = {
    id: 'buffered-resume',
    rounds: 1,
    workSec: 10,
    restSec: 0,
    roundsData: [{ workSong: { uri: 'https://example.org/audio.mp3', platform: 'url' } }],
  };
  function Harness() {
    audio = useAudioController({
      selectedRoutine: routine,
      services: { device: h.service },
      countdownSoundPlayer: { stop: async () => {} },
    });
    timer = scope.hook({
      routine,
      requiresAudio: () => true,
      onPhaseChange: audio.handlePhaseChange,
      onResumeAudio: audio.resumeMusic,
      onStateChange: (next) => {
        if (next?.status === 'paused') audio.pauseMusic();
      },
    });
    return null;
  }
  let root;
  await act(async () => {
    root = create(React.createElement(Harness));
  });
  t.after(async () => act(async () => root.unmount()));
  await act(async () => timer.start());
  now = 2500;
  await act(async () => tick());
  await act(async () => timer.pause());
  h.buffer(true);
  await act(async () => timer.resume());
  assert.equal(timer.session.audioPending, true);
  now = 4500;
  await act(async () => tick());
  assert.equal(timer.session.remainingMs, 8500);
  h.buffer(false);
  await act(async () => polling.shift()());
  assert.equal(timer.session.audioPending, false);
  now = 5000;
  await act(async () => tick());
  assert.equal(timer.session.remainingMs, 8000);
  await act(async () => audio.stopMusic());
});
