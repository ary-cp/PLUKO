import { useEffect, useState, useCallback } from 'react';
import { engine } from '../store/StateEngine';
import type { RpaRow } from '../types';

interface Toast {
  id: string;
  row: RpaRow;
}

export function ToastQueue() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    let lastToastTime = 0;
    
    const unsub = engine.subscribeAlert((row) => {
      if (row.project_status === 'Failed') {
        const now = performance.now();
        // Rate limit: max 1 toast every 2.5 seconds to avoid spam
        if (now - lastToastTime < 2500) return;
        lastToastTime = now;
        
        const newToast: Toast = { id: Math.random().toString(36).substr(2, 9), row };
        setToasts(prev => [...prev.slice(-2), newToast]); // Keep max 3 toasts
        
        // Auto dismiss
        setTimeout(() => {
          removeToast(newToast.id);
        }, 4000);
      }
    });
    return unsub;
  }, [removeToast]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-queue">
      {toasts.map(toast => (
        <div key={toast.id} className="toast" onClick={() => removeToast(toast.id)}>
          <div className="toast__icon">⚠️</div>
          <div className="toast__content">
            <div className="toast__title">Project Failed</div>
            <div className="toast__desc">
              {toast.row.project_name} ({toast.row.project_id})
            </div>
          </div>
          <button className="toast__close" onClick={(e) => { e.stopPropagation(); removeToast(toast.id); }}>×</button>
        </div>
      ))}
    </div>
  );
}
