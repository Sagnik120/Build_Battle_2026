"use client";

import { useQuery } from "@tanstack/react-query";
import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";

import { CommandBoxTrigger, useCommandBox } from "@/components/jyotirmoydas/command-box";
import { ShimmeringText } from "@/components/jyotirmoydas/shimmering-text";
import { ThemeSwitcher } from "@/components/jyotirmoydas/theme-switcher";
import { CommandMenu } from "@/components/layout/command-menu";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { NAV_ITEMS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function WorkspaceStatus() {
  const { data, isLoading, isError } = useQuery({ queryKey: ["system"], queryFn: api.systemInfo });
  if (isLoading) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs">
        <ShimmeringText text="Waking the server…" className="font-medium" />
        <p className="mt-1 text-muted-foreground">Free-tier hosts sleep when idle. First load can take up to a minute.</p>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">API unreachable.</span> Check that the backend is running.
      </div>
    );
  }
  return (
    <div className="rounded-lg border bg-card p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium">Workspace</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="rounded-full border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
              {data.profile}
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">
            Engine: {data.engine} · Database: {data.database}
          </TooltipContent>
        </Tooltip>
      </div>
      <dl className="tabular mt-2 space-y-1 text-muted-foreground">
        <div className="flex justify-between">
          <dt>Feedback</dt>
          <dd className="text-foreground">{formatNumber(data.data.total_feedback)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Distinct messages</dt>
          <dd className="text-foreground">{formatNumber(data.data.distinct_voices)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Adaption-enriched</dt>
          <dd className="text-foreground">{formatNumber(data.data.adaption_enriched)}</dd>
        </div>
      </dl>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { open, setOpen } = useCommandBox();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-dvh">
      <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r bg-card/40 p-3 lg:flex">
        <Link href="/dashboard" className="px-2.5 py-2">
          <Logo />
        </Link>
        <div className="mt-4 flex-1 overflow-y-auto">
          <NavLinks />
        </div>
        <WorkspaceStatus />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md lg:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-3">
              <SheetHeader className="px-2.5 pb-4">
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <NavLinks onNavigate={() => setMobileOpen(false)} />
              <div className="mt-auto">
                <WorkspaceStatus />
              </div>
            </SheetContent>
          </Sheet>
          <Link href="/dashboard" className="lg:hidden">
            <Logo />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <CommandBoxTrigger onClick={() => setOpen(true)} />
            <ThemeSwitcher variant="toggle" />
          </div>
        </header>

        <main className="relative flex-1">
          <div aria-hidden className="no-print pointer-events-none absolute inset-x-0 top-0 h-64 bg-dot-grid [mask-image:linear-gradient(to_bottom,black,transparent)]" />
          <div className="relative mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
            <Suspense fallback={null}>{children}</Suspense>
          </div>
        </main>
      </div>

      <CommandMenu open={open} onOpenChange={setOpen} />
    </div>
  );
}

// InsightFlow build iteration: commit 245

// InsightFlow build iteration: commit 246

// InsightFlow build iteration: commit 346
