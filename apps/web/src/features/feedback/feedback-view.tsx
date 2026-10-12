"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, PlusIcon, SearchIcon, UploadIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ScrollFadeEffect } from "@/components/jyotirmoydas/scroll-fade-effect";
import { FilterBar } from "@/components/shared/filter-bar";
import { EmptyState, ErrorState, PageHeader, SentimentBadge, SeverityBadge } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { AddFeedbackDialog, FeedbackDetail } from "@/features/feedback/feedback-dialogs";
import { ImportDialog } from "@/features/feedback/import-dialog";
import { useFilters } from "@/hooks/use-filters";
import { api, exportUrl } from "@/lib/api";
import { formatDate, formatNumber } from "@/lib/format";
import type { FeedbackItem } from "@/lib/types";

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "most_negative", label: "Most negative" },
  { value: "most_positive", label: "Most positive" },
  { value: "most_repeated", label: "Most repeated" },
];

export function FeedbackView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { filters, setFilters } = useFilters();

  const [sort, setSort] = useState("newest");
  const [collapse, setCollapse] = useState(false);
  const [search, setSearch] = useState(filters.q);
  const [selected, setSelected] = useState<FeedbackItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(searchParams.get("import") === "1");

  // Debounce the search box into the URL.
  useEffect(() => {
    if (search === filters.q) return;
    const timer = setTimeout(() => setFilters({ q: search }), 300);
    return () => clearTimeout(timer);
  }, [search, filters.q, setFilters]);

  // The page belongs to one filter/sort view: changing the view starts again at page 1.
  const viewKey = JSON.stringify([filters, sort, collapse]);
  const [paging, setPaging] = useState({ view: viewKey, page: 1 });
  const page = paging.view === viewKey ? paging.page : 1;
  const setPage = (next: number) => setPaging({ view: viewKey, page: next });

  useEffect(() => {
    if (searchParams.get("import") === "1") {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("import");
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  const effectiveSort = !collapse && sort === "most_repeated" ? "newest" : sort;
  const params = { ...filters, page, page_size: 25, sort: effectiveSort, collapse };
  const query = useQuery({ queryKey: ["feedback", params], queryFn: () => api.feedback(params), placeholderData: keepPreviousData });
  const facets = useQuery({ queryKey: ["facets"], queryFn: api.facets, staleTime: 60_000 });
  const data = query.data;

  return (
    <>
      <PageHeader title="Feedback" description="Every review, survey answer and support message, with the AI read next to it.">
        <Button variant="outline" size="sm" asChild>
          <a href={exportUrl("/feedback/export.csv", { ...filters })}>
            <DownloadIcon />
            Export CSV
          </a>
        </Button>
        <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
          <UploadIcon />
          Import CSV
        </Button>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <PlusIcon />
          Add feedback
        </Button>
      </PageHeader>

      <FilterBar />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search feedback text…"
            aria-label="Search feedback"
            className="h-9 rounded-full pl-9"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={collapse} onCheckedChange={setCollapse} />
          Group identical messages
        </label>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="h-9 w-44" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.filter((s) => collapse || s.value !== "most_repeated").map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-[520px] rounded-xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No feedback matches"
          description="Try a different search or clear the filters. You can also import a CSV or add an entry by hand."
          action={
            <Button size="sm" onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <ScrollFadeEffect orientation="horizontal" className="[--mask-width:24px]">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Feedback</th>
                  <th className="px-3 py-2.5 font-medium">Theme</th>
                  <th className="px-3 py-2.5 font-medium">Sentiment</th>
                  <th className="px-3 py-2.5 font-medium">Severity</th>
                  <th className="px-4 py-2.5 text-right font-medium">{collapse ? "Times said" : "Date"}</th>
                </tr>
              </thead>
              <tbody className={query.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
                {data.items.map((item) => (
                  <tr
                    key={item.id}
                    tabIndex={0}
                    onClick={() => setSelected(item)}
                    onKeyDown={(e) => e.key === "Enter" && setSelected(item)}
                    className="cursor-pointer border-b outline-none last:border-0 hover:bg-muted/40 focus-visible:bg-muted/60"
                  >
                    <td className="max-w-md px-4 py-3">
                      <p className="line-clamp-2">{item.text}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.category}
                        {item.source !== "review" && <span className="capitalize"> · {item.source}</span>}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{item.analysis.theme?.label ?? "—"}</td>
                    <td className="px-3 py-3">
                      <SentimentBadge sentiment={item.analysis.sentiment} />
                    </td>
                    <td className="px-3 py-3">{item.analysis.is_complaint ? <SeverityBadge severity={item.analysis.severity} /> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="tabular px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                      {collapse ? <span className="font-medium text-foreground">×{formatNumber(item.occurrences)}</span> : formatDate(item.created_at.slice(0, 10), "d MMM yy")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollFadeEffect>
          <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-sm">
            <span className="tabular text-muted-foreground">
              {formatNumber((data.page - 1) * data.page_size + 1)}–{formatNumber(Math.min(data.page * data.page_size, data.total))} of {formatNumber(data.total)}
              {collapse ? " distinct messages" : ""}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
                <ChevronLeftIcon />
              </Button>
              <span className="tabular px-2 text-muted-foreground">
                {data.page} / {data.pages}
              </span>
              <Button variant="outline" size="icon" className="size-8" disabled={page >= data.pages} onClick={() => setPage(page + 1)} aria-label="Next page">
                <ChevronRightIcon />
              </Button>
            </div>
          </div>
        </div>
      )}

      <FeedbackDetail item={selected} onClose={() => setSelected(null)} collapsed={collapse} />
      <AddFeedbackDialog open={addOpen} onOpenChange={setAddOpen} categories={facets.data?.categories.map((c) => c.value) ?? []} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}

// InsightFlow build iteration: commit 251

// InsightFlow build iteration: commit 252

// InsightFlow build iteration: commit 253

// InsightFlow build iteration: commit 254

// InsightFlow build iteration: commit 255
