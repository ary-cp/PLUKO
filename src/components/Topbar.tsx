import { useEffect, useState } from 'react';
import { engine } from '../store/StateEngine';
import { PerformanceMonitor } from './PerformanceMonitor';

export function Topbar() {
  const [paused, setPaused] = useState(engine.isPaused());
  const [kpi, setKpi] = useState(engine.getKpi());

  useEffect(() => {
    let lastSnap = engine.getKpi();
    let lastFlush = 0;
    const FLUSH_MS = 1000; // Throttle topbar updates to 1Hz to kill blinking text

    const apply = () => {
      const nextPaused = engine.isPaused();
      // Pause flag toggle: only setState if actually changed (avoids re-render
      // of the whole topbar 5x/sec while stream ticks).
      setPaused((prev) => (prev === nextPaused ? prev : nextPaused));
      document.body.classList.toggle('is-stream-paused', nextPaused);

      const now = performance.now();
      if (now - lastFlush < FLUSH_MS) return;

      const k = engine.getKpi();
      // Bail if counts (the only fields shown in topbar) haven't changed
      if (
        k.failedCount === lastSnap.failedCount &&
        k.negativeRoiCount === lastSnap.negativeRoiCount
      ) {
        return;
      }
      lastSnap = k;
      lastFlush = now;
      setKpi({ ...k });
    };
    apply();
    lastFlush = performance.now();
    const unsub = engine.subscribeKpi(apply);
    return unsub;
  }, []);

  return (
    <header className="shell__topbar">
      <div className="shell__brand">
        <span className="shell__brand-mark">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
        </span>
        <span>PLUKO</span>
      </div>
      <span className="shell__title">High-Density Enterprise RPA Monitor</span>
      <div className="shell__topbar-spacer" />
      <PerformanceMonitor />
      <div className="shell__status" style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--text-2)' }}>
          {kpi.failedCount > 0 && <span style={{ color: 'var(--negative)' }}>{kpi.failedCount} Failed</span>}
          {kpi.negativeRoiCount > 0 && <span style={{ color: 'var(--warn)' }}>{kpi.negativeRoiCount} Neg ROI</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className={`shell__status-dot${paused ? ' shell__status-dot--paused' : ''}`}
            aria-hidden="true"
          />
          {paused ? 'Buffering · UI Locked' : 'Live · 200 ms tick'}
        </div>
      </div>
    </header>
  );
}
