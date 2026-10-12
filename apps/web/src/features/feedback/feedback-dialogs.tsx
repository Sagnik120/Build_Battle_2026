"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SparklesIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SentimentBadge, SeverityBadge } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { FeedbackItem } from "@/lib/types";

const SOURCES = ["review", "survey", "support", "social", "manual"];

export function AddFeedbackDialog({
  open,
  onOpenChange,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: string[];
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("manual");
  const [result, setResult] = useState<FeedbackItem | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.submitFeedback({ text, category: category || undefined, source }),
    onSuccess: (item) => {
      setResult(item);
      queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setText("");
      setResult(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add feedback</DialogTitle>
          <DialogDescription>Paste a review, survey answer or support message. It is analysed as soon as you save it.</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <blockquote className="rounded-lg border bg-muted/40 p-3 text-sm">{result.text}</blockquote>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <SentimentBadge sentiment={result.analysis.sentiment} />
              {result.analysis.is_complaint && <SeverityBadge severity={result.analysis.severity} />}
              <span className="rounded-full border px-2 py-0.5 text-xs">{result.analysis.theme?.label ?? "No theme matched yet"}</span>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setResult(null); setText(""); }}>
                Add another
              </Button>
              <Button onClick={() => close(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="feedback-text">Feedback</Label>
              <Textarea
                id="feedback-text"
                required
                minLength={3}
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Delivery bahut late thi and nobody from support replied."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="feedback-category">Category</Label>
                <Input id="feedback-category" list="category-options" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Optional" />
                <datalist id="category-options">
                  {categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="w-full capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending || text.trim().length < 3}>
                {mutation.isPending ? "Analysing…" : "Save and analyse"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export function FeedbackDetail({ item, onClose, collapsed }: { item: FeedbackItem | null; onClose: () => void; collapsed: boolean }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteFeedback(id),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Feedback deleted");
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });
  const a = item?.analysis;
  const fromAdaption = a?.engine === "adaption";

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {item && a && (
          <>
            <SheetHeader>
              <SheetTitle>Feedback detail</SheetTitle>
              <SheetDescription>
                {item.category} · {item.source}
                {item.occurrences > 1 ? ` · said ${item.occurrences} times` : ` · ${formatDate(item.created_at.slice(0, 10))}`}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-5 px-4 pb-6">
              <blockquote className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed">{item.text}</blockquote>

              <dl className="divide-y">
                <Row label="Sentiment">
                  <SentimentBadge sentiment={a.sentiment} />
                </Row>
                <Row label="Score">
                  <span className="tabular">{a.score.toFixed(2)}</span>
                  <span className="text-muted-foreground"> · {Math.round(a.confidence * 100)}% confidence</span>
                </Row>
                <Row label="Theme">{a.theme?.label ?? "Uncategorised"}</Row>
                <Row label="Complaint">{a.is_complaint ? <SeverityBadge severity={a.severity} /> : "No"}</Row>
                {a.is_complaint && <Row label="Resolution"><span className="capitalize">{a.resolution}</span></Row>}
                <Row label="Analysed by">
                  <span className="inline-flex items-center gap-1 font-mono text-xs">
                    {fromAdaption && <SparklesIcon className="size-3" />}
                    {a.engine}
                  </span>
                </Row>
              </dl>

              {a.signals.length > 0 && !fromAdaption && (
                <div>
                  <h3 className="text-xs font-medium text-muted-foreground">Why this score</h3>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {a.signals.map((signal, i) => (
                      <li key={i} className="rounded-md border px-1.5 py-0.5 font-mono text-xs">
                        {signal}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(a.summary || a.root_cause || a.suggested_action) && (
                <div className="space-y-3 rounded-lg border p-3">
                  <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <SparklesIcon className="size-3.5" />
                    Generated by Adaption
                  </h3>
                  {a.summary && <p className="text-sm">{a.summary}</p>}
                  {a.root_cause && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Likely root cause: </span>
                      {a.root_cause}
                    </p>
                  )}
                  {a.suggested_action && (
                    <p className="text-sm">
                      <span className="text-muted-foreground">Suggested fix: </span>
                      {a.suggested_action}
                    </p>
                  )}
                </div>
              )}

              {!collapsed && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm("Delete this feedback entry? This cannot be undone.")) remove.mutate(item.id);
                  }}
                >
                  <Trash2Icon />
                  Delete entry
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// InsightFlow build iteration: commit 256
