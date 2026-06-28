import { useEffect, useState, useRef } from 'react';

export function PerformanceMonitor() {
  const [fps, setFps] = useState(60);
  const frames = useRef(0);
  const lastTime = useRef(performance.now());

  useEffect(() => {
    let rafId: number;
    const loop = () => {
      frames.current++;
      const now = performance.now();
      if (now - lastTime.current >= 1000) {
        setFps(Math.round((frames.current * 1000) / (now - lastTime.current)));
        frames.current = 0;
        lastTime.current = now;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      title="Real-time UI Render Speed"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--bg-2)',
        padding: '4px 8px',
        borderRadius: '4px',
        border: '1px solid var(--border-1)',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        color: fps >= 50 ? 'var(--positive)' : fps >= 30 ? 'var(--warn)' : 'var(--negative)',
        letterSpacing: '0.05em',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: 'currentColor',
          boxShadow: '0 0 8px currentColor',
        }}
      />
      {fps} FPS
    </div>
  );
}
