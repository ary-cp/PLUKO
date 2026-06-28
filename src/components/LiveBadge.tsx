import { useEffect, useRef } from 'react';
import { engine } from '../store/StateEngine';

/**
 * Live throughput badge — rows ingested per second window.
 * Polls engine.getThroughput() every 500ms, writes via textContent.
 */
export function LiveBadge() {
  const numRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let pulse = 0;
    const tick = () => {
      const rate = engine.getThroughput();
      if (numRef.current) numRef.current.textContent = String(rate);
      if (dotRef.current) {
        // Pulse on each tick
        pulse = (pulse + 1) % 2;
        dotRef.current.style.opacity = pulse === 0 ? '1' : '0.4';
      }
    };
    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, []);

  return (
    <div className="live-badge" aria-label="Live throughput meter">
      <span className="live-badge__dot" ref={dotRef} aria-hidden="true" />
      <span className="live-badge__num" ref={numRef}>0</span>
      <span className="live-badge__unit">rows/s</span>
    </div>
  );
}
