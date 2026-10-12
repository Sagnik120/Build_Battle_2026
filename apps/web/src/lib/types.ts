export type Sentiment = "positive" | "mixed" | "neutral" | "negative";
export type Tier = "P0" | "P1" | "P2" | "P3";
export type IssueStatus = "open" | "investigating" | "in_progress" | "resolved" | "wont_fix";

export interface ThemeRef {
  id: number;
  label: string;
  area: string;
  kind: "known" | "emerging" | "adaption";
  polarity: "issue" | "praise" | "neutral";
}

export interface Analysis {
  sentiment: Sentiment;
  score: number;
  confidence: number;
  is_complaint: boolean;
  resolution: "resolved" | "unresolved" | "n/a";
  severity: number;
  theme: ThemeRef | null;
  keywords: string[];
  signals: string[];
  engine: string;
  summary: string | null;
  root_cause: string | null;
  suggested_action: string | null;
}

export interface FeedbackItem {
  id: number;
  text: string;
  category: string;
  source: string;
  rating: number | null;
  customer: string | null;
  created_at: string;
  time_simulated: boolean;
  occurrences: number;
  analysis: Analysis;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Facets {
  categories: { value: string; count: number }[];
  sources: { value: string; count: number }[];
  themes: (ThemeRef & { count: number })[];
  date_min: string | null;
  date_max: string | null;
}

export interface Priority {
  score: number;
  tier: Tier;
  tier_label: string;
  factors: { reach: number; severity: number; unresolved: number; momentum: number };
  reasons: string[];
  change_pct: number | null;
  share_pct: number;
  unresolved_pct: number;
}

export interface ThemeRow {
  theme_id: number | null;
  slug: string;
  label: string;
  area: string;
  kind: string;
  polarity: string;
  description: string;
  mentions: number;
  complaints: number;
  unresolved: number;
  positive: number;
  severity_avg: number;
  series: number[];
  priority: Priority;
}

export interface Kpis {
  total: number;
  positive: number;
  negative: number;
  mixed: number;
  neutral: number;
  nss: number;
  complaints: number;
  complaint_rate: number;
  unresolved: number;
  unresolved_rate: number;
  critical: number;
  avg_score: number;
}

export interface DatasetMeta {
  total_feedback: number;
  distinct_voices: number;
  timeline_simulated: boolean;
  simulated_rows: number;
  engines: Record<string, number>;
  adaption_enriched: number;
}

export type SentimentCounts = Record<Sentiment, number> & {
  total: number;
  complaints: number;
  nss: number;
  complaint_rate: number;
};

export interface Dashboard {
  empty: boolean;
  meta: DatasetMeta;
  window: { start: string; end: string; mid: string; days: number; granularity: "day" | "week" | "month" } | null;
  kpis: Kpis;
  change: {
    total_pct: number | null;
    nss_pts: number;
    complaint_rate_pts: number;
    unresolved_rate_pts: number;
    critical_pct: number | null;
  } | null;
  sentiment: { sentiment: Sentiment; count: number }[];
  trend: ({ bucket: string } & SentimentCounts)[];
  by_category: ({ category: string } & SentimentCounts)[];
  by_source: { source: string; count: number }[];
  severity: { severity: number; count: number }[];
  top_issues: ThemeRow[];
  top_praise: ThemeRow[];
}

export interface ActionItem {
  title: string;
  detail: string;
  owner: string;
  effort: "S" | "M" | "L";
  metric: string;
}

export interface Recommendation {
  rank: number;
  theme: { theme_id: number | null; slug: string; label: string; area: string; kind: string; description: string };
  priority: Priority;
  metrics: { mentions: number; complaints: number; unresolved: number; severity_avg: number; series: number[] };
  revenue_at_risk: number;
  headline: string;
  actions: ActionItem[];
  compliance: string | null;
  evidence: { text: string; count: number; severity: number; resolution: string }[];
  adaption: { messages_enriched: number; root_causes: string[]; suggested_actions: string[] } | null;
  tracked_issue_id: number | null;
}

export interface Assumptions {
  currency: string;
  average_order_value: number;
  churn_by_severity: Record<string, number>;
}

export interface Recommendations {
  items: Recommendation[];
  assumptions: Assumptions;
  weights: Record<string, number>;
  timeline_simulated: boolean;
  window: { start: string; end: string; mid: string; days: number } | null;
  totals: { revenue_at_risk: number; complaints: number; p0?: number; p1?: number };
}

export interface Issue {
  id: number;
  title: string;
  description: string;
  status: IssueStatus;
  status_label: string;
  priority: Tier;
  owner: string | null;
  due_date: string | null;
  overdue: boolean;
  theme_id: number | null;
  baseline: { captured_at?: string; complaints?: number; unresolved?: number; score?: number; tier?: Tier; revenue_at_risk?: number };
  current: {
    label: string;
    area: string;
    complaints: number;
    unresolved: number;
    score: number;
    tier: Tier;
    change_pct: number | null;
    series: number[];
  } | null;
  activity: { at: string; kind: string; message: string }[];
  created_at: string;
  updated_at: string;
}

export interface ReportSummary {
  id: number;
  title: string;
  share_token: string;
  created_at: string;
  filters: Record<string, unknown>;
  kpis?: { total: number | null; nss: number | null; complaint_rate: number | null; critical: number | null };
  top_issue?: string | null;
}

export interface Report extends ReportSummary {
  payload: {
    generated_at: string;
    summary: string[];
    dashboard: Dashboard;
    recommendations: Recommendations;
    issues: Issue[];
    methodology: string[];
  };
}

export interface AdaptionStatus {
  configured: boolean;
  sdk_version: string | null;
  background_sync: boolean;
  distinct_messages: number;
  enriched: number;
  coverage_pct: number;
  engines: Record<string, number>;
  workflow: {
    mode: string;
    context_columns: string[];
    universal_prompt: string;
    blueprint: string;
    recipes: Record<string, boolean>;
  };
}

export interface AdaptionRun {
  id: number;
  mode: "api" | "manual";
  stage: "ingesting" | "estimated" | "running" | "completed" | "failed";
  scope: string;
  dataset_id: string | null;
  remote_run_id: string | null;
  options: Record<string, unknown>;
  rows_sent: number;
  rows_merged: number;
  rows_unmatched: number;
  progress_percent: number | null;
  estimated_credits: number | null;
  estimated_minutes: number | null;
  quality: {
    status?: string;
    grade_before?: string | null;
    grade_after?: string | null;
    score_before?: number | null;
    score_after?: number | null;
    percentile_after?: number | null;
    improvement_percent?: number | null;
  } | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemInfo {
  name: string;
  profile: "local" | "cloud";
  engine: string;
  database: string;
  limits: { max_import_rows: number; max_upload_mb: number };
  adaption: { configured: boolean; sdk_version: string | null; background_sync: boolean };
  data: DatasetMeta;
}

export interface ImportPreview {
  filename: string;
  headers: string[];
  row_count: number;
  mapping: Record<string, string | null>;
  has_dates: boolean;
  sample: Record<string, string>[];
  max_rows: number;
}

export interface ImportBatch {
  id: number;
  filename: string;
  kind: string;
  rows_total: number;
  rows_imported: number;
  rows_skipped: number;
  distinct_voices: number;
  timeline_simulated: boolean;
  created_at: string;
}
