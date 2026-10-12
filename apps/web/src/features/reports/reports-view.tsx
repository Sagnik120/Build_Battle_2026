"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, CopyIcon, DownloadIcon, FileTextIcon, PlusIcon, PrinterIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { Logo } from "@/components/layout/logo";
import { EmptyState, ErrorState, PageHeader } from "@/components/shared/primitives";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ReportDocument } from "@/features/reports/report-document";
import { api, exportUrl } from "@/lib/api";
import { formatDate, formatNumber, formatSigned } from "@/lib/format";

function useCreateReport() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.createReport({ filters: {} }),
    onSuccess: (report) => {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      router.push(`/reports/${report.id}`);
    },
    onError: (error) => toast.error(error.message),
  });
}

export function ReportsView() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["reports"], queryFn: api.reports });
  const create = useCreateReport();
  const remove = useMutation({
    mutationFn: (id: number) => api.deleteReport(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reports"] }),
    onError: (error) => toast.error(error.message),
  });
  const reports = query.data?.items ?? [];

  return (
    <>
      <PageHeader title="Reports" description="A report freezes the insights at one moment, so the numbers people discuss don't shift under them. Share by link, print to PDF, or export.">
        <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
          <PlusIcon />
          {create.isPending ? "Generating…" : "New report"}
        </Button>
      </PageHeader>

      {query.isLoading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : reports.length === 0 ? (
        <EmptyState
          icon={FileTextIcon}
          title="No reports yet"
          description="Generate one from all feedback here, or from a filtered view on the Priorities page."
          action={
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              Generate report
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {reports.map((report) => (
            <li key={report.id} className="group relative rounded-xl border bg-card p-5 transition-colors hover:border-foreground/30">
              <Link href={`/reports/${report.id}`} className="block">
                <span className="absolute inset-0" aria-hidden />
                <h2 className="pr-8 text-sm leading-snug font-semibold">{report.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(report.created_at, "d MMM yyyy, HH:mm")}</p>
                <dl className="tabular mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Feedback</dt>
                    <dd className="font-semibold">{report.kpis?.total != null ? formatNumber(report.kpis.total) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Net sentiment</dt>
                    <dd className="font-semibold">{report.kpis?.nss != null ? formatSigned(report.kpis.nss, 0) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Critical</dt>
                    <dd className="font-semibold">{report.kpis?.critical != null ? formatNumber(report.kpis.critical) : "—"}</dd>
                  </div>
                </dl>
                {report.top_issue && <p className="mt-3 truncate text-xs text-muted-foreground">Top issue: {report.top_issue}</p>}
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 right-3 size-7 text-muted-foreground"
                aria-label={`Delete ${report.title}`}
                onClick={() => window.confirm("Delete this report? Its share link will stop working.") && remove.mutate(report.id)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function ReportDetailView() {
  const { id } = useParams<{ id: string }>();
  const query = useQuery({ queryKey: ["report", id], queryFn: () => api.report(id) });
  const report = query.data;

  const copyLink = async () => {
    if (!report) return;
    const url = `${window.location.origin}/share/${report.share_token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied", { description: "Anyone with the link can view this report. No sign-in needed." });
    } catch {
      toast.message("Copy this link", { description: url });
    }
  };

  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link href="/reports">
            <ArrowLeftIcon />
            All reports
          </Link>
        </Button>
        {report && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={copyLink}>
              <CopyIcon />
              Copy share link
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <DownloadIcon />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(
                  [
                    ["md", "Markdown document"],
                    ["csv", "Issues table (CSV)"],
                    ["json", "Full data (JSON)"],
                  ] as const
                ).map(([format, label]) => (
                  <DropdownMenuItem key={format} asChild>
                    <a href={exportUrl(`/reports/${report.id}/export`, { format })}>{label}</a>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => window.print()}>
              <PrinterIcon />
              Print / Save PDF
            </Button>
          </div>
        )}
      </div>
      {query.isLoading ? (
        <Skeleton className="mx-auto h-[720px] max-w-4xl rounded-xl" />
      ) : query.isError || !report ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <ReportDocument report={report} />
      )}
    </>
  );
}

export function SharedReportView() {
  const { token } = useParams<{ token: string }>();
  const query = useQuery({ queryKey: ["shared-report", token], queryFn: () => api.sharedReport(token) });

  return (
    <div className="min-h-dvh bg-muted/30 print:bg-transparent">
      <header className="no-print border-b bg-background">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Logo />
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <PrinterIcon />
            Print / Save PDF
          </Button>
        </div>
      </header>
      <main className="px-4 py-8 print:p-0">
        {query.isLoading ? (
          <Skeleton className="mx-auto h-[720px] max-w-4xl rounded-xl" />
        ) : query.isError || !query.data ? (
          <div className="mx-auto max-w-4xl">
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </div>
        ) : (
          <ReportDocument report={query.data} />
        )}
      </main>
    </div>
  );
}
