/**
 * Strict schema for one RPA project row, matching rpa_database_2026.csv exactly
 * plus the synthetic internal_uid injected by dataStream.js for stable tracking.
 */
export interface RpaRow {
  internal_uid: string;
  project_id: string;
  company_id: string;
  project_name: string;
  start_date: string;
  completion_date: string;
  project_status: string;
  automation_type: string;
  robots_deployed: number;
  budget_usd: number;
  annual_savings_usd: number;
  roi_percent: number;
  department: string;
  implementation_partner: string;
  country: string;
  industry: string;
  employee_hours_saved: number;
  ai_enabled: string;
  cloud_deployment: string;
}

export type SortDirection = 'asc' | 'desc';

export type SortableColumn =
  | 'budget_usd'
  | 'roi_percent'
  | 'employee_hours_saved'
  | 'robots_deployed'
  | 'annual_savings_usd'
  | 'industry'
  | 'department'
  | 'automation_type';

export interface SortKey {
  column: SortableColumn;
  direction: SortDirection;
}

export type CategoricalField = 'automation_type' | 'department' | 'industry';

export type FilterState = Record<CategoricalField, Set<string>>;

export interface KpiSnapshot {
  totalProcessed: number;
  activeRobots: number;
  globalSavings: number;
  failedCount: number;
  negativeRoiCount: number;
}

export interface PanelVisibility {
  kpis: boolean;
  filters: boolean;
  grid: boolean;
  departmentChart: boolean;
  infrastructure: boolean;
}
