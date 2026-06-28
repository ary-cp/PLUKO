import { engine } from '../store/StateEngine';

let workerInstance: Worker | null = null;

export function exportSnapshotCsv() {
  const view = engine.view();
  if (view.length === 0) return;

  if (!workerInstance) {
    workerInstance = new Worker(new URL('./csvWorker.ts', import.meta.url), { type: 'module' });
  }

  const columns = [
    'project_id', 'project_name', 'company_id', 'project_status', 
    'automation_type', 'department', 'industry', 'robots_deployed', 
    'budget_usd', 'annual_savings_usd', 'roi_percent', 'employee_hours_saved',
    'implementation_partner', 'country', 'ai_enabled', 'cloud_deployment'
  ];

  workerInstance.onmessage = (e: MessageEvent<string>) => {
    const csvContent = e.data;
    if (!csvContent) return;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `snapshot_export_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Send the data to the worker
  workerInstance.postMessage({ view, columns });
}
