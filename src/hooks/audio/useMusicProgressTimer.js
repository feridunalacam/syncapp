import { useEffect, useRef } from 'react';

/**
 * Smooth, second-by-second progress ticker for the currently playing track.
 *
 * The audio controller polls the music platform every second to keep the
 * displayed track in sync, but the network round-trip is jittery. This
 * timer interpolates between polls so the progress bar moves smoothly.
 *
 * @param {Object} params
 * @param {boolean} params.isMusicPlaying - whether to advance the timer
 * @param {number}  params.trackDurationSec - max value the progress should
 *   not exceed; once reached the timer holds at that value until reset.
 * @param {(updater: (prev:number)=>number) => void} params.onTick - called
 *   every second with a setState-style updater function.
 */
export const useMusicProgressTimer = ({ isMusicPlaying, trackDurationSec, onTick }) => {
  const timerRef = useRef(null);
  // Mirror duration into a ref so a track change doesn't reset the timer
  // (we only want play/pause to drive the interval lifecycle).
  const durationRef = useRef(trackDurationSec || 0);
  useEffect(() => {
    durationRef.current = trackDurationSec || 0;
  }, [trackDurationSec]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (isMusicPlaying) {
      timerRef.current = setInterval(() => {
        onTick((prev) => {
          const max = durationRef.current;
          const next = prev + 1;
          return max > 0 && next >= max ? max : next;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isMusicPlaying, onTick]);
};
