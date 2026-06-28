import { useEffect, useRef, useState } from 'react';
import { engine } from '../store/StateEngine';

export function SearchBox() {
  const [value, setValue] = useState(engine.getSearch());
  const debounceRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      engine.setSearch(value);
    }, 80);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        if (e.key === 'Escape' && document.activeElement === inputRef.current) {
          inputRef.current?.blur();
        }
        return;
      }
      
      if (e.key === '/') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="search">
      <svg className="search__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="search"
        placeholder="Fuzzy search · project, company, partner, country"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-label="Search projects"
      />
    </div>
  );
}
