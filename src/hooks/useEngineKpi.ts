import { useEffect, useState } from 'react';
import { engine } from '../store/StateEngine';
import type { KpiSnapshot } from '../types';

/**
 * Subscribes the calling component to engine KPI changes.
 * Hard throttle to one update per second — KPI numbers flickering 5x/sec
 * was the dominant source of perceived "blink".
 */
const KPI_UPDATE_MS = 1000;

export function useEngineKpi(): KpiSnapshot {
  const [snap, setSnap] = useState<KpiSnapshot>(() => ({ ...engine.getKpi() }));

  useEffect(() => {
    let lastFlush = 0;
    let timer: number | null = null;

    const flush = () => {
      lastFlush = performance.now();
      timer = null;
      setSnap({ ...engine.getKpi() });
    };

    const tick = () => {
      const now = performance.now();
      const elapsed = now - lastFlush;
      if (elapsed >= KPI_UPDATE_MS) {
        flush();
      } else if (timer === null) {
        // Schedule one update at the next throttle boundary
        timer = window.setTimeout(flush, KPI_UPDATE_MS - elapsed);
      }
    };

    const unsub = engine.subscribeKpi(tick);
    // Initial flush so we don't have to wait 1s for the first paint
    flush();
    return () => {
      unsub();
      if (timer !== null) window.clearTimeout(timer);
    };
  }, []);

  return snap;
}
