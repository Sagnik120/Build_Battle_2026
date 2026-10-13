"use client";

import { Logo } from "@/components/layout/logo";
import { TierBadge } from "@/components/shared/primitives";
import { CategoryBreakdown, SentimentDistribution } from "@/features/dashboard/breakdowns";
import { SentimentLegend, SentimentTrend } from "@/features/dashboard/sentiment-trend";
import { formatDate, formatInr, formatInrShort, formatNumber, formatSigned } from "@/lib/format";
import type { Report } from "@/lib/types";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="print-break-avoid border-t pt-6">
      <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The business-facing report: used in-app, on the public share link and for print/PDF. */
export function ReportDocument({ report }: { report: Report }) {
  const { dashboard, recommendations, summary, issues, methodology, generated_at } = report.payload;
  const k = dashboard.kpis;

  return (
    <article className="mx-auto max-w-4xl space-y-8 rounded-xl border bg-card p-6 sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0">
      <header>
        <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
          <Logo className="text-foreground" />
          <span>Generated {formatDate(generated_at)}</span>
        </div>
        <h1 className="mt-8 text-3xl font-semibold tracking-tight text-balance">{report.title}</h1>
        {dashboard.window && (
          <p className="mt-2 text-sm text-muted-foreground">
            Feedback from {formatDate(dashboard.window.start)} to {formatDate(dashboard.window.end)}
          </p>
        )}
      </header>

      {dashboard.empty ? (
        <p className="text-sm text-muted-foreground">There was no feedback in the selected range when this report was generated.</p>
      ) : (
        <>
          <Section title="Executive summary">
            <ul className="space-y-2 text-[15px] leading-relaxed">
              {summary.map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-foreground" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Key numbers">
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
              {[
                ["Feedback analysed", formatNumber(k.total)],
                ["Net sentiment", formatSigned(k.nss, 0)],
                ["Complaint rate", `${k.complaint_rate.toFixed(0)}%`],
                ["Left unresolved", `${k.unresolved_rate.toFixed(0)}%`],
                ["Critical complaints", formatNumber(k.critical)],
              ].map(([label, value]) => (
                <div key={label} className="bg-card p-4">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Sentiment">
            <div className="grid gap-8 md:grid-cols-[1fr_15rem]">
              <div>
                <div className="mb-2 flex justify-end">
                  <SentimentLegend />
                </div>
                <SentimentTrend trend={dashboard.trend} granularity={dashboard.window!.granularity} />
              </div>
              <SentimentDistribution kpis={k} />
            </div>
            <div className="mt-8">
              <h3 className="mb-3 text-sm font-medium">By category</h3>
              <CategoryBreakdown rows={dashboard.by_category} carry={() => "#"} />
            </div>
          </Section>

          <Section title="Priority issues and what to do">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Issue</th>
                    <th className="py-2 pr-3 text-right font-medium">Complaints</th>
                    <th className="py-2 pr-3 text-right font-medium">Unresolved</th>
                    <th className="py-2 pr-3 text-right font-medium">Revenue at risk</th>
                    <th className="py-2 text-right font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {recommendations.items.map((r) => (
                    <tr key={r.theme.slug} className="border-b last:border-0">
                      <td className="tabular py-2 pr-3 text-muted-foreground">{r.rank}</td>
                      <td className="py-2 pr-3 font-medium">{r.theme.label}</td>
                      <td className="tabular py-2 pr-3 text-right">{formatNumber(r.metrics.complaints)}</td>
                      <td className="tabular py-2 pr-3 text-right">{r.priority.unresolved_pct.toFixed(0)}%</td>
                      <td className="tabular py-2 pr-3 text-right">{formatInrShort(r.revenue_at_risk)}</td>
                      <td className="py-2 text-right">
                        <span className="tabular mr-2 text-xs text-muted-foreground">{r.priority.score}</span>
                        <TierBadge tier={r.priority.tier} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-8 space-y-8">
              {recommendations.items.slice(0, 5).map((r) => (
                <div key={r.theme.slug} className="print-break-avoid">
                  <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
                    {r.rank}. {r.theme.label}
                    <TierBadge tier={r.priority.tier} showLabel />
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{r.headline}</p>
                  <div className="mt-3 grid gap-6 md:grid-cols-2">
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground">Why it matters</h4>
                      <ul className="mt-1.5 space-y-1 text-sm">
                        {r.priority.reasons.map((reason) => (
                          <li key={reason}>• {reason}</li>
                        ))}
                      </ul>
                      {r.evidence[0] && (
                        <blockquote className="mt-3 border-l-2 pl-3 text-sm text-muted-foreground italic">
                          “{r.evidence[0].text}” <span className="not-italic">×{formatNumber(r.evidence[0].count)}</span>
                        </blockquote>
                      )}
                    </div>
                    <div>
                      <h4 className="text-xs font-medium text-muted-foreground">Recommended actions</h4>
                      <ol className="mt-1.5 space-y-2 text-sm">
                        {r.actions.map((a, i) => (
                          <li key={a.title}>
                            <span className="font-medium">
                              {i + 1}. {a.title}
                            </span>{" "}
                            <span className="text-muted-foreground">
                              — {a.owner}. Measure: {a.metric}.
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                  {r.adaption && (r.adaption.root_causes.length > 0 || r.adaption.suggested_actions.length > 0) && (
                    <div className="mt-3 rounded-md border border-dashed p-3 text-sm">
                      <h4 className="text-xs font-medium text-muted-foreground">
                        Root-cause analysis by Adaption · {formatNumber(r.adaption.messages_enriched)} distinct messages
                      </h4>
                      {r.adaption.root_causes[0] && (
                        <p className="mt-1.5">
                          <span className="font-medium">Likely cause:</span> {r.adaption.root_causes[0]}
                        </p>
                      )}
                      {r.adaption.suggested_actions[0] && (
                        <p className="mt-1">
                          <span className="font-medium">Suggested fix:</span> {r.adaption.suggested_actions[0]}
                        </p>
                      )}
                    </div>
                  )}
                  {r.compliance && <p className="mt-3 rounded-md bg-muted/60 p-2.5 text-xs text-muted-foreground">Compliance (India): {r.compliance}</p>}
                </div>
              ))}
            </div>
          </Section>

          {issues.length > 0 && (
            <Section title="Issues being tracked">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Issue</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Owner</th>
                    <th className="py-2 text-right font-medium">Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr key={issue.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{issue.title}</td>
                      <td className="py-2 pr-3">{issue.status_label}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{issue.owner ?? "Unassigned"}</td>
                      <td className="py-2 text-right">
                        <TierBadge tier={issue.priority} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          <Section title="How this was produced">
            <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
              {methodology.map((line) => (
                <li key={line}>• {line}</li>
              ))}
              <li>
                • Revenue at risk uses an average order value of {formatInr(recommendations.assumptions.average_order_value)}; total across listed issues{" "}
                {formatInr(recommendations.totals.revenue_at_risk)}.
              </li>
            </ul>
          </Section>
        </>
      )}
    </article>
  );
}
