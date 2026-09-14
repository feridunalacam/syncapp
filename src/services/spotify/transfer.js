import { canControlDevice } from './devices.js';
import { runVerifiedCommand } from './commands.js';

/** A deliberate device choice preserves playback; it never starts paused music. */
export async function transferVerifiedPlayback({ deviceId, read, transfer, restore, wait }) {
  const before = await read();
  if (before?.success === false) return before;
  const playing = before?.is_playing === true;
  const result = await runVerifiedCommand({
    deviceId,
    waitForTarget: true,
    send: () => transfer(playing),
    read,
    matches: (state) => state.is_playing === playing,
    wait,
  });
  if (result.success || result.code !== 'PLAYBACK_UNCONFIRMED' || !playing || !before?.item?.uri)
    return result;
  const after = await read();
  if (!canControlDevice(after?.device)) return result;
  const targetEmpty = after.device.id === deviceId && !after.item && after.is_playing === false;
  const sourceUnchanged =
    after.device.id === before.device?.id &&
    after.is_playing === true &&
    (after.item?.uri === before.item.uri || after.item?.linked_from?.uri === before.item.uri);
  // A third device, a new song or a deliberate pause is a newer user choice.
  // Only recover an acknowledged no-op or an empty selected player, once.
  if (!targetEmpty && !sourceUnchanged) return result;
  const recovered = await restore(
    before.item.uri,
    sourceUnchanged ? after.progress_ms || 0 : before.progress_ms || 0,
    before.device?.id,
  );
  if (!recovered.success || !recovered.confirmed || recovered.externalChange) return result;
  return { ...recovered, playback: await read() };
}
