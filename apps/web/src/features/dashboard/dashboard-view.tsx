"use client";

import { useQuery } from "@tanstack/react-query";
import { InfoIcon, UploadIcon } from "lucide-react";
import Link from "next/link";

import { FilterBar } from "@/components/shared/filter-bar";
import { Delta, EmptyState, ErrorState, PageHeader, Panel, SkeletonGrid } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CategoryBreakdown,
  MoreLink,
  PraiseList,
  SentimentDistribution,
  SeverityBreakdown,
  TopIssues,
} from "@/features/dashboard/breakdowns";
import { SentimentLegend, SentimentTrend } from "@/features/dashboard/sentiment-trend";
import { useFilters } from "@/hooks/use-filters";
import { api } from "@/lib/api";
import { formatDate, formatNumber, formatSigned } from "@/lib/format";
import type { Dashboard } from "@/lib/types";

function Kpi({
  label,
  value,
  sub,
  delta,
  help,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: React.ReactNode;
  help: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium">{label}</span>
        <Tooltip>
          <TooltipTrigger aria-label={`About ${label}`}>
            <InfoIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent className="max-w-60">{help}</TooltipContent>
        </Tooltip>
      </div>
      <div className="tabular mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</div>
      <div className="mt-1 flex min-h-5 items-center gap-2 text-xs text-muted-foreground">
        {delta}
        {sub && <span className="truncate">{sub}</span>}
      </div>
    </div>
  );
}

function KpiRow({ data }: { data: Dashboard }) {
  const { kpis, change, meta } = data;
  const vs = "vs. earlier half";
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5">
      <Kpi
        label="Feedback analysed"
        value={formatNumber(kpis.total)}
        sub={change ? vs : `${formatNumber(meta.distinct_voices)} distinct messages`}
        delta={change && <Delta value={change.total_pct} />}
        help={`Every entry in the selected period. Identical messages are analysed once and counted each time — ${formatNumber(meta.distinct_voices)} distinct messages across the workspace.`}
      />
      <Kpi
        label="Net sentiment"
        value={formatSigned(kpis.nss, 0)}
        sub={change ? vs : undefined}
        delta={change && <Delta value={change.nss_pts} unit=" pts" />}
        help="Share of positive feedback minus share of negative, from −100 to +100."
      />
      <Kpi
        label="Complaint rate"
        value={`${kpis.complaint_rate.toFixed(0)}%`}
        sub={change ? vs : undefined}
        delta={change && <Delta value={change.complaint_rate_pts} unit=" pts" goodWhen="down" />}
        help="Share of feedback that reports a problem, including problems that were later fixed."
      />
      <Kpi
        label="Left unresolved"
        value={`${kpis.unresolved_rate.toFixed(0)}%`}
        sub={change ? vs : undefined}
        delta={change && <Delta value={change.unresolved_rate_pts} unit=" pts" goodWhen="down" />}
        help="Of all complaints, the share that mention no fix, refund, replacement or follow-up."
      />
      <Kpi
        label="Critical complaints"
        value={formatNumber(kpis.critical)}
        sub={change ? vs : undefined}
        delta={change && <Delta value={change.critical_pct} goodWhen="down" />}
        help="Complaints involving fraud, lost money or counterfeit goods — the highest severity class."
      />
    </div>
  );
}

export function DashboardView() {
  const { filters, carry } = useFilters();
  const query = useQuery({ queryKey: ["dashboard", filters], queryFn: () => api.dashboard({ ...filters }) });
  const data = query.data;

  const withFilter = (extra: Record<string, string | number>) => {
    const params = new URLSearchParams(carry.replace(/^\?/, ""));
    Object.entries(extra).forEach(([k, v]) => params.set(k, String(v)));
    return `/feedback?${params.toString()}`;
  };
  const themeLink = (id: number | null) => (id === null ? "/feedback" : withFilter({ theme: id }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          data?.window
            ? `${formatDate(data.window.start)} – ${formatDate(data.window.end)} · what customers are saying and how it is changing.`
            : "What customers are saying and how it is changing."
        }
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/feedback?import=1">
            <UploadIcon />
            Import feedback
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href={`/insights${carry}`}>See priorities</Link>
        </Button>
      </PageHeader>

      <FilterBar />

      {query.isLoading ? (
        <div className="space-y-4">
          <SkeletonGrid count={5} className="xl:grid-cols-5" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !data || data.empty ? (
        <EmptyState
          title={data?.meta.total_feedback ? "Nothing matches these filters" : "No feedback yet"}
          description={
            data?.meta.total_feedback
              ? "Widen the date range or clear a filter to see results."
              : "Import a CSV or load the sample dataset to see sentiment, themes and priorities."
          }
          action={
            !data?.meta.total_feedback && (
              <Button asChild size="sm">
                <Link href="/feedback?import=1">Add feedback</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          <KpiRow data={data} />

          {data.meta.timeline_simulated && (
            <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {formatNumber(data.meta.simulated_rows)} entries had no timestamp in the source file, so their dates were derived from row order.
                Trend lines for those entries show order of arrival, not calendar dates.
              </span>
            </p>
          )}

          <div className="grid gap-4 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title="Sentiment over time"
              description={`Feedback per ${data.window!.granularity}, split by sentiment`}
              action={<SentimentLegend />}
            >
              <SentimentTrend trend={data.trend} granularity={data.window!.granularity} />
            </Panel>
            <Panel title="Sentiment split" description="Share of all feedback in the period">
              <SentimentDistribution kpis={data.kpis} />
            </Panel>
          </div>

          <Panel
            title="Most reported issues"
            description="Ranked by priority score: reach, severity, unresolved share and growth"
            action={<MoreLink href={`/insights${carry}`}>Recommendations</MoreLink>}
          >
            {data.top_issues.length ? (
              <TopIssues issues={data.top_issues} linkFor={themeLink} />
            ) : (
              <p className="text-sm text-muted-foreground">No complaints in this selection.</p>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title="By category" description="Sentiment mix within each category">
              <CategoryBreakdown rows={data.by_category} carry={(category) => withFilter({ category })} />
            </Panel>
            <Panel title="Complaints by severity" description="Critical = fraud, lost money, counterfeit">
              <SeverityBreakdown rows={data.severity} />
            </Panel>
            <Panel title="What customers like" description="Positive mentions by theme">
              {data.top_praise.length ? (
                <PraiseList rows={data.top_praise} linkFor={themeLink} />
              ) : (
                <p className="text-sm text-muted-foreground">No positive themes in this selection.</p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}

// InsightFlow build iteration: commit 261

// InsightFlow build iteration: commit 262
