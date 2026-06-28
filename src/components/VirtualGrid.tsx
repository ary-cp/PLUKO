import { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { engine } from '../store/StateEngine';
import type { RpaRow, SortableColumn } from '../types';
import { formatInt, formatUsd, formatPercent } from '../utils/format';

Chart.register(...registerables);

/**
 * VirtualGrid (Feature 8) — custom row-recycling renderer.
 *
 * Architecture:
 *   - The component renders ONCE per structural change (sort/filter/search).
 *   - On mount it:
 *       1. computes pool size from viewport height
 *       2. pre-allocates fixed <div.grid__row> nodes inside .grid__sizer
 *       3. binds a scroll listener that calls render(startIndex)
 *       4. subscribes to engine row-tick events to live-update only visible rows
 *   - The hot path NEVER calls setState. All updates are textContent mutations
 *     and transform repositions on the existing DOM nodes.
 *
 * Result: a fixed N-node DOM regardless of view-pool size. 60FPS at 500+ rows.
 */

interface ColumnDef {
  key: keyof RpaRow;
  label: string;
  width: number;
  numeric?: boolean;
  format?: (row: RpaRow) => string;
  sortable?: SortableColumn;
  className?: (row: RpaRow) => string;
}

export const COLUMNS: ColumnDef[] = [
  {
    key: 'internal_uid',
    label: '',
    width: 40,
    format: (r) => (engine.isPinned(r.internal_uid) ? '★' : '☆'),
    className: (r) => (engine.isPinned(r.internal_uid) ? 'col-pin is-pinned' : 'col-pin'),
  },
  { key: 'project_id', label: 'Project ID', width: 110 },
  { key: 'project_name', label: 'Project Name', width: 240 },
  { key: 'company_id', label: 'Company', width: 100 },
  {
    key: 'project_status',
    label: 'Status',
    width: 110,
    format: (r) => r.project_status,
  },
  { key: 'automation_type', label: 'Automation', width: 170, sortable: 'automation_type' },
  { key: 'department', label: 'Department', width: 160, sortable: 'department' },
  { key: 'industry', label: 'Industry', width: 200, sortable: 'industry' },
  {
    key: 'robots_deployed',
    label: 'Robots',
    width: 80,
    numeric: true,
    sortable: 'robots_deployed',
    format: (r) => formatInt(r.robots_deployed),
  },
  {
    key: 'budget_usd',
    label: 'Budget',
    width: 130,
    numeric: true,
    sortable: 'budget_usd',
    format: (r) => formatUsd(r.budget_usd),
  },
  {
    key: 'annual_savings_usd',
    label: 'Savings',
    width: 130,
    numeric: true,
    sortable: 'annual_savings_usd',
    format: (r) => formatUsd(r.annual_savings_usd),
  },
  {
    key: 'roi_percent',
    label: 'ROI',
    width: 130,
    numeric: false,
    sortable: 'roi_percent',
    format: (r) => formatPercent(r.roi_percent),
  },
  {
    key: 'employee_hours_saved',
    label: 'Hours Saved',
    width: 120,
    numeric: true,
    sortable: 'employee_hours_saved',
    format: (r) => formatInt(r.employee_hours_saved),
  },
  { key: 'implementation_partner', label: 'Partner', width: 160 },
  { key: 'country', label: 'Country', width: 130 },
  { key: 'ai_enabled', label: 'AI', width: 60 },
  { key: 'cloud_deployment', label: 'Cloud', width: 70 },
];

const BUFFER_ROWS = 6;

export function VirtualGrid() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const emptyRef = useRef<HTMLDivElement>(null);
  const skeletonRef = useRef<HTMLDivElement>(null);
  const rowHeightRef = useRef<number>(32);

  const [hiddenCols, setHiddenCols] = useState(() => engine.getHiddenColumns());

  // Force a re-render when view-pool size changes structurally
  const lastViewLengthRef = useRef<number>(-1);
  const rowNodesRef = useRef<HTMLDivElement[]>([]);
  const rowUidToNodeRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const startIndexRef = useRef<number>(0);
  const visibleCountRef = useRef<number>(0);
  const focusedIndexRef = useRef<number>(-1);

  // Inspector State (Bounty 1)
  const [inspectedRow, setInspectedRow] = useState<RpaRow | null>(null);

  useEffect(() => {
    return engine.subscribeView(() => {
      setHiddenCols(new Set(engine.getHiddenColumns()));
    });
  }, []);

  const activeColumns = COLUMNS.filter(c => !hiddenCols.has(c.key));

  // Close inspector automatically if stream resumes
  useEffect(() => {
    if (!inspectedRow) return;
    const unsub = engine.subscribeKpi(() => {
      if (!engine.isPaused()) setInspectedRow(null);
    });
    return unsub;
  }, [inspectedRow]);

  // Set initial grid template
  useEffect(() => {
    const template = activeColumns.map((c) => `${c.width}px`).join(' ');
    document.documentElement.style.setProperty('--grid-template', template);
  }, [activeColumns]);

  // Double-click to copy (Feature Polish)
  useEffect(() => {
    const sizer = sizerRef.current;
    if (!sizer) return;
    const handleDblClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const cell = target.closest('.grid__cell') as HTMLElement;
      if (!cell || target.closest('.micro-chart') || cell.classList.contains('col-pin')) return;
      
      const text = cell.textContent?.trim();
      if (text) {
        navigator.clipboard.writeText(text);
        cell.classList.add('flash-copy');
        setTimeout(() => cell.classList.remove('flash-copy'), 400);
      }
    };
    sizer.addEventListener('dblclick', handleDblClick);
    return () => sizer.removeEventListener('dblclick', handleDblClick);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current!;
    const sizer = sizerRef.current!;

    const computeVisibleCount = () => {
      const rootStyle = getComputedStyle(document.body);
      rowHeightRef.current = parseInt(rootStyle.getPropertyValue('--row-height').trim(), 10) || 32;
      const h = viewport.clientHeight;
      visibleCountRef.current = Math.ceil(h / rowHeightRef.current) + BUFFER_ROWS;
    };

    const buildRowNodes = () => {
      // Drop everything and rebuild — happens only on resize.
      sizer.innerHTML = '';
      rowNodesRef.current = [];

      for (let i = 0; i < visibleCountRef.current; i++) {
        const row = document.createElement('div');
        row.className = 'grid__row';
        row.style.transform = `translateY(${-9999}px)`;
        for (let c = 0; c < activeColumns.length; c++) {
          const cell = document.createElement('div');
          const col = activeColumns[c];
          cell.className = `grid__cell${col.numeric ? ' grid__cell--num' : ''}`;
          if (col.key === 'internal_uid') {
            cell.style.cursor = 'pointer';
            cell.onclick = (e) => {
              e.stopPropagation();
              const uid = row.dataset.uid;
              if (uid) engine.togglePin(uid);
            };
          } else if (col.key === 'roi_percent') {
            cell.innerHTML = `
              <div class="micro-chart">
                <span class="micro-chart__val"></span>
                <div class="micro-chart__bar-bg">
                  <div class="micro-chart__bar"></div>
                </div>
              </div>
            `;
          } else {
            cell.textContent = '';
          }
          row.appendChild(cell);
        }
        sizer.appendChild(row);
        rowNodesRef.current.push(row);
      }
    };



    // Throttle visible text rewrites so the grid feels calm on the eye.
    // Engine still ingests at 200ms; KPIs/alerts stay live. Cell text on normal
    // rows only repaints every TEXT_THROTTLE_MS. Force-write happens when:
    //   - row is alerted (failed/neg ROI) → instant feedback
    //   - uid changed (scroll/sort/filter) → fresh render
    //   - force=true (passed from renderViewport on structural change)
    const TEXT_THROTTLE_MS = 800;

    const writeRow = (rowEl: HTMLDivElement, dataRow: RpaRow, force = false) => {
      const prevUid = rowEl.dataset.uid;
      rowEl.dataset.uid = dataRow.internal_uid;
      const isSameRow = prevUid === dataRow.internal_uid;

      // Prevent any DOM updates or class toggles while the user is hovering to avoid blinking/flashing
      if (isSameRow && !force && rowEl.matches(':hover')) {
        return;
      }

      if (!isSameRow) {
        rowEl.dataset.lastFlash = '0';
        rowEl.dataset.lastWrite = '0';
        rowEl.classList.remove('is-flash');
      }

      // Toggle Failed row class
      const isFailed = dataRow.project_status === 'Failed' || dataRow.roi_percent < 0;
      const wasFailed = rowEl.classList.contains('is-failed');
      if (isFailed && !wasFailed) rowEl.classList.add('is-failed');
      else if (!isFailed && wasFailed) rowEl.classList.remove('is-failed');

      // Flash if alert was raised for this uid recently
      const alertTime = engine.getAlertTime(dataRow.internal_uid);
      if (alertTime) {
        const lastFlash = Number(rowEl.dataset.lastFlash || 0);
        if (alertTime > lastFlash) {
          rowEl.dataset.lastFlash = String(alertTime);
          // Re-trigger keyframe by toggling class
          rowEl.classList.remove('is-flash');
          // force reflow so the animation restarts even if class persisted
          void rowEl.offsetWidth;
          rowEl.classList.add('is-flash');
        }
      }

      // Throttle gate: skip cell text rewrites unless force/new-row/alerted.
      const now = performance.now();
      const lastWrite = Number(rowEl.dataset.lastWrite || 0);
      const shouldWriteCells =
        force ||
        !isSameRow ||
        isFailed ||
        now - lastWrite >= TEXT_THROTTLE_MS;
      if (!shouldWriteCells) {
        return;
      }
      rowEl.dataset.lastWrite = String(now);

        const cells = rowEl.children;
        for (let c = 0; c < activeColumns.length; c++) {
          const col = activeColumns[c];
          const cell = cells[c] as HTMLDivElement;
          const newClass = `grid__cell${col.numeric ? ' grid__cell--num' : ''}${
            col.className ? ' ' + col.className(dataRow) : ''
          }`;
          if (cell.className !== newClass) cell.className = newClass;

          if (col.key === 'internal_uid') {
            const next = col.format ? col.format(dataRow) : '';
            if (cell.firstChild) {
              if (cell.firstChild.nodeValue !== next) cell.firstChild.nodeValue = next;
            } else {
              cell.appendChild(document.createTextNode(next));
            }
          } else if (col.key === 'project_status') {
            let span = cell.firstElementChild as HTMLSpanElement | null;
            if (!span) {
              span = document.createElement('span');
              cell.appendChild(span);
            }
            const status = dataRow.project_status || '';
            const norm = status.toLowerCase();
            let cls = 'status-pill is-active';
            if (norm === 'failed') cls = 'status-pill is-failed';
            else if (norm === 'completed') cls = 'status-pill is-completed';
            else if (norm === 'pending' || norm === 'paused' || norm === 'on hold') cls = 'status-pill is-pending';
            
            if (span.className !== cls) span.className = cls;
            if (span.textContent !== status) span.textContent = status;
          } else if (col.key === 'roi_percent') {
          const valEl = cell.querySelector('.micro-chart__val') as HTMLSpanElement;
          const barEl = cell.querySelector('.micro-chart__bar') as HTMLDivElement;
          const val = dataRow.roi_percent;
          
          if (isSameRow) {
            const prevVal = Number(cell.dataset.raw);
            // Only flash on SIGNIFICANT changes (>= 1% delta) — telemetry
            // mutates ROI by tiny amounts every tick, which would otherwise
            // flash continuously and look like the value is blinking.
            if (!isNaN(prevVal) && Math.abs(val - prevVal) >= 1) {
              valEl.classList.remove('flash-up', 'flash-down');
              void valEl.offsetWidth;
              valEl.classList.add(val > prevVal ? 'flash-up' : 'flash-down');
              // Auto-clear so a future small change doesn't sit visually "armed"
              window.setTimeout(() => {
                valEl.classList.remove('flash-up', 'flash-down');
              }, 600);
            }
          }
          cell.dataset.raw = String(val);

          const nextText = col.format ? col.format(dataRow) : String(val);
          if (valEl.textContent !== nextText) {
            valEl.textContent = nextText;
            valEl.className = val < 0 ? 'micro-chart__val is-neg' : 'micro-chart__val is-pos';
          }
          const width = Math.min(100, Math.max(2, val / 4));
          barEl.style.width = `${width}%`;
          barEl.style.background = val < 0 ? 'var(--negative)' : val > 100 ? 'var(--positive)' : 'var(--accent)';
        } else {
            const next = col.format
              ? col.format(dataRow)
              : String(dataRow[col.key] ?? '');
            if (cell.firstChild) {
              if (cell.firstChild.nodeValue !== next) cell.firstChild.nodeValue = next;
            } else {
              cell.appendChild(document.createTextNode(next));
            }
          }
      }
    };

    let renderQueued = false;
    const scheduleRender = () => {
      if (renderQueued) return;
      renderQueued = true;
      requestAnimationFrame(() => {
        renderQueued = false;
        
        const el = viewportRef.current;
        const sizer = sizerRef.current;
        if (!el || !sizer) return;
        
        const view = engine.view();
        
        if (view.length === 0) {
          sizer.innerHTML = '';
          sizer.style.height = '0px';
          if (engine.getKpi().totalProcessed === 0) {
             emptyRef.current!.style.display = 'none';
             if (skeletonRef.current) skeletonRef.current.style.display = 'block';
          } else {
             emptyRef.current!.style.display = 'flex';
             if (skeletonRef.current) skeletonRef.current.style.display = 'none';
          }
          return;
        }
        
        emptyRef.current!.style.display = 'none';
        if (skeletonRef.current) skeletonRef.current.style.display = 'none';

        if (view.length !== lastViewLengthRef.current) {
          lastViewLengthRef.current = view.length;
          sizer.style.height = `${view.length * rowHeightRef.current}px`;
        }

        const scrollTop = el.scrollTop;
        const start = Math.max(0, Math.floor(scrollTop / rowHeightRef.current) - Math.floor(BUFFER_ROWS / 2));
        startIndexRef.current = start;

        const nodes = rowNodesRef.current;
        rowUidToNodeRef.current.clear();

        for (let i = 0; i < nodes.length; i++) {
          const dataIdx = start + i;
          const rowEl = nodes[i];
          if (dataIdx >= view.length) {
            rowEl.style.transform = `translateY(-9999px)`;
            continue;
          }
          const dataRow = view[dataIdx];
          rowEl.style.transform = `translateY(${dataIdx * rowHeightRef.current}px)`;
          // Force a full text write on structural renders (scroll/sort/filter)
          writeRow(rowEl, dataRow, true);
          rowUidToNodeRef.current.set(dataRow.internal_uid, rowEl);
          
          // Bonus: Focus state
          if (dataIdx === focusedIndexRef.current) {
            rowEl.classList.add('is-focused');
          } else {
            rowEl.classList.remove('is-focused');
          }
        }
      });
    };

    // Init
    computeVisibleCount();
    buildRowNodes();
    scheduleRender();

    // Scroll listener
    viewport.addEventListener('scroll', scheduleRender, { passive: true });

    // Resize observer
    const ro = new ResizeObserver(() => {
      computeVisibleCount();
      buildRowNodes();
      scheduleRender();
    });
    ro.observe(viewport);

    // Subscribe to engine VIEW changes (sort/filter/search flip + initial hydration)
    const unsubView = engine.subscribeView(scheduleRender);

    // Synchronized batch refresh — ALL visible rows update together every 2s,
    // not per-row at random times. Eliminates the "twitching panel" effect.
    // Engine still ingests at 200ms in the background; KPIs/alerts react live;
    // grid rows just paint a coherent snapshot at a steady rhythm.
    const SYNC_REFRESH_MS = 2000;
    const syncRefreshId = window.setInterval(() => {
      if (engine.isPaused()) return; // No refresh while paused
      scheduleRender();
    }, SYNC_REFRESH_MS);

    // Listen for alert transitions so newly-failed rows flash immediately
    // (without waiting for the next 2s sync tick).
    const unsubAlert = engine.subscribeAlert((row) => {
      const node = rowUidToNodeRef.current.get(row.internal_uid);
      if (node && !node.matches(':hover')) writeRow(node, row, true);
    });

    // Row Click Listener (Bounty 1)
    const handleSizerClick = (e: MouseEvent) => {
      if (!engine.isPaused()) return;
      const target = e.target as HTMLElement;
      const rowEl = target.closest('.grid__row') as HTMLDivElement | null;
      if (!rowEl) return;
      
      const nodes = rowNodesRef.current;
      const index = nodes.indexOf(rowEl);
      if (index === -1) return;
      
      const dataIdx = startIndexRef.current + index;
      const view = engine.view();
      if (dataIdx >= 0 && dataIdx < view.length) {
        focusedIndexRef.current = dataIdx;
        scheduleRender();
        setInspectedRow(view[dataIdx]);
      }
    };
    sizer.addEventListener('click', handleSizerClick);

    // Keyboard Navigation (Bonus)
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!engine.isPaused()) return;
      if (inspectedRow) return; // don't navigate if inspector is open
      const view = engine.view();
      if (view.length === 0) return;

      let nextIndex = focusedIndexRef.current;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        nextIndex = nextIndex === -1 ? 0 : Math.min(view.length - 1, nextIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        nextIndex = nextIndex === -1 ? view.length - 1 : Math.max(0, nextIndex - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (nextIndex >= 0 && nextIndex < view.length) {
          setInspectedRow(view[nextIndex]);
        }
        return;
      } else {
        return;
      }

      if (nextIndex !== focusedIndexRef.current) {
        focusedIndexRef.current = nextIndex;
        
        // Scroll into view if needed
        const rowTop = nextIndex * rowHeightRef.current;
        const rowBottom = rowTop + rowHeightRef.current;
        const viewTop = viewport.scrollTop;
        const viewBottom = viewTop + viewport.clientHeight;
        
        if (rowBottom > viewBottom) {
          viewport.scrollTop = rowBottom - viewport.clientHeight;
        } else if (rowTop < viewTop) {
          viewport.scrollTop = rowTop;
        }
        
        scheduleRender();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      viewport.removeEventListener('scroll', scheduleRender);
      sizer.removeEventListener('click', handleSizerClick);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      ro.disconnect();
      unsubView();
      unsubAlert();
      window.clearInterval(syncRefreshId);
    };
  }, [activeColumns]);

  // Static header — sortable. Re-renders only when sort stack changes.
  return (
    <div className="grid" aria-label="RPA telemetry grid">
      <GridHeader activeColumns={activeColumns} />
      <div className="grid__viewport" ref={viewportRef}>
        <div className="grid__sizer" ref={sizerRef} />
      </div>
      <PauseOverlay />
      
      <div className="grid-skeleton" ref={skeletonRef} style={{ display: 'none', position: 'absolute', top: '32px', left: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 5 }}>
        {Array.from({ length: 25 }).map((_, i) => (
          <div key={i} className="grid__row" style={{ transform: `translateY(${i * 32}px)`, opacity: Math.max(0.1, 1 - (i * 0.05)), borderBottom: '1px solid var(--border)' }}>
            {activeColumns.map(c => (
              <div key={c.key} className="grid__cell" style={{ display: 'flex', alignItems: 'center', justifyContent: c.numeric ? 'flex-end' : 'flex-start' }}>
                 <div className="skeleton-pulse" style={{ width: c.key === 'internal_uid' ? '60%' : '80%', height: '12px', background: 'var(--bg-3)', borderRadius: '2px' }} />
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="empty" ref={emptyRef} style={{ display: 'none' }}>
        <div className="empty__title">No matching rows</div>
        <div className="empty__sub">Clear filters or adjust the search query.</div>
      </div>
      {inspectedRow && <InspectorPanel row={inspectedRow} onClose={() => setInspectedRow(null)} />}
    </div>
  );
}

function GridHeader({ activeColumns }: { activeColumns: ColumnDef[] }) {
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const renderHeader = () => {
      const el = headerRef.current;
      if (!el) return;
      const stack = engine.getSortStack();
      const cells = el.children;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i] as HTMLDivElement;
        const colKey = cell.dataset.col;
        const sortIdx = stack.findIndex((s) => s.column === colKey);
        const mark = cell.querySelector('.grid__sort-mark') as HTMLElement | null;
        cell.classList.toggle('is-sorted', sortIdx !== -1);
        if (mark) {
          if (sortIdx === -1) mark.textContent = '';
          else {
            const dir = stack[sortIdx].direction === 'asc' ? '▲' : '▼';
            mark.textContent = stack.length > 1 ? `${dir} ${sortIdx + 1}` : dir;
          }
        }
      }
    };
    renderHeader();
    const unsub = engine.subscribeView(renderHeader);
    return unsub;
  }, []);

  const handleClick = (col: ColumnDef, shift: boolean) => {
    if (!col.sortable) return;
    if (shift) {
      engine.toggleMultiSort(col.sortable);
    } else {
      const stack = engine.getSortStack();
      const current = stack.find((s) => s.column === col.sortable);
      if (!current) {
        engine.setSingleSort({ column: col.sortable, direction: 'asc' });
      } else if (current.direction === 'asc') {
        engine.setSingleSort({ column: col.sortable, direction: 'desc' });
      } else {
        engine.setSingleSort(null);
      }
    }
  };

  const handleResizeStart = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const startX = e.pageX;
    const colDef = activeColumns[index];
    const startWidth = colDef.width;
    const resizer = e.target as HTMLDivElement;
    resizer.classList.add('is-resizing');

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.pageX - startX;
      const newWidth = Math.max(50, startWidth + delta);
      colDef.width = newWidth;
      const template = activeColumns.map((c) => `${c.width}px`).join(' ');
      document.documentElement.style.setProperty('--grid-template', template);
    };

    const handleMouseUp = () => {
      resizer.classList.remove('is-resizing');
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="grid__header" ref={headerRef}>
      {activeColumns.map((col, i) => (
        <div
          key={col.key}
          data-col={col.sortable || ''}
          className={`grid__th${col.numeric ? ' grid__th--num' : ''}${
            col.sortable ? ' is-sortable' : ''
          }`}
          onClick={(e) => handleClick(col, e.shiftKey)}
          title={col.sortable ? 'Click to sort · Shift+Click for multi-sort' : col.label}
          style={{ position: 'relative' }}
        >
          {col.label}
          {col.sortable && <span className="grid__sort-mark" />}
          <div
            className="grid__resizer"
            onMouseDown={(e) => handleResizeStart(e, i)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ))}
    </div>
  );
}

function PauseOverlay() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => {
      const el = ref.current;
      if (!el) return;
      el.style.display = engine.isPaused() ? 'flex' : 'none';
      const sub = el.querySelector('[data-pending]') as HTMLElement | null;
      if (sub) sub.textContent = String(engine.pendingCount());
    };
    refresh();
    const unsub = engine.subscribeKpi(refresh);
    const id = setInterval(refresh, 500);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);

  return (
    <div className="pause-overlay" ref={ref} style={{ display: 'none' }}>
      <div className="pause-overlay__content" onClick={() => engine.play()}>
        <div className="pause-overlay__title">▌▌ STREAM PAUSED</div>
        <div className="pause-overlay__sub">
          Buffered updates: <span data-pending>0</span> · click to resume
        </div>
      </div>
    </div>
  );
}

function InspectorPanel({ row, onClose }: { row: RpaRow; onClose: () => void }) {
  // Prevent closing when clicking inside the panel
  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Seeded pseudo-random generator to create a stable mock history per row
    let seed = 0;
    for (let i = 0; i < row.project_id.length; i++) {
      seed += row.project_id.charCodeAt(i);
    }
    const random = () => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    const dataPoints = [];
    let currentVal = row.roi_percent - 50 + (random() * 20); 
    for (let i = 0; i < 19; i++) {
      dataPoints.push(currentVal);
      currentVal += (random() - 0.4) * 10;
    }
    dataPoints.push(row.roi_percent);

    const ctx = canvasRef.current.getContext('2d');
    let gradient: string | CanvasGradient = 'rgba(139, 92, 246, 0.5)';
    if (ctx) {
      gradient = ctx.createLinearGradient(0, 0, 0, 100);
      gradient.addColorStop(0, 'rgba(167, 139, 250, 0.4)');
      gradient.addColorStop(1, 'rgba(124, 58, 237, 0.0)');
    }

    const chart = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: Array(20).fill(''),
        datasets: [{
          data: dataPoints,
          borderColor: '#a78bfa',
          borderWidth: 2,
          backgroundColor: gradient as any,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        animation: { duration: 800, easing: 'easeOutQuart' }
      }
    });

    return () => chart.destroy();
  }, [row]);

  const fields = [
    { label: 'Project ID', value: row.project_id },
    { label: 'Project Name', value: row.project_name },
    { label: 'Company ID', value: row.company_id },
    { label: 'Status', value: row.project_status, isStatus: true },
    { label: 'Automation Type', value: row.automation_type },
    { label: 'Department', value: row.department },
    { label: 'Industry', value: row.industry },
    { label: 'Robots Deployed', value: formatInt(row.robots_deployed) },
    { label: 'Budget', value: formatUsd(row.budget_usd) },
    { label: 'Annual Savings', value: formatUsd(row.annual_savings_usd) },
    { label: 'ROI', value: formatPercent(row.roi_percent), isRoi: true },
    { label: 'Hours Saved', value: formatInt(row.employee_hours_saved) },
    { label: 'Partner', value: row.implementation_partner },
    { label: 'Country', value: row.country },
    { label: 'AI Enabled', value: row.ai_enabled || 'No' },
    { label: 'Cloud Deployment', value: row.cloud_deployment || 'No' },
  ];

  // Helper for status classes
  const getStatusClass = (status: string) => {
    const norm = (status || '').toLowerCase();
    if (norm === 'failed') return 'is-failed';
    if (norm === 'completed') return 'is-completed';
    if (norm === 'pending' || norm === 'paused' || norm === 'on hold') return 'is-pending';
    return 'is-active';
  };

  return (
    <div className="inspector-drawer" onClick={handleContentClick}>
      <div className="inspector-drawer__header">
        <div className="inspector-drawer__title">
          <span className="inspector-drawer__icon">⛁</span>
          Telemetry Inspector
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="btn" onClick={() => navigator.clipboard.writeText(JSON.stringify(row, null, 2))} title="Copy as JSON" style={{ padding: '0 8px', fontSize: '10px' }}>
            {'{ }'} Copy JSON
          </button>
          <button className="inspector-drawer__close" onClick={onClose}>×</button>
        </div>
      </div>
      
      <div className="inspector-drawer__body">
        <div className="inspector-drawer__hero">
          <div className="inspector-drawer__hero-id">{row.project_id}</div>
          <div className="inspector-drawer__hero-name">{row.project_name}</div>
          <div className="inspector-drawer__sparkline" style={{ height: '80px', marginTop: '16px' }}>
            <canvas ref={canvasRef}></canvas>
          </div>
        </div>
        
        <div className="inspector-drawer__grid">
          {fields.map((f, i) => (
            <div key={i} className="inspector-drawer__field">
              <div className="inspector-drawer__label">{f.label}</div>
              <div className="inspector-drawer__value">
                {f.isStatus ? (
                  <span className={`status-pill ${getStatusClass(row.project_status)}`}>{f.value}</span>
                ) : f.isRoi ? (
                  <span className={row.roi_percent < 0 ? 'color-neg' : 'color-pos'}>{f.value}</span>
                ) : (
                  f.value
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
