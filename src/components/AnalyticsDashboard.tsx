import { useEffect, useRef, useMemo } from 'react';
import Chart from 'chart.js/auto';
import { engine } from '../store/StateEngine';

export function AnalyticsDashboard({ onClose }: { onClose: () => void }) {
  const barCanvasRef = useRef<HTMLCanvasElement>(null);
  const doughnutCanvasRef = useRef<HTMLCanvasElement>(null);
  const pieCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartRefs = useRef<Chart[]>([]);

  const data = useMemo(() => engine.view(), []);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (!data || data.length === 0) return;

    // 1. Budget by Department (Bar Chart)
    const budgetByDept = data.reduce((acc, row) => {
      acc[row.department] = (acc[row.department] || 0) + row.budget_usd;
      return acc;
    }, {} as Record<string, number>);

    // 2. Automation Type Distribution (Doughnut)
    const autoType = data.reduce((acc, row) => {
      acc[row.automation_type] = (acc[row.automation_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 3. Project Status (Pie)
    const statusType = data.reduce((acc, row) => {
      acc[row.project_status] = (acc[row.project_status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const chartColors = [
      '#60a5fa', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#f87171', '#38bdf8', '#818cf8', '#e879f9'
    ];

    Chart.defaults.color = '#94a3b8';
    Chart.defaults.font.family = 'var(--font-mono, "Inter", monospace)';

    if (barCanvasRef.current) {
      const ctx = barCanvasRef.current.getContext('2d');
      let gradient: string | CanvasGradient = '#8b5cf6';
      if (ctx) {
        gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(167, 139, 250, 0.9)');
        gradient.addColorStop(1, 'rgba(124, 58, 237, 0.2)');
      }
      const chart = new Chart(barCanvasRef.current, {
        type: 'bar',
        data: {
          labels: Object.keys(budgetByDept),
          datasets: [{
            label: 'Budget (USD)',
            data: Object.values(budgetByDept),
            backgroundColor: gradient as any,
            borderColor: '#a78bfa',
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'TOTAL BUDGET BY DEPARTMENT', color: '#f8fafc', font: { size: 14, weight: 'bold', family: 'var(--font-mono)' }, padding: { bottom: 20 } },
            tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#fff', bodyColor: '#cbd5e1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12 }
          },
          scales: {
            y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.04)' }, border: { display: false } },
            x: { ticks: { color: '#94a3b8' }, grid: { display: false }, border: { display: false } }
          }
        }
      });
      chartRefs.current.push(chart);
    }

    if (doughnutCanvasRef.current) {
      const chart = new Chart(doughnutCanvasRef.current, {
        type: 'doughnut',
        data: {
          labels: Object.keys(autoType),
          datasets: [{
            data: Object.values(autoType),
            backgroundColor: chartColors,
            borderColor: '#0f172a',
            borderWidth: 2,
            hoverOffset: 4,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: { position: 'right', labels: { color: '#cbd5e1', padding: 20, usePointStyle: true, pointStyle: 'circle' } },
            title: { display: true, text: 'AUTOMATION TYPE', color: '#f8fafc', font: { size: 14, weight: 'bold', family: 'var(--font-mono)' }, padding: { bottom: 20 } },
            tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#fff', bodyColor: '#cbd5e1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12 }
          }
        }
      });
      chartRefs.current.push(chart);
    }

    if (pieCanvasRef.current) {
      const chart = new Chart(pieCanvasRef.current, {
        type: 'pie',
        data: {
          labels: Object.keys(statusType),
          datasets: [{
            data: Object.values(statusType),
            backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'],
            borderColor: '#0f172a',
            borderWidth: 2,
            hoverOffset: 4,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'right', labels: { color: '#cbd5e1', padding: 20, usePointStyle: true, pointStyle: 'circle' } },
            title: { display: true, text: 'PROJECT STATUS', color: '#f8fafc', font: { size: 14, weight: 'bold', family: 'var(--font-mono)' }, padding: { bottom: 20 } },
            tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#fff', bodyColor: '#cbd5e1', borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 12 }
          }
        }
      });
      chartRefs.current.push(chart);
    }

    return () => {
      chartRefs.current.forEach(c => c.destroy());
      chartRefs.current = [];
    };
  }, [data]);

  return (
    <div className="analytics-overlay" onClick={onClose}>
      <div className="analytics-overlay__content" onClick={(e) => e.stopPropagation()}>
        <div className="analytics-overlay__header">
          <div className="analytics-overlay__title">
            Pipeline Analytics (Frozen View)
          </div>
          <button className="analytics-overlay__close" onClick={onClose}>×</button>
        </div>
        
        {data.length === 0 ? (
          <div className="analytics-overlay__empty">No data available to analyze.</div>
        ) : (
          <div className="analytics-overlay__grid">
            <div className="analytics-overlay__card span-2">
              <canvas ref={barCanvasRef}></canvas>
            </div>
            <div className="analytics-overlay__card">
              <canvas ref={doughnutCanvasRef}></canvas>
            </div>
            <div className="analytics-overlay__card">
              <canvas ref={pieCanvasRef}></canvas>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
