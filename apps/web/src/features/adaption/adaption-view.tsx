"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2Icon, ChevronRightIcon, CircleDashedIcon, DownloadIcon, ExternalLinkIcon, UploadIcon, XCircleIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ShimmeringText } from "@/components/jyotirmoydas/shimmering-text";
import { StatusButton } from "@/components/jyotirmoydas/status-button";
import { ErrorState, PageHeader, Panel } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { api, exportUrl } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import type { AdaptionRun, AdaptionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const PIPELINE = [
  { title: "De-duplicate", body: "Identical messages collapse into one row, so you pay Adaption once per distinct message." },
  { title: "Upload dataset", body: "One row per message with ref, feedback and category columns goes to Adaptive Data." },
  { title: "Adapt", body: "A universal prompt asks for sentiment, severity, theme, root cause and a suggested fix as JSON for every row." },
  { title: "Merge back", body: "Results are matched by ref and replace the local engine's read. Dashboards and priorities update." },
  { title: "Quality grade", body: "Adaption's before/after dataset evaluation is stored with the run." },
];

const STAGE_COPY: Record<AdaptionRun["stage"], string> = {
  ingesting: "Adaption is ingesting the dataset",
  estimated: "Ready to launch",
  running: "Adaption is analysing the feedback",
  completed: "Completed",
  failed: "Failed",
};

function StageIcon({ stage }: { stage: AdaptionRun["stage"] }) {
  if (stage === "completed") return <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />;
  if (stage === "failed") return <XCircleIcon className="size-4 text-rose-600 dark:text-rose-400" />;
  return <CircleDashedIcon className="size-4 animate-spin text-muted-foreground [animation-duration:3s]" />;
}

function Quality({ quality }: { quality: NonNullable<AdaptionRun["quality"]> }) {
  if (!quality.grade_after && quality.score_after == null) return null;
  return (
    <dl className="tabular mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border text-sm">
      <div className="bg-card p-3">
        <dt className="text-xs text-muted-foreground">Dataset grade</dt>
        <dd className="mt-0.5 font-semibold">
          {quality.grade_before ?? "—"} → {quality.grade_after ?? "—"}
        </dd>
      </div>
      <div className="bg-card p-3">
        <dt className="text-xs text-muted-foreground">Quality score</dt>
        <dd className="mt-0.5 font-semibold">
          {quality.score_before?.toFixed(1) ?? "—"} → {quality.score_after?.toFixed(1) ?? "—"}
        </dd>
      </div>
      <div className="bg-card p-3">
        <dt className="text-xs text-muted-foreground">Improvement</dt>
        <dd className="mt-0.5 font-semibold">{quality.improvement_percent != null ? `${quality.improvement_percent.toFixed(0)}%` : "—"}</dd>
      </div>
    </dl>
  );
}

function RunCard({ run }: { run: AdaptionRun }) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries();
  const launch = useMutation({ mutationFn: () => api.launchAdaptionRun(run.id), onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const cancel = useMutation({ mutationFn: () => api.cancelAdaptionRun(run.id), onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const active = run.stage === "ingesting" || run.stage === "running";

  return (
    <li className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <StageIcon stage={run.stage} />
          {active ? <ShimmeringText text={STAGE_COPY[run.stage]} /> : STAGE_COPY[run.stage]}
        </div>
        <span className="text-xs text-muted-foreground">
          Run #{run.id} · {run.mode === "manual" ? "manual import" : "API"} · {formatDate(run.created_at, "d MMM, HH:mm")}
        </span>
      </div>

      {run.stage === "running" && <Progress value={run.progress_percent ?? 0} className="mt-3 h-1.5" />}

      <dl className="tabular mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
        {run.rows_sent > 0 && (
          <div>
            Rows sent <span className="font-medium text-foreground">{formatNumber(run.rows_sent)}</span>
          </div>
        )}
        {run.estimated_credits != null && (
          <div>
            Estimated credits <span className="font-medium text-foreground">{formatNumber(run.estimated_credits)}</span>
          </div>
        )}
        {run.estimated_minutes != null && run.stage !== "completed" && (
          <div>
            Estimated time <span className="font-medium text-foreground">~{Math.max(1, Math.round(run.estimated_minutes))} min</span>
          </div>
        )}
        {run.stage === "completed" && (
          <div>
            Messages enriched <span className="font-medium text-foreground">{formatNumber(run.rows_merged)}</span>
            {run.rows_unmatched > 0 && ` · ${formatNumber(run.rows_unmatched)} rows could not be matched`}
          </div>
        )}
        {run.dataset_id && <div className="font-mono">dataset {run.dataset_id}</div>}
      </dl>

      {run.error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{run.error}</p>}
      {run.quality && <Quality quality={run.quality} />}

      {run.stage === "estimated" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusButton
            radius="md"
            className="h-9 px-4 text-sm font-semibold"
            colors={{ default: "bg-foreground text-background" }}
            variant={launch.isPending ? "loading" : launch.isError ? "error" : undefined}
            text={{ loading: "Launching", error: "Could not launch" }}
            disabled={launch.isPending}
            onClick={() => launch.mutate()}
          >
            Launch for {run.estimated_credits != null ? `${formatNumber(run.estimated_credits)} credits` : "the quoted credits"}
          </StatusButton>
          <Button variant="ghost" size="sm" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
            Cancel
          </Button>
          <span className="text-xs text-muted-foreground">Nothing is charged until you launch.</span>
        </div>
      )}
    </li>
  );
}

function ApiRunner({ status, hasOpenRun }: { status: AdaptionStatus; hasOpenRun: boolean }) {
  const queryClient = useQueryClient();
  const [scope, setScope] = useState("all");
  const [maxRows, setMaxRows] = useState("");
  const [traces, setTraces] = useState(false);
  const create = useMutation({
    mutationFn: () => api.createAdaptionRun({ scope, max_rows: maxRows ? Number(maxRows) : null, reasoning_traces: traces }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adaption-runs"] });
      toast.success("Dataset uploaded to Adaption", { description: "You'll get a credit quote before anything runs." });
    },
    onError: (error) => toast.error(error.message),
  });

  if (!status.configured) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-sm">
        <p className="font-medium">Adaption API key not set on the server</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            Create a key in the Adaption app under <span className="text-foreground">Settings → API keys</span>.
          </li>
          <li>
            Set <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">ADAPTION_API_KEY</code> in the API&apos;s environment and restart it.
          </li>
        </ol>
        <p className="mt-2 text-muted-foreground">Until then, analysis runs on the built-in engine, and the manual path below works without a key.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Which messages</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All distinct messages</SelectItem>
              <SelectItem value="complaints">Complaints only</SelectItem>
              <SelectItem value="pending">Not yet enriched</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max-rows">Row limit</Label>
          <Input id="max-rows" type="number" min={1} placeholder="No limit" value={maxRows} onChange={(e) => setMaxRows(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Switch checked={traces} onCheckedChange={setTraces} />
          Reasoning traces
        </label>
      </div>
      <Button onClick={() => create.mutate()} disabled={create.isPending || hasOpenRun}>
        <UploadIcon />
        {create.isPending ? "Uploading…" : "Upload and get a credit quote"}
      </Button>
      {hasOpenRun && <p className="text-xs text-muted-foreground">Finish or cancel the run in progress before starting another.</p>}
    </div>
  );
}

function ManualPath() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: api.importAdapted,
    onSuccess: (run) => {
      queryClient.invalidateQueries();
      toast.success(`Merged ${formatNumber(run.rows_merged)} enriched messages`, {
        description: run.rows_unmatched ? `${formatNumber(run.rows_unmatched)} rows could not be matched and were skipped.` : undefined,
      });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <ol className="space-y-4 text-sm">
      <li className="flex gap-3">
        <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">1</span>
        <div>
          <p className="font-medium">Download the prepared dataset</p>
          <Button asChild variant="outline" size="sm" className="mt-2">
            <a href={exportUrl("/adaption/dataset.csv")}>
              <DownloadIcon />
              insightflow-for-adaption.csv
            </a>
          </Button>
        </div>
      </li>
      <li className="flex gap-3">
        <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">2</span>
        <div>
          <p className="font-medium">Run it in the Adaption app</p>
          <p className="mt-1 text-muted-foreground">
            Create a dataset from the file. Map <code className="font-mono text-xs text-foreground">ref</code>, <code className="font-mono text-xs text-foreground">feedback</code> and{" "}
            <code className="font-mono text-xs text-foreground">category</code> as Context, paste the universal prompt shown on this page, switch off Prompt Deduplication and Prompt Rephrasing, then launch.
          </p>
          <Button asChild variant="link" size="sm" className="h-auto p-0">
            <a href="https://docs.adaptionlabs.ai/tutorials/adaptive-data-app-walkthrough/" target="_blank" rel="noreferrer">
              Adaption walkthrough <ExternalLinkIcon />
            </a>
          </Button>
        </div>
      </li>
      <li className="flex gap-3">
        <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold">3</span>
        <div>
          <p className="font-medium">Upload the adapted file</p>
          <p className="mt-1 text-muted-foreground">CSV, JSON or JSONL as downloaded from Adaption.</p>
          <Button variant="outline" size="sm" className="mt-2" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
            <UploadIcon />
            {upload.isPending ? "Merging…" : "Choose adapted file"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            hidden
            accept=".csv,.json,.jsonl"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate(file);
              e.target.value = "";
            }}
          />
        </div>
      </li>
    </ol>
  );
}

export function AdaptionView() {
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ["adaption-status"], queryFn: api.adaptionStatus });
  const runs = useQuery({
    queryKey: ["adaption-runs"],
    queryFn: async () => {
      const { items } = await api.adaptionRuns();
      // Drive the state machine from the browser: this is what keeps runs
      // moving on hosts with no background worker.
      const active = items.filter((r) => r.mode === "api" && (r.stage === "ingesting" || r.stage === "running"));
      if (!active.length) return items;
      const advanced = await Promise.all(active.map((r) => api.advanceAdaptionRun(r.id).catch(() => r)));
      if (advanced.some((r) => r.stage === "completed")) queryClient.invalidateQueries({ queryKey: ["adaption-status"] });
      return items.map((r) => advanced.find((a) => a.id === r.id) ?? r);
    },
    refetchInterval: (query) => (query.state.data?.some((r) => r.stage === "ingesting" || r.stage === "running") ? 8000 : false),
  });
  const [showPrompt, setShowPrompt] = useState(false);
  const data = status.data;
  const hasOpenRun = runs.data?.some((r) => ["ingesting", "estimated", "running"].includes(r.stage)) ?? false;

  return (
    <>
      <PageHeader
        title="Adaption"
        description="Adaption's Adaptive Data pipeline is the generative layer of InsightFlow: it reads each distinct message and returns structured analysis, root causes and suggested fixes."
      >
        <Button asChild variant="outline" size="sm">
          <a href="https://docs.adaptionlabs.ai" target="_blank" rel="noreferrer">
            Adaption docs <ExternalLinkIcon />
          </a>
        </Button>
      </PageHeader>

      {status.isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : status.isError || !data ? (
        <ErrorState error={status.error} onRetry={() => status.refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
            <div className="bg-card p-4">
              <div className="text-xs font-medium text-muted-foreground">Connection</div>
              <div className="mt-2 flex items-center gap-2 text-lg font-semibold">
                <span className={cn("size-2 rounded-full", data.configured ? "bg-emerald-500" : "bg-zinc-400")} aria-hidden />
                {data.configured ? "API key set" : "Not connected"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {data.sdk_version ? `adaption SDK ${data.sdk_version}` : "SDK not installed"} · {data.background_sync ? "background sync" : "browser-driven sync"}
              </div>
            </div>
            <div className="bg-card p-4">
              <div className="text-xs font-medium text-muted-foreground">Enriched by Adaption</div>
              <div className="tabular mt-2 text-lg font-semibold">
                {formatNumber(data.enriched)} <span className="text-sm font-normal text-muted-foreground">of {formatNumber(data.distinct_messages)} distinct messages</span>
              </div>
              <Progress value={data.coverage_pct} className="mt-2 h-1.5" />
            </div>
            <div className="bg-card p-4">
              <div className="text-xs font-medium text-muted-foreground">Everything else is read by</div>
              <div className="mt-2 font-mono text-sm font-semibold">
                {Object.keys(data.engines).filter((e) => e !== "adaption").join(", ") || "—"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">Built-in engine: always on, no credits, explains every score.</div>
            </div>
          </div>

          <Panel title="How Adaption fits in" description="The same five steps run whether you use the API or the app.">
            <ol className="grid gap-3 md:grid-cols-5">
              {PIPELINE.map((step, i) => (
                <li key={step.title} className="relative rounded-lg border p-3">
                  <div className="tabular text-xs text-muted-foreground">Step {i + 1}</div>
                  <div className="mt-1 text-sm font-medium">{step.title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
            <button type="button" onClick={() => setShowPrompt((v) => !v)} className="mt-4 flex items-center gap-1 text-sm font-medium" aria-expanded={showPrompt}>
              <ChevronRightIcon className={cn("size-4 transition-transform", showPrompt && "rotate-90")} />
              The exact instruction sent to Adaption
            </button>
            {showPrompt && (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">
                    Universal prompt · context columns: {data.workflow.context_columns.join(", ")}
                  </div>
                  <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{data.workflow.universal_prompt}</pre>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                    Blueprint (brand controls)
                    <button
                      type="button"
                      className="underline underline-offset-4 hover:text-foreground"
                      onClick={() => navigator.clipboard.writeText(data.workflow.universal_prompt).then(() => toast.success("Prompt copied"))}
                    >
                      Copy prompt
                    </button>
                  </div>
                  <pre className="overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">{data.workflow.blueprint}</pre>
                </div>
              </div>
            )}
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Run through the API" description="Upload, get a credit quote, confirm, and results merge automatically.">
              <ApiRunner status={data} hasOpenRun={hasOpenRun} />
            </Panel>
            <Panel title="Or run it by hand in the Adaption app" description="Works without an API key.">
              <ManualPath />
            </Panel>
          </div>

          <Panel title="Runs">
            {runs.isLoading ? (
              <Skeleton className="h-24" />
            ) : !runs.data?.length ? (
              <p className="text-sm text-muted-foreground">No runs yet. Results from Adaption will appear here and across the dashboards.</p>
            ) : (
              <ul className="space-y-3">
                {runs.data.map((run) => (
                  <RunCard key={run.id} run={run} />
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
