import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePlatformContext } from './PlatformContext';
import appleMusicService from '../services/appleMusic';

const Context = createContext({
  available: false,
  connected: false,
  connecting: false,
  ready: false,
});

export function AppleMusicConnectionProvider({ children }) {
  const { ready, connectedPlatforms, connectPlatform, disconnectPlatform, connectionError } =
    usePlatformContext();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const connect = useCallback(async () => {
    if (!ready || pending.current || !appleMusicService.available) return;
    pending.current = true;
    setConnecting(true);
    setError(null);
    try {
      const connection = await appleMusicService.authorize();
      if (alive.current) await connectPlatform('appleMusic', connection);
    } catch (failure) {
      if (alive.current)
        setError(failure.userMessage || 'Apple Music could not connect. Please try again.');
    } finally {
      pending.current = false;
      if (alive.current) setConnecting(false);
    }
  }, [ready, connectPlatform]);
  const disconnect = useCallback(async () => {
    if (pending.current || !appleMusicService.available) return;
    pending.current = true;
    setConnecting(true);
    try {
      await appleMusicService.cleanup();
      if (alive.current) await disconnectPlatform('appleMusic');
      if (alive.current) setError(null);
    } catch {
      if (alive.current) setError('Apple Music could not disconnect. Please try again.');
    } finally {
      pending.current = false;
      if (alive.current) setConnecting(false);
    }
  }, [disconnectPlatform]);
  return (
    <Context.Provider
      value={{
        available: appleMusicService.available,
        ready,
        connected: appleMusicService.available && !!connectedPlatforms.appleMusic?.connected,
        connecting,
        error: appleMusicService.available ? error || connectionError : null,
        connect,
        disconnect,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export const useAppleMusicConnection = () => useContext(Context);
