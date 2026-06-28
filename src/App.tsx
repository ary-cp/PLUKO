import { useState, useEffect } from 'react';
import { KpiStrip } from './components/KpiStrip';
import { Topbar } from './components/Topbar';
import { ControlsBar } from './components/ControlsBar';
import { VirtualGrid } from './components/VirtualGrid';
import { DepartmentChart, InfrastructurePanel, TerminalPanel, NotificationHistoryPanel } from './components/SidePanels';
import { useLayoutPersistence } from './hooks/useLayoutPersistence';
import { CommandPalette } from './components/CommandPalette';
import { exportSnapshotCsv } from './lib/exportCsv';
import { AlertAnnouncer } from './components/AlertAnnouncer';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
// ToastQueue removed in favor of NotificationHistoryPanel
import { KeyboardHelpModal } from './components/KeyboardHelpModal';
import { engine } from './store/StateEngine';

export function App() {
  const { layout, toggle, applyPreset } = useLayoutPersistence();
  const [focusMode, setFocusMode] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Close analytics if the stream unpauses via hotkey or other means
  useEffect(() => {
    const unsub = engine.subscribeKpi(() => {
      if (!engine.isPaused()) {
        setShowAnalytics(false);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        setShowShortcuts(prev => !prev);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (engine.isPaused()) engine.play();
        else engine.pause();
      } else if (e.altKey) {
        if (e.key.toLowerCase() === 'k') { e.preventDefault(); toggle('kpis'); }
        else if (e.key.toLowerCase() === 'f') { e.preventDefault(); toggle('filters'); }
        else if (e.key.toLowerCase() === 'g') { e.preventDefault(); toggle('grid'); }
        else if (e.key.toLowerCase() === 'd') { e.preventDefault(); toggle('departmentChart'); }
        else if (e.key.toLowerCase() === 'i') { e.preventDefault(); toggle('infrastructure'); }
        else if (e.key.toLowerCase() === 'e') { e.preventDefault(); exportSnapshotCsv(); }
      } else if (e.key.toLowerCase() === 'f') {
        setFocusMode(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  // Mouse-tracking spotlight for cards. Bounds are cached on resize, not per-move,
  // to avoid forced sync layout on every mousemove during streaming.
  useEffect(() => {
    type CardBounds = { el: HTMLElement; left: number; top: number };
    let bounds: CardBounds[] = [];
    let rafPending = false;
    let lastX = 0;
    let lastY = 0;

    const refreshBounds = () => {
      const cards = document.querySelectorAll<HTMLElement>('.kpi, .minipanel, .shell__topbar, .pause-overlay__content, .controls-presets .btn');
      bounds = Array.from(cards).map((el) => {
        const r = el.getBoundingClientRect();
        return { el, left: r.left, top: r.top };
      });
    };

    const apply = () => {
      rafPending = false;
      for (let i = 0; i < bounds.length; i++) {
        const b = bounds[i];
        b.el.style.setProperty('--mouse-x', `${lastX - b.left}px`);
        b.el.style.setProperty('--mouse-y', `${lastY - b.top}px`);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastX = e.clientX;
      lastY = e.clientY;
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(apply);
    };

    refreshBounds();
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('resize', refreshBounds);
    window.addEventListener('scroll', refreshBounds, true);
    
    // Periodically refresh bounds to catch dynamically rendered elements
    // like the pause overlay or components toggled via layout presets.
    const intervalId = setInterval(refreshBounds, 1000);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', refreshBounds);
      window.removeEventListener('scroll', refreshBounds, true);
      clearInterval(intervalId);
    };
  }, []);

  return (
    <>
      <main className={`shell ${focusMode ? 'is-focus-mode' : ''}`}>
        <Topbar />
        {layout.kpis && <KpiStrip />}
        <ControlsBar
          layout={layout}
          toggleLayout={toggle}
          applyPreset={applyPreset}
          onToggleAnalytics={() => setShowAnalytics(true)}
        />
        {layout.grid && <VirtualGrid />}
        {(layout.departmentChart || layout.infrastructure) && (
          <aside className="shell__sidebar">
            {layout.departmentChart && <DepartmentChart />}
            {layout.infrastructure && <InfrastructurePanel />}
            <TerminalPanel />
            <NotificationHistoryPanel />
          </aside>
        )}
        <CommandPalette />
        <AlertAnnouncer />
        {showAnalytics && <AnalyticsDashboard onClose={() => setShowAnalytics(false)} />}
        {showShortcuts && <KeyboardHelpModal onClose={() => setShowShortcuts(false)} />}
      </main>
    </>
  );
}
