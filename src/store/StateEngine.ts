import type {
  RpaRow,
  SortKey,
  FilterState,
  CategoricalField,
  KpiSnapshot,
} from '../types';

type Listener = () => void;
type RowListener = (row: RpaRow) => void;
type AlertListener = (row: RpaRow) => void;

/**
 * StateEngine
 * ─────────────────────────────────────────────────────────────────────────
 * Single source of truth for all RPA telemetry.
 * Lives OUTSIDE React. React only reads via subscribe() in the shell;
 * the streaming grid reads view() directly via ref and mutates DOM by hand.
 *
 * Pause/Play (Feature 5): when paused, incoming batches are buffered into
 * pendingBatches but the row map IS still mutated, just no subscriber
 * notifications fire — so the UI freezes while background state keeps
 * capturing. On play, we flush by firing a single notify().
 */
export class StateEngine {
  // Master pool — every row, keyed by internal_uid for O(1) upsert.
  private pool: Map<string, RpaRow> = new Map();

  // Derived view-pool — sorted + filtered + searched. Recomputed lazily.
  private viewCache: RpaRow[] = [];
  private viewDirty = true;

  // KPI running totals — accumulated as batches arrive.
  private kpi: KpiSnapshot = { totalProcessed: 0, activeRobots: 0, globalSavings: 0, failedCount: 0, negativeRoiCount: 0 };

  // Pause / Play (Feature 5)
  private paused = false;
  private pendingBatchCount = 0; // for the Pause overlay

  // Sort + Filter + Search controls (Features 4, 7, 9, 10)
  private sortStack: SortKey[] = [];
  private filters: FilterState = {
    automation_type: new Set(),
    department: new Set(),
    industry: new Set(),
  };
  private searchQuery = '';
  private searchTokens: string[] = [];

  // Alert tracking (Feature 3) — uid -> timestamp when alert was raised
  private alerts: Map<string, number> = new Map();

  // Throughput meter — count of rows ingested per second window
  private tickWindow: number[] = []; // timestamps of last 1s of row arrivals

  // Subscribers
  private viewListeners: Set<Listener> = new Set();
  private optionListeners: Set<Listener> = new Set();
  private kpiListeners: Set<Listener> = new Set();
  private rowListeners: Set<RowListener> = new Set();
  private alertListeners: Set<AlertListener> = new Set();

  private pinnedRows: Set<string> = new Set();
  private hiddenColumns: Set<string> = new Set();

  constructor() {
    this.initFromUrl();
    this.initBookmarks();
    this.initHiddenColumns();
  }

  private initHiddenColumns(): void {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('rpa_hidden_cols');
        if (stored) {
          const arr = JSON.parse(stored);
          if (Array.isArray(arr)) {
            this.hiddenColumns = new Set(arr);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load hidden columns', e);
    }
  }

  // ── Column Visibility (Feature Mid-Tier) ─────────────────────────────────
  toggleColumnVisibility(colKey: string): void {
    if (this.hiddenColumns.has(colKey)) {
      this.hiddenColumns.delete(colKey);
    } else {
      this.hiddenColumns.add(colKey);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem('rpa_hidden_cols', JSON.stringify(Array.from(this.hiddenColumns)));
    }
    this.viewDirty = true;
    this.notifyView();
  }

  getHiddenColumns(): Set<string> {
    return this.hiddenColumns;
  }

  private initBookmarks(): void {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('rpa_bookmarks');
        if (stored) {
          const arr = JSON.parse(stored);
          if (Array.isArray(arr)) {
            this.pinnedRows = new Set(arr);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load bookmarks', e);
    }
  }

  // ── Bookmarks / Pins (Feature 5) ─────────────────────────────────────────
  private pinPersistScheduled = false;

  togglePin(uid: string): void {
    if (this.pinnedRows.has(uid)) {
      this.pinnedRows.delete(uid);
    } else {
      this.pinnedRows.add(uid);
    }

    // Visually update ONLY the star on the clicked row — instant feedback.
    const row = this.pool.get(uid);
    if (row) {
      for (const fn of this.rowListeners) fn(row);
    }

    // Defer the heavy stuff (localStorage I/O + grid resort) off the click path.
    // Coalesces multiple rapid pins into one persist.
    if (!this.pinPersistScheduled) {
      this.pinPersistScheduled = true;
      const persist = () => {
        this.pinPersistScheduled = false;
        try {
          localStorage.setItem('rpa_bookmarks', JSON.stringify(Array.from(this.pinnedRows)));
        } catch {
          /* quota — ignore */
        }
        this.viewDirty = true;
        this.notifyView();
      };
      // Prefer idle callback; fall back to a short timeout
      const ric = (window as typeof window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      if (typeof ric === 'function') {
        ric(persist, { timeout: 600 });
      } else {
        setTimeout(persist, 600);
      }
    }
  }

  isPinned(uid: string): boolean {
    return this.pinnedRows.has(uid);
  }

  // ── URL State Sync (Feature 11) ──────────────────────────────────────────
  private syncToUrl(): void {
    try {
      const state = {
        sort: this.sortStack,
        filters: {
          automation_type: Array.from(this.filters.automation_type),
          department: Array.from(this.filters.department),
          industry: Array.from(this.filters.industry),
        },
        search: this.searchQuery
      };
      const json = JSON.stringify(state);
      const b64 = btoa(encodeURIComponent(json));
      window.history.replaceState(null, '', `#state=${b64}`);
    } catch (e) {
      console.error('Failed to sync state to URL', e);
    }
  }

  private initFromUrl(): void {
    try {
      if (typeof window === 'undefined') return;
      const hash = window.location.hash;
      if (!hash.startsWith('#state=')) return;
      const b64 = hash.substring(7);
      const json = decodeURIComponent(atob(b64));
      const state = JSON.parse(json);
      
      if (state.sort && Array.isArray(state.sort)) {
        this.sortStack = state.sort;
      }
      if (state.filters) {
        if (state.filters.automation_type) this.filters.automation_type = new Set(state.filters.automation_type);
        if (state.filters.department) this.filters.department = new Set(state.filters.department);
        if (state.filters.industry) this.filters.industry = new Set(state.filters.industry);
      }
      if (state.search) {
        this.searchQuery = state.search;
        this.searchTokens = state.search.toLowerCase().split(/\s+/).map((t: string) => t.trim()).filter(Boolean);
      }
    } catch (e) {
      console.warn('Failed to parse URL state', e);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }

  // ── Core Ingestion (Feature 1 & 2) ────────────────────────────────────────────────────────────
  ingest(batch: RpaRow[]): void {
    const now = performance.now();
    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      this.pool.set(row.internal_uid, row);

      // KPI running sums per Feature 1 spec (sum over every incoming row)
      this.kpi.totalProcessed += 1;
      this.kpi.activeRobots += row.robots_deployed || 0;
      this.kpi.globalSavings += row.annual_savings_usd || 0;
      
      const isFailed = row.project_status === 'Failed';
      const isNegRoi = row.roi_percent < 0;
      
      if (isFailed) this.kpi.failedCount += 1;
      if (isNegRoi) this.kpi.negativeRoiCount += 1;

      // Feature 3: alert if Failed status OR negative ROI.
      // ONLY set the timestamp on the *transition* into alerted state.
      // If we keep overwriting on every tick, expireAlerts() can't ever clean it
      // up — and the grid re-fires the flash keyframe every 200ms → blinking.
      if (isFailed || isNegRoi) {
        if (!this.alerts.has(row.internal_uid)) {
          this.alerts.set(row.internal_uid, now);
          for (const fn of this.alertListeners) fn(row);
        }
      } else {
        // Row recovered → clear the alert so the next time it goes bad
        // we can flash it fresh.
        if (this.alerts.has(row.internal_uid)) {
          this.alerts.delete(row.internal_uid);
        }
      }

      // Throughput meter
      this.tickWindow.push(now);
    }
    // Drop entries older than 1s
    const cutoff = now - 1000;
    let drop = 0;
    while (drop < this.tickWindow.length && this.tickWindow[drop] < cutoff) drop++;
    if (drop > 0) this.tickWindow.splice(0, drop);

    const oldViewLength = this.viewCache.length;
    this.viewDirty = true;

    if (this.paused) {
      this.pendingBatchCount += batch.length;
    } else {
      // Notify hot listeners (grid does per-row, shell does coarse view)
      this.notifyKpi();
      // Per-row notify lets the grid update only visible rows that changed
      for (let i = 0; i < batch.length; i++) {
        const row = batch[i];
        for (const fn of this.rowListeners) fn(row);
      }
      
      // Only trigger a full structural view re-render if the number of rows actually changed
      // (e.g., during initial hydration). Otherwise, let the grid's pollInterval handle data updates.
      if (this.view().length !== oldViewLength) {
        this.notifyView();
      }
    }
  }

  // ── Pause / Play ─────────────────────────────────────────────────────────
  pause(): void {
    this.paused = true;
    this.pendingBatchCount = 0;
    this.notifyKpi();
  }

  play(): void {
    if (!this.paused) return;
    this.paused = false;
    this.pendingBatchCount = 0;
    // Flush — single coarse notify so the grid does a full rebuild.
    this.notifyKpi();
    this.notifyView();
  }

  isPaused(): boolean {
    return this.paused;
  }

  pendingCount(): number {
    return this.pendingBatchCount;
  }

  // ── Sort (Features 4 + 9) ────────────────────────────────────────────────
  setSingleSort(key: SortKey | null): void {
    this.sortStack = key ? [key] : [];
    this.viewDirty = true;
    this.notifyViewAndPersist();
  }

  toggleMultiSort(column: SortKey['column']): void {
    const idx = this.sortStack.findIndex((k) => k.column === column);
    if (idx === -1) {
      this.sortStack.push({ column, direction: 'asc' });
    } else if (this.sortStack[idx].direction === 'asc') {
      this.sortStack[idx] = { column, direction: 'desc' };
    } else {
      this.sortStack.splice(idx, 1);
    }
    this.viewDirty = true;
    this.notifyViewAndPersist();
  }

  getSortStack(): SortKey[] {
    return this.sortStack;
  }

  // ── Filter (Feature 7) ───────────────────────────────────────────────────
  toggleFilterValue(field: CategoricalField, value: string): void {
    const set = this.filters[field];
    if (set.has(value)) set.delete(value);
    else set.add(value);
    this.viewDirty = true;
    this.notifyViewAndPersist();
  }

  clearFilters(): void {
    this.filters.automation_type.clear();
    this.filters.department.clear();
    this.filters.industry.clear();
    this.viewDirty = true;
    this.notifyViewAndPersist();
  }

  getActiveFilters(): FilterState {
    return this.filters;
  }

  // ── Search (Feature 10) ──────────────────────────────────────────────────
  setSearch(q: string): void {
    this.searchQuery = q;
    this.searchTokens = q
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    this.viewDirty = true;
    this.notifyViewAndPersist();
  }

  getSearch(): string {
    return this.searchQuery;
  }

  // ── Derived options for dropdowns ────────────────────────────────────────
  getDistinctValues(field: CategoricalField): string[] {
    const set = new Set<string>();
    for (const row of this.pool.values()) {
      const v = row[field];
      if (v) set.add(v);
    }
    return Array.from(set).sort();
  }

  // ── KPI ──────────────────────────────────────────────────────────────────
  getKpi(): KpiSnapshot {
    return this.kpi;
  }

  /** Rows ingested in the last 1s — used for the live throughput badge. */
  getThroughput(): number {
    return this.tickWindow.length;
  }

  /** Get a row by uid — used by the inspector & sparkline-on-hover */
  getRow(uid: string): RpaRow | undefined {
    return this.pool.get(uid);
  }

  // ── Alerts ───────────────────────────────────────────────────────────────
  hasAlert(uid: string): boolean {
    return this.alerts.has(uid);
  }

  getAlertTime(uid: string): number | undefined {
    return this.alerts.get(uid);
  }

  // Clean up alerts older than 2s — keeps the alert map from growing forever
  // (Feature 3 guardrail: "auto-expire and clear smoothly")
  expireAlerts(): void {
    const now = performance.now();
    const cutoff = now - 2000;
    for (const [uid, ts] of this.alerts) {
      if (ts < cutoff) this.alerts.delete(uid);
    }
  }

  // ── View pool (sorted + filtered + searched) ─────────────────────────────
  view(): RpaRow[] {
    if (!this.viewDirty) return this.viewCache;
    this.viewDirty = false;

    const result: RpaRow[] = [];
    const filtersActive =
      this.filters.automation_type.size > 0 ||
      this.filters.department.size > 0 ||
      this.filters.industry.size > 0;

    for (const row of this.pool.values()) {
      if (filtersActive) {
        if (this.filters.automation_type.size > 0 && !this.filters.automation_type.has(row.automation_type)) continue;
        if (this.filters.department.size > 0 && !this.filters.department.has(row.department)) continue;
        if (this.filters.industry.size > 0 && !this.filters.industry.has(row.industry)) continue;
      }
      if (this.searchTokens.length > 0) {
        const haystack =
          `${row.project_name} ${row.company_id} ${row.implementation_partner} ${row.country}`.toLowerCase();
        let matched = true;
        for (const tok of this.searchTokens) {
          if (haystack.indexOf(tok) === -1) {
            matched = false;
            break;
          }
        }
        if (!matched) continue;
      }
      result.push(row);
    }

    if (this.pinnedRows.size > 0 || this.sortStack.length > 0) {
      const stack = this.sortStack;
      result.sort((a, b) => {
        const aPinned = this.pinnedRows.has(a.internal_uid);
        const bPinned = this.pinnedRows.has(b.internal_uid);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;

        for (let i = 0; i < stack.length; i++) {
          const { column, direction } = stack[i];
          const av = a[column] as string | number;
          const bv = b[column] as string | number;
          let cmp = 0;
          if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
          else cmp = String(av).localeCompare(String(bv));
          if (cmp !== 0) return direction === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }

    this.viewCache = result;
    return result;
  }

  // ── Subscriptions ────────────────────────────────────────────────────────
  subscribeKpi(fn: Listener): () => void {
    this.kpiListeners.add(fn);
    return () => this.kpiListeners.delete(fn);
  }
  subscribeView(fn: Listener): () => void {
    this.viewListeners.add(fn);
    return () => this.viewListeners.delete(fn);
  }
  subscribeOptions(fn: Listener): () => void {
    this.optionListeners.add(fn);
    return () => this.optionListeners.delete(fn);
  }
  subscribeRow(fn: RowListener): () => void {
    this.rowListeners.add(fn);
    return () => this.rowListeners.delete(fn);
  }
  /** Fired only when a row transitions INTO an alerted state (not on every restate). */
  subscribeAlert(fn: AlertListener): () => void {
    this.alertListeners.add(fn);
    return () => this.alertListeners.delete(fn);
  }

  private notifyKpi(): void {
    for (const fn of this.kpiListeners) fn();
  }
  private notifyView(): void {
    for (const fn of this.viewListeners) fn();
    for (const fn of this.optionListeners) fn();
  }

  /** Same as notifyView() but also persists the control surface to the URL.
   *  Use only from user-driven mutations (sort/filter/search) — NEVER from ingest. */
  private notifyViewAndPersist(): void {
    this.notifyView();
    if (typeof window !== 'undefined') this.syncToUrl();
  }
}

// Singleton — there is only ever one telemetry stream.
export const engine = new StateEngine();
