const stopped = { success: true, cancelled: true };
const failure = () => ({
  success: false,
  error:
    'Spotify accepted the command but did not start this track. Open Spotify on your playback device and try again.',
});

/** A successful HTTP response acknowledges a command; it does not prove playback started. */
export async function startVerifiedTrack({
  uri,
  deviceId,
  positionMs = 0,
  send,
  read,
  lookup,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  isCancelled = () => false,
  preferContext = false,
  previousDeviceId = null,
}) {
  const matches = (p, expected) =>
    p?.device?.id === deviceId &&
    p.is_playing === true &&
    (p.item?.uri === expected || p.item?.linked_from?.uri === expected);
  async function observe(expected) {
    let emptyPlayer = true;
    for (const delay of [350, 650, 1000]) {
      if (isCancelled()) return { cancelled: true };
      await wait(delay);
      if (isCancelled()) return { cancelled: true };
      const state = await read();
      if (state?.success === false) return { failure: state };
      if (state?.device?.id && state.device.id !== deviceId && !state.device.is_restricted) {
        // Explicit transfer may briefly retain the previous device. A different
        // third device still wins: it is a newer user choice, not a retry target.
        if (state.device.id === previousDeviceId) continue;
        return { externalChange: true, deviceId: state.device.id };
      }
      if (matches(state, expected)) return { confirmed: true };
      emptyPlayer =
        emptyPlayer &&
        state?.device?.id === deviceId &&
        !state.device.is_restricted &&
        state.is_playing === false &&
        !state.item;
    }
    return { emptyPlayer };
  }

  if (isCancelled()) return stopped;
  if (!preferContext) {
    const accepted = await send({ uris: [uri], position_ms: positionMs });
    if (accepted?.success === false) return accepted;
    const result = await observe(uri);
    if (result.cancelled) return stopped;
    if (result.failure) return result.failure;
    if (result.externalChange) return { success: true, confirmed: false, ...result };
    if (result.confirmed) return { success: true, confirmed: true, strategy: 'track' };
    // Recover an acknowledged command that leaves the selected controllable player empty.
    // This is a runtime capability decision, independent of OS, manufacturer or device type.
    // Missing state, another active device, or another playing song must not cause a retry.
    if (!result.emptyPlayer) return failure();
  }
  if (isCancelled()) return stopped;
  const track = await lookup(uri);
  if (isCancelled()) return stopped;
  if (!track?.album?.uri || !track?.uri) return failure();
  const accepted = await send({
    context_uri: track.album.uri,
    offset: { uri: track.uri },
    position_ms: positionMs,
  });
  if (accepted?.success === false) return accepted;
  const result = await observe(track.uri);
  if (result.cancelled) return stopped;
  if (result.failure) return result.failure;
  if (result.externalChange) return { success: true, confirmed: false, ...result };
  return result.confirmed ? { success: true, confirmed: true, strategy: 'album' } : failure();
}
