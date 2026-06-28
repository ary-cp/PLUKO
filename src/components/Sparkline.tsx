import { useEffect, useRef } from 'react';

export function Sparkline({ value, color }: { value: number; color: string }) {
  const pathRef = useRef<SVGPathElement>(null);
  // Initialize with the first value so it draws a flat line initially
  const historyRef = useRef<number[]>(Array(24).fill(value));
  // Guards against StrictMode double-invoke pushing the same value twice
  const lastSeenRef = useRef<number>(value);

  useEffect(() => {
    if (value === lastSeenRef.current && historyRef.current.length === 24) {
      return;
    }
    lastSeenRef.current = value;
    const history = historyRef.current;
    history.push(value);
    if (history.length > 24) history.shift();

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < history.length; i++) {
      const v = history[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;

    // Map history to SVG coordinates (width 60, height 20)
    let d = '';
    for (let i = 0; i < history.length; i++) {
      const x = ((i / 23) * 60).toFixed(1);
      const y = (20 - ((history[i] - min) / range) * 20).toFixed(1);
      d += `${i === 0 ? 'M' : 'L'} ${x} ${y} `;
    }

    if (pathRef.current) {
      pathRef.current.setAttribute('d', d);
    }
  }, [value]);

  return (
    <svg width="60" height="20" style={{ overflow: 'visible', flexShrink: 0, opacity: 0.8 }}>
      <path 
        ref={pathRef} 
        fill="none" 
        stroke={color} 
        strokeWidth="1.5" 
        vectorEffect="non-scaling-stroke" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
    </svg>
  );
}
