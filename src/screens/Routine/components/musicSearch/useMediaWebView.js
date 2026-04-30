import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_BROWSER_URL } from './constants';

/**
 * Manages the embedded WebView used to "browse a sound site, then add a
 * track" inside the music search modal.
 *
 * Owns:
 *  - the current URL the WebView should display,
 *  - the list of media files the injected detection script has surfaced,
 *  - a poll interval that re-runs the detection script as the page mutates,
 *  - lifecycle cleanup so we never leave intervals running after close.
 *
 * @param {Object} params
 * @param {boolean} params.active - whether the host modal is visible. The
 *   poll interval pauses (and is cleaned up) when the modal closes.
 */
export const useMediaWebView = ({ active }) => {
  const webViewRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const [browserUrl, setBrowserUrl] = useState(DEFAULT_BROWSER_URL);
  const [detectedMedia, setDetectedMedia] = useState([]);

  const handleWebViewMessage = useCallback((event) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.type === 'media') {
        setDetectedMedia(message.data || []);
      }
    } catch {
      // Ignore malformed messages — page can post anything via postMessage.
    }
  }, []);

  /** Reset to the default bookmark and clear results. */
  const resetBrowser = useCallback(() => {
    setBrowserUrl(DEFAULT_BROWSER_URL);
    setDetectedMedia([]);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  }, []);

  // Whenever the host modal closes, make sure we never leave the periodic
  // detection script running in the background.
  useEffect(() => {
    if (!active && scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [active]);

  return {
    webViewRef,
    scanIntervalRef,
    browserUrl,
    setBrowserUrl,
    detectedMedia,
    setDetectedMedia,
    handleWebViewMessage,
    resetBrowser,
  };
};
