import { useEffect, useState, useRef } from 'react';
import { engine } from '../store/StateEngine';

type Command = {
  id: string;
  label: string;
  action: () => void;
  icon: string;
};

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const [isPaused, setIsPaused] = useState(engine.isPaused());

  useEffect(() => {
    const unsub = engine.subscribeKpi(() => setIsPaused(engine.isPaused()));
    return unsub;
  }, []);

  const commands: Command[] = [
    {
      id: 'pause-play',
      label: isPaused ? 'Resume Data Stream' : 'Pause Data Stream',
      icon: isPaused ? '▶' : '⏸',
      action: () => {
        if (engine.isPaused()) engine.play();
        else engine.pause();
      },
    },
    {
      id: 'clear-filters',
      label: 'Clear All Filters',
      icon: '⌫',
      action: () => engine.clearFilters(),
    },
    {
      id: 'focus-mode',
      label: 'Toggle Focus Mode (NOC View)',
      icon: '⛶',
      action: () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
      },
    },
    {
      id: 'export-csv',
      label: 'Export Current View to CSV',
      icon: '⭳',
      action: () => {
        const view = engine.view();
        if (view.length === 0) return;
        const columns = [
          'project_id', 'project_name', 'company_id', 'project_status', 
          'automation_type', 'department', 'industry', 'robots_deployed', 
          'budget_usd', 'annual_savings_usd', 'roi_percent', 'employee_hours_saved'
        ];
        const headerRow = columns.join(',');
        const rows = view.map(row => {
          return columns.map(col => {
            const val = row[col as keyof typeof row];
            if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
            return val;
          }).join(',');
        });
        const csvContent = [headerRow, ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `export_${Date.now()}.csv`;
        link.click();
      },
    },
  ];

  const filteredCommands = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filteredCommands[selectedIndex];
      if (cmd) {
        cmd.action();
        setIsOpen(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="cmd-backdrop" onClick={() => setIsOpen(false)}>
      <div className="cmd-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-header">
          <span className="cmd-prefix">&gt;</span>
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="cmd-body">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, i) => (
              <div
                key={cmd.id}
                className={`cmd-item ${i === selectedIndex ? 'is-selected' : ''}`}
                onClick={() => {
                  cmd.action();
                  setIsOpen(false);
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="cmd-item-icon">{cmd.icon}</span>
                <span className="cmd-item-label">{cmd.label}</span>
              </div>
            ))
          ) : (
            <div className="cmd-empty">No commands found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
