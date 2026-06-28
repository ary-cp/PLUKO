import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { engine } from './store/StateEngine';

// Bootstrap the telemetry stream ONCE, before React mounts.
// All subsequent batches flow into the singleton engine; the UI listens.
if (typeof window !== 'undefined' && typeof window.initializeRpaStream === 'function') {
  window.initializeRpaStream(
    (batch) => engine.ingest(batch),
    '/rpa_database_2026.csv'
  );
} else {
  console.error(
    '[PLUKO] window.initializeRpaStream is not defined. Verify /dataStream.js is loaded in index.html before /src/main.tsx.'
  );
}

// Periodic alert sweep — keeps the alert map bounded so memory stays flat.
setInterval(() => engine.expireAlerts(), 1500);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
