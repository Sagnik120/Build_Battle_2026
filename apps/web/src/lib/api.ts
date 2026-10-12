import type {
  AdaptionRun,
  AdaptionStatus,
  Assumptions,
  Dashboard,
  Facets,
  FeedbackItem,
  ImportBatch,
  ImportPreview,
  Issue,
  Paginated,
  Recommendations,
  Report,
  ReportSummary,
  SystemInfo,
  ThemeRow,
} from "@/lib/types";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, "");
const BASE = `${API_URL}/api/v1`;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | string[] | number[] | null | undefined>;

export function toQuery(params: Params = {}): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "" || value === false) continue;
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, String(v)));
    else qs.set(key, String(value));
  }
  const out = qs.toString();
  return out ? `?${out}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Can't reach the InsightFlow API. It may be waking up — try again in a moment.", 0, "network");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message =
      body?.error?.message ??
      (Array.isArray(body?.detail) ? body.detail[0]?.msg : body?.detail) ??
      `Request failed (${response.status})`;
    throw new ApiError(message, response.status, body?.error?.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const exportUrl = (path: string, params?: Params) => `${BASE}${path}${toQuery(params)}`;

export const api = {
  health: () => request<{ status: string }>("/health"),
  systemInfo: () => request<SystemInfo>("/system/info"),
  resetWorkspace: () => post<{ status: string }>("/system/reset?confirm=delete-everything"),

  dashboard: (filters: Params) => request<Dashboard>(`/analytics/dashboard${toQuery(filters)}`),
  themes: (filters: Params) => request<{ items: ThemeRow[] }>(`/themes${toQuery(filters)}`),
  recommendations: (filters: Params) => request<Recommendations>(`/recommendations${toQuery(filters)}`),
  rerunAnalysis: () => post<{ analysed: number; engine: string }>("/analysis/run"),
  assumptions: () => request<Assumptions>("/settings/assumptions"),
  saveAssumptions: (body: Partial<Assumptions>) =>
    request<Assumptions>("/settings/assumptions", { method: "PUT", body: JSON.stringify(body) }),

  feedback: (params: Params) => request<Paginated<FeedbackItem>>(`/feedback${toQuery(params)}`),
  facets: () => request<Facets>("/feedback/facets"),
  submitFeedback: (body: { text: string; category?: string; source?: string; rating?: number | null; customer?: string }) =>
    post<FeedbackItem>("/feedback", body),
  deleteFeedback: (id: number) => request<void>(`/feedback/${id}`, { method: "DELETE" }),
  previewImport: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ImportPreview>("/feedback/import/preview", { method: "POST", body: form });
  },
  importCsv: (file: File, mapping: Record<string, string | null>, timeline: "spread" | "now", timelineDays: number) => {
    const form = new FormData();
    form.append("file", file);
    form.append("mapping", JSON.stringify(mapping));
    form.append("timeline", timeline);
    form.append("timeline_days", String(timelineDays));
    return request<ImportBatch>("/feedback/import", { method: "POST", body: form });
  },
  loadSample: (replace = false) => post<ImportBatch>(`/feedback/sample${toQuery({ replace })}`),
  batches: () => request<ImportBatch[]>("/feedback/batches"),

  issues: () => request<{ items: Issue[] }>("/issues"),
  createIssue: (body: Partial<Pick<Issue, "title" | "description" | "theme_id" | "priority" | "owner" | "due_date">>) =>
    post<Issue>("/issues", body),
  updateIssue: (id: number, body: Record<string, unknown>) =>
    request<Issue>(`/issues/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteIssue: (id: number) => request<void>(`/issues/${id}`, { method: "DELETE" }),

  reports: () => request<{ items: ReportSummary[] }>("/reports"),
  report: (id: number | string) => request<Report>(`/reports/${id}`),
  sharedReport: (token: string) => request<Report>(`/public/reports/${token}`),
  createReport: (body: { title?: string; filters: Record<string, unknown> }) => post<Report>("/reports", body),
  deleteReport: (id: number) => request<void>(`/reports/${id}`, { method: "DELETE" }),

  adaptionStatus: () => request<AdaptionStatus>("/adaption/status"),
  adaptionRuns: () => request<{ items: AdaptionRun[] }>("/adaption/runs"),
  createAdaptionRun: (body: { scope: string; max_rows?: number | null; reasoning_traces?: boolean }) =>
    post<AdaptionRun>("/adaption/runs", body),
  advanceAdaptionRun: (id: number) => post<AdaptionRun>(`/adaption/runs/${id}/advance`),
  launchAdaptionRun: (id: number) => post<AdaptionRun>(`/adaption/runs/${id}/launch`),
  cancelAdaptionRun: (id: number) => post<AdaptionRun>(`/adaption/runs/${id}/cancel`),
  importAdapted: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<AdaptionRun>("/adaption/import", { method: "POST", body: form });
  },
};
