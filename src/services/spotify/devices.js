export const canControlDevice = (device) => !!device?.id && device.is_restricted !== true;
export const canControlVolume = (device) =>
  canControlDevice(device) && device.supports_volume !== false;

// Never move playback away from an active device merely because it is restricted.
export async function resolvePlaybackDevice(devices, activate) {
  if (!Array.isArray(devices)) return null;
  const active = devices.find((device) => device?.is_active);
  if (active) return canControlDevice(active) ? active.id : null;

  const candidates = devices.filter(canControlDevice);
  // Multiple idle devices do not imply which one the user wants to hear.
  if (candidates.length !== 1) return null;
  const available = candidates[0];
  const result = await activate(available.id);
  return result?.success === true ? available.id : null;
}
