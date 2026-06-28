import { useEffect, useRef, useState } from 'react';
import { engine } from '../store/StateEngine';
import type { CategoricalField } from '../types';

interface Props {
  field: CategoricalField;
  label: string;
}

export function CategoryDropdown({ field, label }: Props) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [activeSet, setActiveSet] = useState<Set<string>>(
    new Set(engine.getActiveFilters()[field])
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => {
      setOptions(engine.getDistinctValues(field));
      setActiveSet(new Set(engine.getActiveFilters()[field]));
    };
    refresh();
    const unsub = engine.subscribeView(refresh);
    return () => unsub();
  }, [field]);

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

  const handleToggle = (value: string) => {
    engine.toggleFilterValue(field, value);
    setActiveSet(new Set(engine.getActiveFilters()[field]));
  };

  return (
    <div className="dropdown" ref={rootRef}>
      <button
        className={`dropdown__trigger ${activeSet.size > 0 ? 'is-active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}
        {activeSet.size > 0 && <span className="dropdown__count">{activeSet.size}</span>}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="dropdown__panel" role="listbox">
          {options.length === 0 && (
            <div className="dropdown__option" style={{ color: 'var(--text-3)' }}>
              Loading options…
            </div>
          )}
          {options.map((opt) => {
            const checked = activeSet.has(opt);
            return (
              <div
                key={opt}
                className="dropdown__option"
                role="option"
                aria-selected={checked}
                onClick={() => handleToggle(opt)}
              >
                <span className={`dropdown__checkbox${checked ? ' is-checked' : ''}`}>
                  {checked ? '✓' : ''}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
