import { useEffect, useRef } from 'react';
import { engine } from '../store/StateEngine';

/**
 * Invisible aria-live region — screenreaders speak each new Failed/negative-ROI alert.
 * Rate-limited to one announcement per 1.5s to avoid screenreader spam.
 */
export function AlertAnnouncer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastAnnounce = 0;
    const unsub = engine.subscribeAlert((row) => {
      const now = performance.now();
      if (now - lastAnnounce < 1500) return;
      lastAnnounce = now;
      if (ref.current) {
        const reason = row.project_status === 'Failed' ? 'project failed' : `negative ROI ${row.roi_percent.toFixed(1)} percent`;
        ref.current.textContent = `Alert. ${row.project_name}. ${reason}.`;
      }
    });
    return unsub;
  }, []);

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        padding: 0,
        margin: -1,
        overflow: 'hidden',
        clip: 'rect(0,0,0,0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    />
  );
}
