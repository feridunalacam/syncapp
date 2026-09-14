import { canControlDevice } from './devices.js';

/** Follow Spotify's active device, not a remembered OS or physical device. */
export async function runVerifiedCommand({
  send,
  read,
  deviceId,
  matches,
  followDeviceChanges = false,
  waitForTarget = false,
  skipIfAlreadyApplied = false,
  isCancelled = () => false,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const cancelled = () => ({ success: true, cancelled: true });
  const unavailable = () => ({
    success: false,
    code: 'DEVICE_RESTRICTED',
    error: 'Spotify is not allowing playback controls on this device.',
  });
  const confirmed = (state) => ({
    success: true,
    confirmed: true,
    playback: state,
    deviceId: state.device.id,
  });
  let target = deviceId;
  if (isCancelled()) return cancelled();
  if (followDeviceChanges) {
    const before = await read();
    if (before?.success === false) return before;
    if (before?.device?.id) {
      if (!canControlDevice(before.device)) return unavailable();
      target = before.device.id;
      if (skipIfAlreadyApplied && matches(before)) return confirmed(before);
    }
  }
  // A transfer may happen between preflight and acknowledgement. Follow it once,
  // then yield control rather than chase a device that is repeatedly changing.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (isCancelled()) return cancelled();
    const accepted = await send(target);
    if (accepted?.success === false) {
      // A device can disappear between preflight and the command. Retry only a
      // confirmed new controllable device, once; do not retry account/network errors.
      if (followDeviceChanges && attempt === 0 && [403, 404].includes(accepted.code)) {
        const current = await read();
        if (current?.success === false) return current;
        if (canControlDevice(current?.device) && current.device.id !== target) {
          target = current.device.id;
          if (matches(current)) return confirmed(current);
          continue;
        }
      }
      return accepted;
    }
    let transferred = false;
    for (const delay of [350, 650, 1000]) {
      if (isCancelled()) return cancelled();
      await wait(delay);
      if (isCancelled()) return cancelled();
      const state = await read();
      if (state?.success === false) return state;
      if (!state?.device?.id) continue;
      if (!canControlDevice(state.device)) return unavailable();
      if (state.device.id !== target) {
        if (waitForTarget) continue;
        if (!followDeviceChanges)
          return {
            success: false,
            code: 'DEVICE_CHANGED',
            error: 'Spotify playback moved to another device.',
          };
        target = state.device.id;
        if (matches(state)) return confirmed(state);
        transferred = true;
        break;
      }
      if (matches(state)) return confirmed(state);
    }
    if (!transferred) break;
  }
  return {
    success: false,
    code: 'PLAYBACK_UNCONFIRMED',
    error: 'Waiting for Spotify playback to settle. Try again once your playback device is ready.',
  };
}
