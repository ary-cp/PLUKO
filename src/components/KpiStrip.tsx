import { useEngineKpi } from '../hooks/useEngineKpi';
import { formatInt, formatUsd, formatCompact } from '../utils/format';
import { Sparkline } from './Sparkline';

export function KpiStrip() {
  const { totalProcessed, activeRobots, globalSavings } = useEngineKpi();

  return (
    <section className="kpis" aria-label="Real-time KPIs">
      <article className="kpi">
        <div className="kpi__label">Total Streamed Rows</div>
        <div className="kpi__value" title={formatInt(totalProcessed)} style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
          {formatInt(totalProcessed)}
          <Sparkline value={totalProcessed} color="var(--accent)" />
        </div>
        <div className="kpi__sub">Cumulative records processed</div>
      </article>
      <article className="kpi">
        <div className="kpi__label">Active Robots Deployed</div>
        <div className="kpi__value" title={formatInt(activeRobots)} style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
          {formatCompact(activeRobots)}
          <Sparkline value={activeRobots} color="var(--positive)" />
        </div>
        <div className="kpi__sub">Sum of robots_deployed across stream</div>
      </article>
      <article className="kpi">
        <div className="kpi__label">Global Cumulative Savings</div>
        <div className="kpi__value" title={formatUsd(globalSavings)} style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'space-between' }}>
          {formatCompact(globalSavings)} <span style={{ fontSize: '12px', color: 'var(--text-2)', marginLeft: '-8px' }}>USD</span>
          <Sparkline value={globalSavings} color="var(--warn)" />
        </div>
        <div className="kpi__sub">Running sum of annual_savings_usd</div>
      </article>
    </section>
  );
}
