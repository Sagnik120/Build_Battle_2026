"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheetIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { StatusButton } from "@/components/jyotirmoydas/status-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import type { ImportPreview } from "@/lib/types";
import { cn } from "@/lib/utils";

const FIELDS: { key: string; label: string; required?: boolean }[] = [
  { key: "text", label: "Feedback text", required: true },
  { key: "category", label: "Category" },
  { key: "date", label: "Date" },
  { key: "rating", label: "Rating" },
  { key: "source", label: "Source / channel" },
  { key: "customer", label: "Customer" },
];
const NONE = "__none__";

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [timeline, setTimeline] = useState<"spread" | "now">("now");
  const [dragging, setDragging] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping({});
  };

  const previewMutation = useMutation({
    mutationFn: api.previewImport,
    onSuccess: (data) => {
      setPreview(data);
      setMapping(data.mapping);
    },
    onError: (error) => {
      toast.error(error.message);
      reset();
    },
  });

  const importMutation = useMutation({
    mutationFn: () => api.importCsv(file!, mapping, timeline, 180),
    onSuccess: (batch) => {
      queryClient.invalidateQueries();
      toast.success(`Imported ${formatNumber(batch.rows_imported)} entries`, {
        description: `${formatNumber(batch.distinct_voices)} distinct messages analysed${batch.rows_skipped ? ` · ${batch.rows_skipped} empty rows skipped` : ""}.`,
      });
      setTimeout(() => {
        onOpenChange(false);
        reset();
        importMutation.reset();
      }, 900);
    },
    onError: (error) => toast.error(error.message),
  });

  const choose = (picked: File | undefined) => {
    if (!picked) return;
    setFile(picked);
    previewMutation.mutate(picked);
  };

  const tooMany = preview ? preview.row_count > preview.max_rows : false;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import feedback from CSV</DialogTitle>
          <DialogDescription>
            Reviews, survey answers or support messages — one per row. Columns are detected automatically and you can correct them.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              choose(e.dataTransfer.files[0]);
            }}
            className={cn(
              "flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
              dragging ? "border-foreground bg-muted" : "hover:bg-muted/50"
            )}
          >
            <UploadIcon className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">{previewMutation.isPending ? "Reading file…" : "Drop a CSV here or click to choose"}</span>
            <span className="text-xs text-muted-foreground">Comma, semicolon or tab separated · UTF-8</span>
          </button>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-medium">{preview.filename}</span>
              <span className="tabular shrink-0 text-xs text-muted-foreground">{formatNumber(preview.row_count)} rows</span>
              <Button variant="ghost" size="sm" className="h-7" onClick={reset}>
                Change
              </Button>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">Match your columns</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {FIELDS.map((field) => (
                  <label key={field.key} className="space-y-1 text-xs text-muted-foreground">
                    <span>
                      {field.label}
                      {field.required && <span className="text-rose-600"> *</span>}
                    </span>
                    <Select
                      value={mapping[field.key] ?? NONE}
                      onValueChange={(value) => setMapping((m) => ({ ...m, [field.key]: value === NONE ? null : value }))}
                    >
                      <SelectTrigger className="h-9 w-full text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {!field.required && <SelectItem value={NONE}>Not in this file</SelectItem>}
                        {preview.headers.map((header) => (
                          <SelectItem key={header} value={header}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                ))}
              </div>
            </div>

            {!preview.has_dates && (
              <div className="rounded-lg border p-3">
                <h3 className="text-sm font-medium">This file has no dates</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">Trend charts need a date for each entry. Choose how to handle it:</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      { value: "now", title: "Date everything today", body: "Honest default. Trends start from this import." },
                      { value: "spread", title: "Spread across 180 days", body: "Uses row order as arrival order. Marked as simulated in the app." },
                    ] as const
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTimeline(option.value)}
                      aria-pressed={timeline === option.value}
                      className={cn("rounded-lg border p-3 text-left transition-colors", timeline === option.value ? "border-foreground bg-muted" : "hover:bg-muted/50")}
                    >
                      <div className="text-sm font-medium">{option.title}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{option.body}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="mb-2 text-sm font-medium">Preview</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left">
                      {preview.headers.map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        {preview.headers.map((h) => (
                          <td key={h} className="max-w-72 truncate px-3 py-2 text-muted-foreground">
                            {row[h]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {tooMany && (
              <p className="text-sm text-rose-600 dark:text-rose-400">
                This file has {formatNumber(preview.row_count)} rows; this deployment accepts up to {formatNumber(preview.max_rows)}.
              </p>
            )}
          </div>
        )}

        <input ref={inputRef} type="file" accept=".csv,.tsv,.txt,text/csv" hidden onChange={(e) => choose(e.target.files?.[0])} />

        {preview && (
          <DialogFooter>
            <StatusButton
              type="button"
              radius="md"
              className="h-10 px-5 text-sm font-semibold"
              colors={{ default: "bg-foreground text-background" }}
              disabled={!mapping.text || tooMany || importMutation.isPending}
              variant={importMutation.isPending ? "loading" : importMutation.isSuccess ? "success" : importMutation.isError ? "error" : undefined}
              text={{ loading: "Importing and analysing", success: "Imported", error: "Import failed" }}
              onClick={() => importMutation.mutate()}
            >
              Import {formatNumber(preview.row_count)} rows
            </StatusButton>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// InsightFlow build iteration: commit 258

// InsightFlow build iteration: commit 259

// InsightFlow build iteration: commit 260
