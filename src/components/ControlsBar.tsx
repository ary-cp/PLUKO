import { useEffect, useState, useRef } from 'react';
import { engine } from '../store/StateEngine';
import type { CategoricalField, PanelVisibility } from '../types';
import { CategoryDropdown } from './CategoryDropdown';
import { SearchBox } from './SearchBox';
import { COLUMNS } from './VirtualGrid';
import { exportSnapshotCsv } from '../lib/exportCsv';

interface Props {
  layout: PanelVisibility;
  toggleLayout: (key: keyof PanelVisibility) => void;
  applyPreset: (layout: PanelVisibility) => void;
  onToggleAnalytics: () => void;
}

const PANEL_LABELS: Array<{ key: keyof PanelVisibility; label: string }> = [
  { key: 'kpis', label: 'KPIs' },
  { key: 'filters', label: 'Filters' },
  { key: 'grid', label: 'Grid' },
  { key: 'departmentChart', label: 'Dept Chart' },
  { key: 'infrastructure', label: 'Infra' },
];

const CATEGORICAL_FIELDS: Array<{ field: CategoricalField; label: string }> = [
  { field: 'automation_type', label: 'Automation Type' },
  { field: 'department', label: 'Department' },
  { field: 'industry', label: 'Industry' },
];

export function ControlsBar({ layout, toggleLayout, applyPreset, onToggleAnalytics }: Props) {
  const [paused, setPaused] = useState(engine.isPaused());
  const [pending, setPending] = useState(0);
  const [density, setDensity] = useState('comfortable');
  const [filterStats, setFilterStats] = useState({ count: 0, rows: 0 });

  useEffect(() => {
    const updateStats = () => {
      const filters = engine.getActiveFilters();
      let count = 0;
      for (const k in filters) count += filters[k as CategoricalField].size;
      const nextRows = engine.view().length;
      // Bail if nothing changed — avoid re-rendering the entire controls bar
      // 5x/sec on every ingest batch.
      setFilterStats((prev) =>
        prev.count === count && prev.rows === nextRows ? prev : { count, rows: nextRows }
      );
    };
    updateStats();
    // Throttle: only check stats every 1s, not on every 200ms view tick.
    let lastRun = performance.now();
    const onTick = () => {
      const now = performance.now();
      if (now - lastRun > 1000) {
        lastRun = now;
        updateStats();
      }
    };
    return engine.subscribeView(onTick);
  }, []);

  useEffect(() => {
    const tick = () => {
      setPaused(engine.isPaused());
      setPending(engine.pendingCount());
    };
    const unsub = engine.subscribeKpi(tick);
    const id = setInterval(tick, 500);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);

  const toggleDensity = () => {
    const modes = ['compact', 'comfortable', 'spacious'];
    const next = modes[(modes.indexOf(density) + 1) % modes.length];
    setDensity(next);
    document.body.classList.remove('density-compact', 'density-comfortable', 'density-spacious');
    document.body.classList.add(`density-${next}`);
    
    // Allow DOM to update classes before triggering layout recalculation
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
    });
  };

  const handlePauseToggle = () => {
    if (engine.isPaused()) engine.play();
    else engine.pause();
  };

  const handleExport = () => {
    exportSnapshotCsv();
  };

  return (
    <section className="controls" aria-label="Pipeline controls">
      <div className="controls__group">
        <button
          className={`btn ${paused ? 'is-paused' : 'is-primary'}`}
          onClick={handlePauseToggle}
          aria-pressed={paused}
        >
          {paused ? `▶ Resume (${pending} queued)` : '⏸ Pause Stream'}
        </button>
        <button className="btn" onClick={handleExport} title="Download current view as CSV">
          ⭳ CSV
        </button>
        <ColumnsDropdown />
        {paused && (
          <button className="btn is-accent" onClick={onToggleAnalytics} title="Open Analytics View (Task 2)">
            Analytics View
          </button>
        )}
        <button className="btn" onClick={toggleDensity} title={`Toggle Density (current: ${density})`}>
          ↕ {density.charAt(0).toUpperCase() + density.slice(1)}
        </button>
      </div>

      {layout.filters && (
        <div className="controls__group">
          {CATEGORICAL_FIELDS.map(({ field, label }) => (
            <CategoryDropdown key={field} field={field} label={label} />
          ))}
          {filterStats.count > 0 && (
            <span style={{ fontSize: '11px', color: 'var(--text-2)', padding: '0 8px', whiteSpace: 'nowrap' }}>
              {filterStats.count} filter{filterStats.count > 1 ? 's' : ''} selected · {filterStats.rows.toLocaleString()} rows
            </span>
          )}
          <button
            className="btn"
            onClick={() => engine.clearFilters()}
            title="Clear all categorical filters"
          >
            Clear
          </button>
        </div>
      )}

      <SearchBox />

      <div className="controls__group controls-presets">
        <button className="btn" onClick={() => applyPreset({ kpis: true, filters: true, grid: true, departmentChart: false, infrastructure: false })}>ANALYST</button>
        <button className="btn" onClick={() => applyPreset({ kpis: true, filters: false, grid: true, departmentChart: true, infrastructure: false })}>TRADER</button>
        <button className="btn" onClick={() => applyPreset({ kpis: false, filters: true, grid: false, departmentChart: true, infrastructure: true })}>OPS</button>
      </div>

      <div className="controls__group layout-toggle" aria-label="Panel visibility">
        {PANEL_LABELS.map(({ key, label }) => (
          <button
            key={key}
            className={`layout-toggle__chip ${layout[key] ? 'is-on' : ''}`}
            onClick={() => toggleLayout(key)}
            aria-pressed={layout[key]}
          >
            {layout[key] ? '◉' : '○'} {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function ColumnsDropdown() {
  const [open, setOpen] = useState(false);
  const [hiddenCols, setHiddenCols] = useState(() => engine.getHiddenColumns());

  useEffect(() => {
    return engine.subscribeView(() => {
      setHiddenCols(new Set(engine.getHiddenColumns()));
    });
  }, []);

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="filter-dropdown" ref={ref}>
      <button className={`btn${open ? ' is-active' : ''}`} onClick={() => setOpen(!open)} title="Show or hide columns">
        Columns
      </button>
      {open && (
        <div className="filter-dropdown__menu">
          {COLUMNS.map((col) => {
            if (col.key === 'internal_uid') return null;
            const isHidden = hiddenCols.has(col.key as string);
            return (
              <label key={col.key} className="filter-dropdown__item">
                <input
                  type="checkbox"
                  checked={!isHidden}
                  onChange={() => engine.toggleColumnVisibility(col.key as string)}
                />
                {col.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
