/**
 * ============================================================================
 * PLUKO RPA TELEMETRY PIPELINE — patched for the official schema
 * ============================================================================
 * Patched fields: project_id, company_id, project_name, start_date,
 * completion_date, project_status, automation_type, robots_deployed,
 * budget_usd, annual_savings_usd, roi_percent, department,
 * implementation_partner, country, industry, employee_hours_saved,
 * ai_enabled, cloud_deployment.
 *
 * Injects:
 *  - random metric noise on numeric fields every 200 ms
 *  - 5% anomaly cycles (large macro shifts)
 *  - ~4% chance of project_status -> 'Failed' (per Feature 3)
 *  - ~3% chance of negative roi_percent injection
 * ============================================================================
 */
(function () {
  let memoryPool = [];
  let isInitialized = false;

  const NUMERIC_INT = new Set([
    'robots_deployed',
    'budget_usd',
    'annual_savings_usd',
    'employee_hours_saved',
  ]);
  const NUMERIC_FLOAT = new Set(['roi_percent']);

  const rand = (min, max) => Math.random() * (max - min) + min;
  const irand = (min, max) => Math.floor(rand(min, max));

  const parseCSV = (csvText) => {
    const lines = csvText.trim().split(/\r?\n/);
    const headerLine = lines[0];
    const splitChar = headerLine.split('\t').length > headerLine.split(',').length ? '\t' : ',';
    const headers = headerLine.split(splitChar).map((h) => h.trim());
    const rows = new Array(lines.length - 1);
    let n = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
      const values = line.split(splitChar);
      if (values.length !== headers.length) continue;
      const row = { internal_uid: `uid-${i}` };
      for (let h = 0; h < headers.length; h++) {
        const key = headers[h];
        const raw = values[h] != null ? values[h].trim() : '';
        if (NUMERIC_INT.has(key)) {
          row[key] = parseInt(raw, 10) || 0;
        } else if (NUMERIC_FLOAT.has(key)) {
          row[key] = parseFloat(raw) || 0;
        } else {
          row[key] = raw;
        }
      }
      rows[n++] = row;
    }
    rows.length = n;
    return rows;
  };

  window.initializeRpaStream = async function (callback, csvUrl = '/rpa_database_2026.csv') {
    if (typeof callback !== 'function') {
      console.error('[PLUKO] initializeRpaStream requires a callback');
      return;
    }
    if (isInitialized) {
      console.warn('[PLUKO] stream already initialized');
      return;
    }
    try {
      const response = await fetch(csvUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const csvText = await response.text();
      memoryPool = parseCSV(csvText);
      isInitialized = true;
      console.log(`[PLUKO] mapped ${memoryPool.length} rows into memory`);

      // Hand the initial dataset to the consumer in chunks so the engine can hydrate.
      const HYDRATION_CHUNK = 500;
      for (let i = 0; i < memoryPool.length; i += HYDRATION_CHUNK) {
        const slice = memoryPool.slice(i, i + HYDRATION_CHUNK).map((r) => ({ ...r }));
        callback(slice);
      }

      // 200 ms telemetry firehose — only mutations, no new rows.
      setInterval(() => {
        if (memoryPool.length === 0) return;

        const batchSize = irand(8, 50);
        const incomingBatch = new Array(batchSize);

        for (let i = 0; i < batchSize; i++) {
          const targetIndex = irand(0, memoryPool.length);
          const original = memoryPool[targetIndex];
          const row = { ...original };

          const isAnomaly = Math.random() > 0.95;

          if (isAnomaly) {
            // Macro shift
            row.budget_usd = Math.max(1000, row.budget_usd + irand(-50000, 50000));
            row.annual_savings_usd = Math.max(0, row.annual_savings_usd + irand(-30000, 60000));
            row.employee_hours_saved = Math.max(0, row.employee_hours_saved + irand(-500, 800));
            row.robots_deployed = Math.max(1, row.robots_deployed + irand(-3, 6));
            row.roi_percent = parseFloat((row.roi_percent + rand(-20, 25)).toFixed(2));
          } else {
            // High-frequency operational noise
            row.budget_usd = Math.max(1000, row.budget_usd + irand(-500, 800));
            row.annual_savings_usd = Math.max(0, row.annual_savings_usd + irand(-200, 600));
            row.employee_hours_saved = Math.max(0, row.employee_hours_saved + irand(-10, 30));
            row.roi_percent = parseFloat((row.roi_percent + rand(-1.5, 2)).toFixed(2));
          }

          // ~4% chance of FAILED status injection (Feature 3 trigger)
          const failRoll = Math.random();
          if (failRoll < 0.04) {
            row.project_status = 'Failed';
          } else if (failRoll < 0.06) {
            row.project_status = 'Active';
          }

          // ~3% chance of forcing a negative ROI (Feature 3 trigger)
          if (Math.random() < 0.03) {
            row.roi_percent = parseFloat((-Math.abs(rand(2, 40))).toFixed(2));
          }

          memoryPool[targetIndex] = row;
          incomingBatch[i] = row;
        }

        callback(incomingBatch);
      }, 200);
    } catch (error) {
      console.error('[PLUKO] stream initialization failed:', error);
    }
  };
})();
