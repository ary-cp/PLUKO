import { useEffect, useState, useCallback } from 'react';
import type { PanelVisibility } from '../types';

const LS_KEY = 'pluko.layout.v1';

const DEFAULTS: PanelVisibility = {
  kpis: true,
  filters: true,
  grid: true,
  departmentChart: true,
  infrastructure: true,
};

const load = (): PanelVisibility => {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
};

export function useLayoutPersistence() {
  const [layout, setLayout] = useState<PanelVisibility>(load);

  useEffect(() => {
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(layout));
    } catch {
      /* quota — ignore */
    }
  }, [layout]);

  const toggle = useCallback((key: keyof PanelVisibility) => {
    setLayout((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const applyPreset = useCallback((next: PanelVisibility) => {
    setLayout(next);
  }, []);

  return { layout, toggle, applyPreset };
}
