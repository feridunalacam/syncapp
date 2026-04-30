import { useEffect, useState } from 'react';

/**
 * Resolve the access token for the currently selected music platform.
 *
 * Returns a tuple-style object so the audio controller can clear the
 * displayed track when the user disconnects a platform.
 *
 * Behaviour:
 *  - "device" platform always resolves to the literal token string "device"
 *    (the device service ignores the token; we just need a non-null value
 *    so downstream guards stop short-circuiting).
 *  - For real platforms, we mirror the token from `connectedPlatforms`. If
 *    the platform becomes disconnected we null both the token and the
 *    track so the UI doesn't keep showing stale "now playing" data.
 */
export const usePlatformAccessToken = ({ selectedPlatform, connectedPlatforms, onDisconnect }) => {
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    if (selectedPlatform === 'device') {
      setAccessToken('device');
      return;
    }

    const platformData = connectedPlatforms?.[selectedPlatform];
    if (platformData?.connected && platformData?.accessToken) {
      setAccessToken(platformData.accessToken);
    } else if (!platformData?.connected) {
      setAccessToken(null);
      onDisconnect?.();
    }
  }, [connectedPlatforms, selectedPlatform, onDisconnect]);

  return { accessToken, setAccessToken };
};
