"use client";

import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";

import { ChartContainer } from "@/components/ui/chart";
import { SENTIMENT_META, SENTIMENT_ORDER } from "@/lib/constants";
import { formatCompact, formatDate, formatNumber } from "@/lib/format";
import type { Dashboard } from "@/lib/types";

const config = Object.fromEntries(SENTIMENT_ORDER.map((s) => [s, { label: SENTIMENT_META[s].label, color: SENTIMENT_META[s].color }]));

export function SentimentLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {SENTIMENT_ORDER.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: SENTIMENT_META[s].color }} aria-hidden />
          {SENTIMENT_META[s].label}
        </li>
      ))}
    </ul>
  );
}

function TrendTooltip({
  active,
  payload,
  granularity,
}: {
  active?: boolean;
  payload?: { payload: Dashboard["trend"][number] }[];
  granularity: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="min-w-44 rounded-lg border bg-popover p-3 text-xs shadow-md">
      <p className="font-medium">
        {granularity === "week" ? "Week of " : ""}
        {formatDate(row.bucket, granularity === "month" ? "MMM yyyy" : "d MMM yyyy")}
      </p>
      <ul className="tabular mt-2 space-y-1">
        {SENTIMENT_ORDER.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span className="size-2.5 rounded-[3px]" style={{ background: SENTIMENT_META[s].color }} aria-hidden />
            <span className="flex-1 text-muted-foreground">{SENTIMENT_META[s].label}</span>
            <span className="font-medium">{formatNumber(row[s])}</span>
          </li>
        ))}
      </ul>
      <p className="tabular mt-2 flex justify-between border-t pt-2 text-muted-foreground">
        Complaint rate <span className="font-medium text-foreground">{row.complaint_rate}%</span>
      </p>
    </div>
  );
}

export function SentimentTrend({ trend, granularity }: { trend: Dashboard["trend"]; granularity: string }) {
  const tickFormat = granularity === "month" ? "MMM yy" : "d MMM";
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={trend} margin={{ top: 8, right: 4, left: -12, bottom: 0 }} barCategoryGap="22%" accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
        <XAxis
          dataKey="bucket"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={28}
          tickFormatter={(value: string) => formatDate(value, tickFormat)}
        />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatCompact(v)} allowDecimals={false} />
        <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<TrendTooltip granularity={granularity} />} />
        {SENTIMENT_ORDER.map((s, index) => (
          <Bar
            key={s}
            dataKey={s}
            stackId="sentiment"
            fill={SENTIMENT_META[s].color}
            // 2px surface-coloured gap between stacked segments.
            stroke="var(--card)"
            strokeWidth={2}
            maxBarSize={24}
            radius={index === SENTIMENT_ORDER.length - 1 ? [4, 4, 0, 0] : 0}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

// InsightFlow build iteration: commit 265

// InsightFlow build iteration: commit 266

// InsightFlow build iteration: commit 267

// InsightFlow build iteration: commit 317
