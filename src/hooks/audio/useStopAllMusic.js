import { useCallback } from 'react';

/**
 * Returns a single async `stopAll()` that asks every connected platform
 * (and the optional countdown sound player) to stop playback. Used both
 * by the manual Stop button and by the workout-completed flow so we never
 * leave background audio playing after the timer ends.
 *
 * Designed to be defensive:
 *  - Iterates over services dynamically so newly-added platforms are
 *    automatically picked up without code changes here.
 *  - Each platform stop is wrapped in its own try/catch — a single
 *    failing platform must not block the others from being stopped.
 *  - For platforms that expose `getActiveDevice` we target that device
 *    when pausing; otherwise we issue a generic pause.
 */
export const useStopAllMusic = ({
  services,
  connectedPlatforms,
  refreshToken,
  countdownSoundPlayer,
}) => {
  const stopAll = useCallback(async () => {
    console.log('🛑 stopMusic called');

    const platformIds = Object.keys(services || {});

    for (const platform of platformIds) {
      const service = services?.[platform];
      if (!service?.pause) continue;

      const isLocalPlatform = platform === 'device';
      const token = isLocalPlatform ? 'device' : connectedPlatforms?.[platform]?.accessToken;
      if (!token && !isLocalPlatform) {
        console.log(`🛑 Skipping ${platform} - no token`);
        continue;
      }

      const refreshCb = !isLocalPlatform && refreshToken ? () => refreshToken(platform) : null;

      try {
        console.log(`🛑 Stopping ${platform}...`);
        if (service.getActiveDevice) {
          const deviceId = await service.getActiveDevice(token, refreshCb);
          if (deviceId) {
            const result = await service.pause(token, refreshCb, deviceId);
            console.log(`🛑 ${platform} pause result:`, result);
          } else {
            const result = await service.pause(token, refreshCb);
            console.log(`🛑 ${platform} pause result:`, result);
          }
        } else {
          const result = await service.pause(token, refreshCb);
          console.log(`🛑 ${platform} pause result:`, result);
        }

        if (service.cleanup) {
          await service.cleanup();
        }
      } catch (error) {
        console.error(`🛑 Error stopping ${platform}:`, error);
      }
    }

    if (countdownSoundPlayer) {
      try {
        await countdownSoundPlayer.stop();
        console.log('🛑 Countdown sound player stopped');
      } catch (error) {
        console.error('🛑 Error stopping countdown player:', error);
      }
    }

    console.log('🛑 stopMusic completed');
  }, [services, connectedPlatforms, refreshToken, countdownSoundPlayer]);

  return stopAll;
};
