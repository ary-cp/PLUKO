import { useEffect, useRef, useState } from 'react';
import type { PanelVisibility } from '../types';

interface Preset {
  id: string;
  label: string;
  icon: string;
  layout: PanelVisibility;
}

const PRESETS: Preset[] = [
  {
    id: 'default',
    label: 'Default · Full Dashboard',
    icon: '⛶',
    layout: { kpis: true, filters: true, grid: true, departmentChart: true, infrastructure: true },
  },
  {
    id: 'trader',
    label: 'Trader · Numbers Only',
    icon: '$',
    layout: { kpis: true, filters: false, grid: true, departmentChart: false, infrastructure: false },
  },
  {
    id: 'analyst',
    label: 'Analyst · Drill-down',
    icon: '⌕',
    layout: { kpis: false, filters: true, grid: true, departmentChart: true, infrastructure: true },
  },
  {
    id: 'ops',
    label: 'Ops · Alert War-room',
    icon: '⚠',
    layout: { kpis: true, filters: true, grid: true, departmentChart: false, infrastructure: true },
  },
];

interface Props {
  applyPreset: (layout: PanelVisibility) => void;
  current: PanelVisibility;
}

function matchesPreset(current: PanelVisibility, preset: PanelVisibility): boolean {
  return (
    current.kpis === preset.kpis &&
    current.filters === preset.filters &&
    current.grid === preset.grid &&
    current.departmentChart === preset.departmentChart &&
    current.infrastructure === preset.infrastructure
  );
}

export function LayoutPresets({ applyPreset, current }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const active = PRESETS.find((p) => matchesPreset(current, p.layout));

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        className={`dropdown__trigger${active ? ' is-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Apply a workspace preset"
      >
        <span>⊟</span>
        {active ? active.label.split(' · ')[0] : 'Preset'}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="dropdown__panel" role="listbox">
          {PRESETS.map((p) => {
            const isActive = active?.id === p.id;
            return (
              <div
                key={p.id}
                className="dropdown__option"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  applyPreset(p.layout);
                  setOpen(false);
                }}
              >
                <span className="dropdown__checkbox" style={{ background: isActive ? 'var(--accent)' : 'transparent', borderColor: isActive ? 'var(--accent)' : 'var(--border-1)' }}>
                  {isActive ? '✓' : p.icon}
                </span>
                <span>{p.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
