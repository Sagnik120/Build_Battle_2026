"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, FileTextIcon, QuoteIcon, ScaleIcon, SlidersHorizontalIcon, SparklesIcon, TargetIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { StatusButton } from "@/components/jyotirmoydas/status-button";
import { FilterBar } from "@/components/shared/filter-bar";
import { Delta, EmptyState, ErrorState, Meter, PageHeader, Sparkline, TierBadge } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilters } from "@/hooks/use-filters";
import { api } from "@/lib/api";
import { FACTOR_META } from "@/lib/constants";
import { formatInr, formatInrShort, formatNumber } from "@/lib/format";
import type { Recommendation, Recommendations } from "@/lib/types";

const EFFORT_LABEL = { S: "Days", M: "Weeks", L: "A quarter" } as const;

function AssumptionsPopover({ data }: { data: Recommendations }) {
  const queryClient = useQueryClient();
  const [aov, setAov] = useState(String(data.assumptions.average_order_value));
  const save = useMutation({
    mutationFn: () => api.saveAssumptions({ average_order_value: Number(aov) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      toast.success("Assumption saved");
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontalIcon />
          Assumptions
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">How revenue at risk is estimated</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Unresolved complainants × average order value × the share assumed lost for that severity. It is an estimate to compare issues, not a forecast.
          </p>
        </div>
        <form
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Label htmlFor="aov">Average order value (₹)</Label>
          <div className="flex gap-2">
            <Input id="aov" type="number" min={1} step={1} value={aov} onChange={(e) => setAov(e.target.value)} />
            <Button type="submit" size="sm" disabled={save.isPending || !Number(aov)}>
              Save
            </Button>
          </div>
        </form>
        <dl className="tabular space-y-1 text-xs text-muted-foreground">
          {(["4", "3", "2", "1"] as const).map((sev) => (
            <div key={sev} className="flex justify-between">
              <dt>{{ "4": "Critical", "3": "High", "2": "Medium", "1": "Low" }[sev]} severity lost</dt>
              <dd className="text-foreground">{Math.round((data.assumptions.churn_by_severity[sev] ?? 0) * 100)}%</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const queryClient = useQueryClient();
  const track = useMutation({
    mutationFn: () => api.createIssue({ theme_id: rec.theme.theme_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      toast.success("Issue tracked", { description: rec.theme.label });
    },
    onError: (error) => toast.error(error.message),
  });
  const tracked = rec.tracked_issue_id !== null || track.isSuccess;

  return (
    <article className="print-break-avoid rounded-xl border bg-card">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b p-5">
        <span className="tabular flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold">{rec.rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{rec.theme.label}</h2>
            <TierBadge tier={rec.priority.tier} showLabel />
            {rec.theme.kind !== "known" && <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">Emerging</span>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{rec.headline}</p>
        </div>
        <div className="no-print flex shrink-0 items-center gap-2">
          {tracked ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/issues">
                <CheckIcon />
                Tracked
              </Link>
            </Button>
          ) : (
            <StatusButton
              radius="md"
              className="h-8 px-3 text-sm font-medium"
              colors={{ default: "bg-foreground text-background" }}
              icon={<TargetIcon className="size-4" />}
              variant={track.isPending ? "loading" : track.isError ? "error" : undefined}
              text={{ loading: "Tracking", error: "Failed" }}
              disabled={track.isPending}
              onClick={() => track.mutate()}
            >
              Track issue
            </StatusButton>
          )}
        </div>
      </header>

      <div className="grid gap-x-8 gap-y-6 p-5 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <div className="space-y-5">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="tabular text-4xl font-semibold tracking-tight">{rec.priority.score}</span>
              <span className="text-sm text-muted-foreground">/ 100 priority</span>
            </div>
            <div className="mt-3 space-y-2.5">
              {Object.entries(rec.priority.factors).map(([key, value]) => (
                <Meter key={key} value={value} label={FACTOR_META[key]?.label ?? key} hint={FACTOR_META[key]?.help} />
              ))}
            </div>
          </div>
          <dl className="tabular grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Complaints</dt>
              <dd className="font-semibold">{formatNumber(rec.metrics.complaints)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Unresolved</dt>
              <dd className="font-semibold">{rec.priority.unresolved_pct.toFixed(0)}%</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Revenue at risk</dt>
              <dd className="font-semibold" title={formatInr(rec.revenue_at_risk)}>
                {formatInrShort(rec.revenue_at_risk)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Change</dt>
              <dd>
                <Delta value={rec.priority.change_pct} goodWhen="down" className="text-sm" />
              </dd>
            </div>
          </dl>
          <div>
            <div className="text-xs text-muted-foreground">Complaints over the period</div>
            <Sparkline values={rec.metrics.series} className="mt-1.5 h-10 w-32" />
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Why this needs attention</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {rec.priority.reasons.map((reason) => (
                <li key={reason} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground" aria-hidden />
                  {reason}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recommended actions</h3>
            <ol className="mt-2 space-y-2">
              {rec.actions.map((action, index) => (
                <li key={action.title} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">
                      {index + 1}. {action.title}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {action.owner} · {EFFORT_LABEL[action.effort]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{action.detail}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Measure:</span> {action.metric}
                  </p>
                </li>
              ))}
            </ol>
          </section>

          {rec.adaption && (
            <section className="rounded-lg border border-dashed p-3">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <SparklesIcon className="size-3.5" />
                Root-cause analysis by Adaption · {rec.adaption.messages_enriched} messages
              </h3>
              {rec.adaption.root_causes.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {rec.adaption.root_causes.map((cause) => (
                    <li key={cause}>{cause}</li>
                  ))}
                </ul>
              )}
              {rec.adaption.suggested_actions.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {rec.adaption.suggested_actions.map((action) => (
                    <li key={action}>→ {action}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {rec.evidence.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">What customers said</h3>
              <ul className="mt-2 space-y-2">
                {rec.evidence.map((quote) => (
                  <li key={quote.text} className="flex gap-2 text-sm">
                    <QuoteIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span>
                      {quote.text} <span className="tabular text-xs text-muted-foreground">×{formatNumber(quote.count)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {rec.compliance && (
            <p className="flex gap-2 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
              <ScaleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                <span className="font-medium text-foreground">Compliance (India): </span>
                {rec.compliance}
              </span>
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export function InsightsView() {
  const router = useRouter();
  const { filters } = useFilters();
  const query = useQuery({ queryKey: ["recommendations", filters], queryFn: () => api.recommendations({ ...filters }) });
  const data = query.data;

  const report = useMutation({
    mutationFn: () => api.createReport({ filters: { ...filters, categories: filters.category, sentiments: filters.sentiment, theme_ids: filters.theme, sources: filters.source } }),
    onSuccess: (created) => router.push(`/reports/${created.id}`),
    onError: (error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader title="Priorities" description="What to fix first, why it matters, and what to do about it — ranked from the feedback itself.">
        {data && <AssumptionsPopover data={data} />}
        <Button size="sm" onClick={() => report.mutate()} disabled={report.isPending || !data?.items.length}>
          <FileTextIcon />
          {report.isPending ? "Generating…" : "Generate report"}
        </Button>
      </PageHeader>

      <FilterBar />

      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No issues to prioritise" description="There are no complaints in this selection. Clear the filters or import more feedback." />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Fix now (P0)", value: formatNumber(data.totals.p0 ?? 0), sub: `${data.totals.p1 ?? 0} more for this sprint` },
              { label: "Complaints covered", value: formatNumber(data.totals.complaints), sub: `${data.items.length} recurring issues` },
              { label: "Revenue at risk", value: formatInrShort(data.totals.revenue_at_risk), sub: `Estimate at ${formatInr(data.assumptions.average_order_value)} per order` },
              { label: "Top issue", value: data.items[0].theme.label, sub: `${formatNumber(data.items[0].metrics.complaints)} complaints`, small: true },
            ].map((stat) => (
              <div key={stat.label} className="bg-card p-4">
                <div className="text-xs font-medium text-muted-foreground">{stat.label}</div>
                <div className={stat.small ? "mt-2 text-base leading-tight font-semibold" : "tabular mt-2 text-2xl font-semibold tracking-tight"}>{stat.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{stat.sub}</div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Priority score = {Object.entries(data.weights).map(([k, w]) => `${Math.round(w * 100)}% ${(FACTOR_META[k]?.label ?? k).toLowerCase()}`).join(" + ")}. Hover a factor to see what it measures.
            {data.timeline_simulated && " Growth is measured on dates derived from row order, because the source file had no timestamps."}
          </p>

          {data.items.map((rec) => (
            <RecommendationCard key={rec.theme.slug} rec={rec} />
          ))}
        </div>
      )}
    </>
  );
}

// InsightFlow build iteration: commit 271

// InsightFlow build iteration: commit 272

// InsightFlow build iteration: commit 273

// InsightFlow build iteration: commit 274
