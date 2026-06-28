import { useEffect, useRef } from 'react';
import { engine } from '../store/StateEngine';

/**
 * Lightweight live aggregations rendered to the footer rail.
 * Subscribes to KPI ticks (already throttled) — never owns its own state.
 */
export function DepartmentChart() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => {
      const el = ref.current;
      if (!el) return;
      const counts: Record<string, number> = {};
      let total = 0;
      // Sample over view-pool so it reflects current filter context too
      const pool = engine.view();
      const sampleSize = Math.min(pool.length, 800);
      for (let i = 0; i < sampleSize; i++) {
        const d = pool[i].department;
        if (!d) continue;
        counts[d] = (counts[d] || 0) + 1;
        total++;
      }
      const top = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      const max = top[0]?.[1] || 1;
      el.innerHTML = top
        .map(
          ([dept, n]) => `
        <div style="display:flex;align-items:center;gap:8px;margin:4px 0;font-family:var(--font-mono);font-size:11px;">
          <span style="flex:1;color:var(--text-1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${dept}</span>
          <span style="width:80px;height:6px;background:var(--bg-3);border-radius:3px;overflow:hidden;">
            <span style="display:block;height:100%;width:${Math.round((n / max) * 100)}%;background:var(--accent);"></span>
          </span>
          <span style="width:40px;text-align:right;color:var(--text-2);">${n}</span>
        </div>
      `
        )
        .join('');
    };
    refresh();
    // NOTE: Do NOT subscribe to subscribeView — it fires every 200ms (every
    // data ingest batch). innerHTML replacement at that cadence = visible
    // panel-wide blink. Only refresh on a slow timer.
    let lastRun = performance.now();
    const onTick = () => {
      const now = performance.now();
      if (now - lastRun > 1500) {
        lastRun = now;
        refresh();
      }
    };
    const unsubKpi = engine.subscribeKpi(onTick);

    return () => {
      unsubKpi();
    };
  }, []);

  return (
    <article className="minipanel">
      <div className="minipanel__title">Top Departments · Current View</div>
      <div ref={ref} />
    </article>
  );
}

export function InfrastructurePanel() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => {
      const el = ref.current;
      if (!el) return;
      const pool = engine.view();
      let aiCount = 0;
      let cloudCount = 0;
      let failedCount = 0;
      const sample = Math.min(pool.length, 800);
      for (let i = 0; i < sample; i++) {
        const r = pool[i];
        if (r.ai_enabled === 'Yes') aiCount++;
        if (r.cloud_deployment === 'Yes') cloudCount++;
        if (r.project_status === 'Failed' || r.roi_percent < 0) failedCount++;
      }
      const total = sample || 1;
      el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-family:var(--font-mono);font-size:11px;">
          <div><div style="color:var(--text-3);font-size:9px;letter-spacing:0.1em;">AI ENABLED</div><div style="font-size:18px;color:var(--accent);">${Math.round((aiCount / total) * 100)}%</div></div>
          <div><div style="color:var(--text-3);font-size:9px;letter-spacing:0.1em;">CLOUD</div><div style="font-size:18px;color:var(--positive);">${Math.round((cloudCount / total) * 100)}%</div></div>
          <div><div style="color:var(--text-3);font-size:9px;letter-spacing:0.1em;">SAMPLED</div><div style="font-size:18px;color:var(--text-1);">${sample}</div></div>
          <div><div style="color:var(--text-3);font-size:9px;letter-spacing:0.1em;">ALERTS</div><div style="font-size:18px;color:${failedCount ? 'var(--negative)' : 'var(--text-1)'};">${failedCount}</div></div>
        </div>
      `;
    };
    refresh();
    // Same fix as DepartmentChart — no subscribeView, only slow KPI tick.
    let lastRun = performance.now();
    const onTick = () => {
      const now = performance.now();
      if (now - lastRun > 1500) {
        lastRun = now;
        refresh();
      }
    };
    const unsubKpi = engine.subscribeKpi(onTick);

    return () => {
      unsubKpi();
    };
  }, []);

  return (
    <article className="minipanel">
      <div className="minipanel__title">Infrastructure Toggles</div>
      <div ref={ref} />
    </article>
  );
}

export function TerminalPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const MAX_LOGS = 30;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    let lastAppend = 0;
    const MIN_GAP_MS = 1200; // never more than ~1 new line per 1.2s — eye-friendly

    // Listen only when a row TRANSITIONS into alerted state (not every tick)
    const unsubAlert = engine.subscribeAlert((row) => {
      const now = performance.now();
      if (now - lastAppend < MIN_GAP_MS) return;
      lastAppend = now;

      const time = new Date().toLocaleTimeString('en-US', { hour12: false });
      const reason = row.project_status === 'Failed'
        ? 'FAILED'
        : `NEG ROI ${row.roi_percent.toFixed(1)}%`;

      // Append a single new node at top — no innerHTML rewrite, no full repaint.
      const line = document.createElement('div');
      line.style.cssText = 'color:var(--negative);margin:2px 0;opacity:0;transition:opacity 200ms ease-out;';
      line.textContent = `[${time}] ⚠ ${reason} · ${row.internal_uid}`;
      container.insertBefore(line, container.firstChild);
      // Fade in on next frame
      requestAnimationFrame(() => { line.style.opacity = '1'; });

      // Trim old entries
      while (container.children.length > MAX_LOGS) {
        container.removeChild(container.lastChild!);
      }
    });

    return () => unsubAlert();
  }, []);

  return (
    <article className="minipanel" style={{ flex: 1.5, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div className="minipanel__title" style={{ flexShrink: 0 }}>Raw Telemetry Stream Logs</div>
      <div ref={ref} style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '10px', display: 'flex', flexDirection: 'column', paddingRight: '8px', minHeight: 0 }} />
    </article>
  );
}

export function NotificationHistoryPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const historyRef = useRef<{ id: string, text: string, time: string }[]>([]);

  useEffect(() => {
    let lastAlertTime = 0;
    
    const unsub = engine.subscribeAlert((row) => {
      if (row.project_status === 'Failed') {
        const now = performance.now();
        // Rate limit: max 1 alert every 1 second to avoid spam
        if (now - lastAlertTime < 1000) return;
        lastAlertTime = now;
        
        const time = new Date().toLocaleTimeString('en-US', { hour12: false });
        const text = `PROJECT FAILED: ${row.project_name} (${row.project_id})`;
        const id = Math.random().toString(36).substr(2, 9);
        
        historyRef.current.push({ id, text, time });
        if (historyRef.current.length > 50) {
          historyRef.current = historyRef.current.slice(-50);
        }
        
        if (ref.current) {
          ref.current.innerHTML = historyRef.current
            .map(h => `
              <div style="margin:4px 0;border-left:2px solid var(--negative);padding-left:6px;background:rgba(239,68,68,0.05);padding-top:4px;padding-bottom:4px;border-radius:0 4px 4px 0;">
                <div style="color:var(--text-3);font-size:9px;">${h.time}</div>
                <div style="color:var(--text-0);">${h.text}</div>
              </div>
            `)
            .reverse()
            .join('');
        }
      }
    });
    return unsub;
  }, []);

  return (
    <article className="minipanel" style={{ flex: 1.5, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      <div className="minipanel__title" style={{ flexShrink: 0, display: 'flex', justifyContent: 'space-between' }}>
        <span>Notification History</span>
        <span style={{color: 'var(--text-3)'}}>⚠️</span>
      </div>
      <div ref={ref} style={{ flex: 1, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: '10px', display: 'flex', flexDirection: 'column', paddingRight: '8px', minHeight: 0 }}>
        <div style={{ color: 'var(--text-3)', fontStyle: 'italic', margin: '4px 0' }}>No recent notifications.</div>
      </div>
    </article>
  );
}
