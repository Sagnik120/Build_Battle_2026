import { AlertTriangleIcon, ArrowDownRightIcon, ArrowUpRightIcon, InboxIcon, MinusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SENTIMENT_META, SEVERITY_LABEL, TIER_META } from "@/lib/constants";
import type { Sentiment, Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="no-print flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  className,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/** Coloured dot + plain-ink label: identity never rides on colour alone. */
export function SentimentBadge({ sentiment, className }: { sentiment: Sentiment; className?: string }) {
  const meta = SENTIMENT_META[sentiment];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", className)}>
      <span className="size-2 rounded-full" style={{ background: meta.color }} aria-hidden />
      {meta.label}
    </span>
  );
}

export function TierBadge({ tier, showLabel = false, className }: { tier: Tier; showLabel?: boolean; className?: string }) {
  const meta = TIER_META[tier];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", meta.className, className)}>
      {tier}
      {showLabel && <span className="font-medium opacity-90">· {meta.label}</span>}
    </span>
  );
}

const SEVERITY_STYLE: Record<number, string> = {
  4: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  3: "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  2: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  1: "text-muted-foreground",
};

export function SeverityBadge({ severity }: { severity: number }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", SEVERITY_STYLE[severity])}>
      {severity >= 4 && <AlertTriangleIcon className="size-3" aria-hidden />}
      {SEVERITY_LABEL[severity] ?? "—"}
    </span>
  );
}

/**
 * Change indicator. `goodWhen` says which direction is good news so that
 * "complaints up" reads as bad and "sentiment up" as good.
 */
export function Delta({
  value,
  unit = "%",
  goodWhen = "up",
  className,
}: {
  value: number | null | undefined;
  unit?: string;
  goodWhen?: "up" | "down";
  className?: string;
}) {
  if (value === null || value === undefined) return <span className={cn("text-xs text-muted-foreground", className)}>new</span>;
  const flat = Math.abs(value) < 0.05;
  const good = flat ? null : value > 0 === (goodWhen === "up");
  const Icon = flat ? MinusIcon : value > 0 ? ArrowUpRightIcon : ArrowDownRightIcon;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-0.5 text-xs font-medium",
        good === null ? "text-muted-foreground" : good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
        className
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {Math.abs(value).toFixed(1)}
      {unit}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = InboxIcon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="flex size-10 items-center justify-center rounded-full border bg-muted">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={AlertTriangleIcon}
      title="Couldn't load this"
      description={error instanceof Error ? error.message : "Something went wrong."}
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  );
}

export function SkeletonGrid({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}

/** Single-series trend line; no axes, the surrounding row names it. */
export function Sparkline({ values, className, stroke = "var(--chart-ink)" }: { values: number[]; className?: string; stroke?: string }) {
  if (values.length < 2) return <div className={cn("h-8 w-24", className)} />;
  const w = 96;
  const h = 32;
  const max = Math.max(...values, 1);
  const step = w / (values.length - 1);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 3 - (v / max) * (h - 6)).toFixed(1)}`);
  const [lastX, lastY] = points[points.length - 1].split(",");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-8 w-24 overflow-visible", className)} role="img" aria-label={`Trend: ${values.join(", ")}`}>
      <polyline points={points.join(" ")} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="3.5" fill={stroke} stroke="var(--card)" strokeWidth="2" />
    </svg>
  );
}

/** Thin labelled meter for 0..1 values. */
export function Meter({ value, label, hint }: { value: number; label: string; hint?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div title={hint}>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular font-medium">{pct}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-foreground/80" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
