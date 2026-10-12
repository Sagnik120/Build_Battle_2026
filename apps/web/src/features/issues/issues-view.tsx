"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarIcon, PlusIcon, Trash2Icon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Delta, EmptyState, ErrorState, PageHeader, Sparkline, TierBadge } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { ISSUE_STATUSES } from "@/lib/constants";
import { formatDate, formatNumber } from "@/lib/format";
import type { Issue, IssueStatus, Tier } from "@/lib/types";
import { cn } from "@/lib/utils";

const BOARD: IssueStatus[] = ["open", "investigating", "in_progress", "resolved"];
const TIERS: Tier[] = ["P0", "P1", "P2", "P3"];

function useIssueUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Record<string, unknown> }) => api.updateIssue(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
    },
    onError: (error) => toast.error(error.message),
  });
}

function sinceTracked(issue: Issue): number | null {
  const base = issue.baseline.complaints;
  if (!issue.current || !base) return null;
  return ((issue.current.complaints - base) / base) * 100;
}

function IssueCard({ issue, onOpen }: { issue: Issue; onOpen: () => void }) {
  const change = sinceTracked(issue);
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-lg border bg-card p-3 text-left transition-colors hover:border-foreground/30">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm leading-snug font-medium">{issue.title}</span>
        <TierBadge tier={issue.priority} />
      </div>
      {issue.current && (
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="tabular text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{formatNumber(issue.current.complaints)}</span> complaints
            {change !== null && Math.abs(change) >= 0.05 && (
              <span className="ml-1.5 inline-flex items-center gap-1">
                <Delta value={change} goodWhen="down" /> since tracked
              </span>
            )}
          </div>
          <Sparkline values={issue.current.series} className="h-6 w-16" />
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <UserIcon className="size-3" />
          {issue.owner ?? "Unassigned"}
        </span>
        {issue.due_date && (
          <span className={cn("inline-flex items-center gap-1", issue.overdue && "font-medium text-rose-600 dark:text-rose-400")}>
            <CalendarIcon className="size-3" />
            {issue.overdue ? "Overdue · " : ""}
            {formatDate(issue.due_date, "d MMM")}
          </span>
        )}
      </div>
    </button>
  );
}

function IssueSheet({ issue, onClose }: { issue: Issue | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const update = useIssueUpdate();
  const [note, setNote] = useState("");
  const [owner, setOwner] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteIssue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["recommendations"] });
      toast.success("Issue removed");
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });
  if (!issue) return <Sheet open={false} />;
  const patch = (body: Record<string, unknown>) => update.mutate({ id: issue.id, patch: body });
  const ownerValue = owner ?? issue.owner ?? "";

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) {
          setOwner(null);
          setNote("");
          onClose();
        }
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{issue.title}</SheetTitle>
          <SheetDescription>{issue.description || "No description."}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={issue.status} onValueChange={(status) => patch({ status })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={issue.priority} onValueChange={(priority) => patch({ priority })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issue-owner">Owner</Label>
              <Input
                id="issue-owner"
                value={ownerValue}
                placeholder="Name or team"
                onChange={(e) => setOwner(e.target.value)}
                onBlur={() => owner !== null && owner !== (issue.owner ?? "") && patch({ owner })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="issue-due">Due date</Label>
              <Input id="issue-due" type="date" value={issue.due_date ?? ""} onChange={(e) => patch({ due_date: e.target.value || null })} />
            </div>
          </div>

          {issue.current && (
            <div className="rounded-lg border p-3">
              <h3 className="text-xs font-medium text-muted-foreground">Impact since tracking started</h3>
              <dl className="tabular mt-2 grid grid-cols-3 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">At start</dt>
                  <dd className="font-semibold">{issue.baseline.complaints !== undefined ? formatNumber(issue.baseline.complaints) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Now</dt>
                  <dd className="font-semibold">{formatNumber(issue.current.complaints)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Priority</dt>
                  <dd className="font-semibold">
                    {issue.baseline.score ?? "—"} → {issue.current.score}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">Complaint counts update as new feedback is imported.</p>
              <Button asChild variant="link" size="sm" className="mt-1 h-auto p-0">
                <Link href={`/feedback?theme=${issue.theme_id}&complaints_only=true`}>View the complaints</Link>
              </Button>
            </div>
          )}

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              patch({ note });
              setNote("");
            }}
          >
            <Label htmlFor="issue-note">Add a note</Label>
            <Textarea id="issue-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was decided or done?" />
            <Button type="submit" size="sm" variant="outline" disabled={!note.trim() || update.isPending}>
              Add note
            </Button>
          </form>

          <div>
            <h3 className="text-xs font-medium text-muted-foreground">Activity</h3>
            <ol className="mt-2 space-y-3 border-l pl-4">
              {issue.activity.map((event, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full border bg-background" aria-hidden />
                  <p className={event.kind === "note" ? "whitespace-pre-wrap" : "text-muted-foreground"}>{event.message}</p>
                  <time className="text-xs text-muted-foreground">{formatDate(event.at, "d MMM yyyy, HH:mm")}</time>
                </li>
              ))}
            </ol>
          </div>

          <Button
            variant="destructive"
            size="sm"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm("Stop tracking this issue? Its notes and history will be deleted.")) remove.mutate(issue.id);
            }}
          >
            <Trash2Icon />
            Delete issue
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NewIssueDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Tier>("P2");
  const create = useMutation({
    mutationFn: () => api.createIssue({ title, description, priority }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      onOpenChange(false);
      setTitle("");
      setDescription("");
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New issue</DialogTitle>
          <DialogDescription>
            For issues that come from a theme, use “Track issue” on the Priorities page — it links the live complaint numbers.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-issue-title">Title</Label>
            <Input id="new-issue-title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-issue-description">Description</Label>
            <Textarea id="new-issue-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as Tier)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIERS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending || !title.trim()}>
              Create issue
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IssuesView() {
  const query = useQuery({ queryKey: ["issues"], queryFn: api.issues });
  const [openId, setOpenId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const issues = query.data?.items ?? [];
  const selected = issues.find((i) => i.id === openId) ?? null;
  const parked = issues.filter((i) => i.status === "wont_fix");

  return (
    <>
      <PageHeader title="Issues" description="The problems you have decided to act on, with live complaint numbers so you can see whether the fix is working.">
        <Button asChild variant="outline" size="sm">
          <Link href="/insights">Pick from priorities</Link>
        </Button>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <PlusIcon />
          New issue
        </Button>
      </PageHeader>

      {query.isLoading ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : issues.length === 0 ? (
        <EmptyState
          title="Nothing tracked yet"
          description="Open Priorities and choose “Track issue” on anything you want to follow through to a fix."
          action={
            <Button asChild size="sm">
              <Link href="/insights">Go to priorities</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {BOARD.map((status) => {
              const column = issues.filter((i) => i.status === status);
              return (
                <section key={status} className="rounded-xl border bg-muted/30 p-2">
                  <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-medium">
                    {ISSUE_STATUSES.find((s) => s.value === status)!.label}
                    <span className="tabular text-xs text-muted-foreground">{column.length}</span>
                  </h2>
                  <div className="space-y-2">
                    {column.map((issue) => (
                      <IssueCard key={issue.id} issue={issue} onOpen={() => setOpenId(issue.id)} />
                    ))}
                    {column.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">None</p>}
                  </div>
                </section>
              );
            })}
          </div>
          {parked.length > 0 && (
            <p className="mt-4 text-sm text-muted-foreground">
              Won&apos;t fix:{" "}
              {parked.map((issue, i) => (
                <span key={issue.id}>
                  {i > 0 && ", "}
                  <button type="button" className="underline underline-offset-4 hover:text-foreground" onClick={() => setOpenId(issue.id)}>
                    {issue.title}
                  </button>
                </span>
              ))}
            </p>
          )}
        </>
      )}

      <IssueSheet key={selected?.id ?? "none"} issue={selected} onClose={() => setOpenId(null)} />
      <NewIssueDialog open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}
