export type CsvWorkerData = {
  view: any[];
  columns: string[];
};

self.onmessage = (e: MessageEvent<CsvWorkerData>) => {
  const { view, columns } = e.data;
  
  if (!view || view.length === 0) {
    self.postMessage('');
    return;
  }

  const headerRow = columns.join(',');
  const rows = view.map((row: any) => {
    return columns.map((col: string) => {
      const val = row[col];
      if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
      return val;
    }).join(',');
  });
  
  const csvContent = [headerRow, ...rows].join('\n');
  self.postMessage(csvContent);
};
