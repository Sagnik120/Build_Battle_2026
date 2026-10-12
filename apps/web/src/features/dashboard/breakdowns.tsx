"use client";

import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

import { Delta, Sparkline, TierBadge } from "@/components/shared/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SENTIMENT_META, SENTIMENT_ORDER, SEVERITY_LABEL } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import type { Dashboard, SentimentCounts, ThemeRow } from "@/lib/types";

/** 100% stacked bar: parts of a whole for four sentiment classes. */
export function SentimentStack({ counts, height = "h-3" }: { counts: Pick<SentimentCounts, "positive" | "mixed" | "neutral" | "negative">; height?: string }) {
  const total = SENTIMENT_ORDER.reduce((n, s) => n + counts[s], 0);
  if (!total) return <div className={`${height} rounded-full bg-muted`} />;
  return (
    <div className={`flex ${height} gap-0.5 overflow-hidden rounded-full`}>
      {SENTIMENT_ORDER.filter((s) => counts[s] > 0).map((s) => (
        <Tooltip key={s}>
          <TooltipTrigger asChild>
            <div className="h-full min-w-1 transition-opacity hover:opacity-80" style={{ width: `${(counts[s] / total) * 100}%`, background: SENTIMENT_META[s].color }} />
          </TooltipTrigger>
          <TooltipContent>
            {SENTIMENT_META[s].label}: {formatNumber(counts[s])} ({((counts[s] / total) * 100).toFixed(1)}%)
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function SentimentDistribution({ kpis }: { kpis: Dashboard["kpis"] }) {
  return (
    <div>
      <SentimentStack counts={kpis} height="h-4" />
      <dl className="mt-4 space-y-2.5">
        {SENTIMENT_ORDER.map((s) => (
          <div key={s} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-[3px]" style={{ background: SENTIMENT_META[s].color }} aria-hidden />
            <dt className="flex-1 text-muted-foreground">{SENTIMENT_META[s].label}</dt>
            <dd className="tabular font-medium">{formatNumber(kpis[s])}</dd>
            <dd className="tabular w-12 text-right text-xs text-muted-foreground">{kpis.total ? ((kpis[s] / kpis.total) * 100).toFixed(1) : 0}%</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function CategoryBreakdown({ rows, carry }: { rows: Dashboard["by_category"]; carry: (category: string) => string }) {
  return (
    <ul className="space-y-4">
      {rows.map((row) => (
        <li key={row.category}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <Link href={carry(row.category)} className="truncate font-medium underline-offset-4 hover:underline">
              {row.category}
            </Link>
            <span className="tabular shrink-0 text-xs text-muted-foreground">
              {formatNumber(row.total)} · {row.complaint_rate}% complaints
            </span>
          </div>
          <SentimentStack counts={row} />
        </li>
      ))}
    </ul>
  );
}

const SEVERITY_COLOR: Record<number, string> = {
  4: "var(--status-critical)",
  3: "var(--status-serious)",
  2: "var(--status-warning)",
  1: "var(--status-good)",
};

export function SeverityBreakdown({ rows }: { rows: Dashboard["severity"] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.severity} className="grid grid-cols-[4.5rem_1fr_3.5rem] items-center gap-3 text-sm">
          <span className="text-muted-foreground">{SEVERITY_LABEL[row.severity]}</span>
          <div className="h-2.5 rounded-r-[4px] bg-transparent">
            <div className="h-full rounded-r-[4px]" style={{ width: `${Math.max((row.count / max) * 100, row.count ? 1.5 : 0)}%`, background: SEVERITY_COLOR[row.severity] }} />
          </div>
          <span className="tabular text-right font-medium">{formatNumber(row.count)}</span>
        </li>
      ))}
    </ul>
  );
}

export function TopIssues({ issues, linkFor }: { issues: ThemeRow[]; linkFor: (themeId: number | null) => string }) {
  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="py-2 pr-3 pl-5 font-medium">Issue</th>
            <th className="px-3 py-2 text-right font-medium">Complaints</th>
            <th className="px-3 py-2 text-right font-medium">Unresolved</th>
            <th className="px-3 py-2 text-right font-medium">Change</th>
            <th className="px-3 py-2 font-medium">Trend</th>
            <th className="py-2 pr-5 pl-3 text-right font-medium">Priority</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => (
            <tr key={issue.slug} className="group border-b last:border-0 hover:bg-muted/40">
              <td className="py-2.5 pr-3 pl-5">
                <Link href={linkFor(issue.theme_id)} className="font-medium underline-offset-4 group-hover:underline">
                  {issue.label}
                </Link>
                <div className="text-xs text-muted-foreground">{issue.area}</div>
              </td>
              <td className="tabular px-3 text-right font-medium">{formatNumber(issue.complaints)}</td>
              <td className="tabular px-3 text-right text-muted-foreground">{issue.priority.unresolved_pct.toFixed(0)}%</td>
              <td className="px-3 text-right">
                <Delta value={issue.priority.change_pct} goodWhen="down" />
              </td>
              <td className="px-3">
                <Sparkline values={issue.series} />
              </td>
              <td className="py-2.5 pr-5 pl-3 text-right">
                <span className="tabular mr-2 text-xs text-muted-foreground">{issue.priority.score}</span>
                <TierBadge tier={issue.priority.tier} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PraiseList({ rows, linkFor }: { rows: ThemeRow[]; linkFor: (themeId: number | null) => string }) {
  const max = Math.max(...rows.map((r) => r.positive), 1);
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.slug}>
          <Link href={linkFor(row.theme_id)} className="group block">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium underline-offset-4 group-hover:underline">{row.label}</span>
              <span className="tabular shrink-0 text-muted-foreground">{formatNumber(row.positive)}</span>
            </div>
            <div className="mt-1.5 h-1.5">
              <div className="h-full rounded-r-[4px]" style={{ width: `${(row.positive / max) * 100}%`, background: "var(--sentiment-positive)" }} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
      {children}
      <ArrowRightIcon className="size-3.5" />
    </Link>
  );
}

// InsightFlow build iteration: commit 268

// InsightFlow build iteration: commit 269
