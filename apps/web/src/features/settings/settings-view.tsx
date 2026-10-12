"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorState, PageHeader, Panel } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { API_URL, api } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right font-medium">{children}</dd>
    </div>
  );
}

function AssumptionsForm() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["assumptions"], queryFn: api.assumptions });
  const [aov, setAov] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.saveAssumptions({ average_order_value: Number(aov) }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Saved");
    },
    onError: (error) => toast.error(error.message),
  });
  if (!query.data) return <Skeleton className="h-16" />;
  const value = aov ?? String(query.data.average_order_value);
  return (
    <form
      className="max-w-sm space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Label htmlFor="settings-aov">Average order value (₹)</Label>
      <div className="flex gap-2">
        <Input id="settings-aov" type="number" min={1} value={value} onChange={(e) => setAov(e.target.value)} />
        <Button type="submit" disabled={aov === null || !Number(aov) || save.isPending}>
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Used only to estimate revenue at risk on the Priorities page and in reports.</p>
    </form>
  );
}

export function SettingsView() {
  const queryClient = useQueryClient();
  const info = useQuery({ queryKey: ["system"], queryFn: api.systemInfo });
  const batches = useQuery({ queryKey: ["batches"], queryFn: api.batches });

  const done = (message: string) => () => {
    queryClient.invalidateQueries();
    toast.success(message);
  };
  const fail = (error: Error) => toast.error(error.message);
  const rerun = useMutation({ mutationFn: api.rerunAnalysis, onSuccess: done("Analysis re-run"), onError: fail });
  const sample = useMutation({ mutationFn: () => api.loadSample(true), onSuccess: done("Sample dataset loaded"), onError: fail });
  const reset = useMutation({ mutationFn: api.resetWorkspace, onSuccess: done("Workspace cleared"), onError: fail });

  return (
    <>
      <PageHeader title="Settings" description="Workspace data, business assumptions and how this deployment is configured." />
      {info.isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : info.isError || !info.data ? (
        <ErrorState error={info.error} onRetry={() => info.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Deployment" description="The API picks its engine and limits from the active profile.">
            <dl className="divide-y">
              <Fact label="Profile">
                <span className="font-mono uppercase">{info.data.profile}</span>
              </Fact>
              <Fact label="Analysis engine">
                <span className="font-mono">{info.data.engine}</span>
              </Fact>
              <Fact label="Database">
                <span className="capitalize">{info.data.database}</span>
              </Fact>
              <Fact label="Import limit">
                {formatNumber(info.data.limits.max_import_rows)} rows · {info.data.limits.max_upload_mb} MB
              </Fact>
              <Fact label="Adaption">{info.data.adaption.configured ? "Connected" : "Not connected"}</Fact>
              <Fact label="API">
                <span className="font-mono text-xs break-all">{API_URL}</span>
              </Fact>
            </dl>
          </Panel>

          <Panel title="Business assumptions">
            <AssumptionsForm />
          </Panel>

          <Panel title="Data" description={`${formatNumber(info.data.data.total_feedback)} entries · ${formatNumber(info.data.data.distinct_voices)} distinct messages`}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Re-run analysis</p>
                  <p className="text-xs text-muted-foreground">Recomputes sentiment and themes with the built-in engine. Adaption results are kept.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => rerun.mutate()} disabled={rerun.isPending}>
                  <RefreshCwIcon className={rerun.isPending ? "animate-spin" : undefined} />
                  Re-run
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Sample dataset</p>
                  <p className="text-xs text-muted-foreground">Build Battle 2026 customer feedback: 7,000 reviews in four categories. Reloading replaces the existing sample rows.</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => sample.mutate()} disabled={sample.isPending}>
                  <DatabaseIcon />
                  {sample.isPending ? "Loading…" : "Load sample"}
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Clear workspace</p>
                  <p className="text-xs text-muted-foreground">Deletes all feedback, analysis, issues, reports and run history.</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={reset.isPending}
                  onClick={() => window.confirm("Delete ALL feedback, issues and reports in this workspace? This cannot be undone.") && reset.mutate()}
                >
                  <Trash2Icon />
                  Clear everything
                </Button>
              </div>
            </div>
          </Panel>

          <Panel title="Import history">
            {!batches.data?.length ? (
              <p className="text-sm text-muted-foreground">No imports yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {batches.data.map((batch) => (
                  <li key={batch.id} className="flex items-baseline justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{batch.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(batch.created_at, "d MMM yyyy, HH:mm")}
                        {batch.timeline_simulated && " · dates derived from row order"}
                      </p>
                    </div>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">
                      {formatNumber(batch.rows_imported)} rows · {formatNumber(batch.distinct_voices)} distinct
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
