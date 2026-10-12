"use client";

import { useQueryClient } from "@tanstack/react-query";
import { DatabaseIcon, MoonIcon, RefreshCwIcon, SunIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import { toast } from "sonner";

import {
  CommandBox,
  CommandBoxEmpty,
  CommandBoxFooter,
  CommandBoxGroup,
  CommandBoxInput,
  CommandBoxItem,
  CommandBoxLinkGroup,
  CommandBoxList,
  type CommandKind,
} from "@/components/jyotirmoydas/command-box";
import { LogoMark } from "@/components/layout/logo";
import { api } from "@/lib/api";
import { NAV_ITEMS } from "@/lib/constants";

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();

  const run = (fn: () => void) => () => {
    onOpenChange(false);
    fn();
  };

  const actions = useMemo(
    () => [
      {
        title: resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: resolvedTheme === "dark" ? SunIcon : MoonIcon,
        keywords: ["theme", "dark", "light", "appearance"],
        onSelect: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      },
      {
        title: "Refresh all data",
        icon: RefreshCwIcon,
        keywords: ["reload", "refetch", "sync"],
        onSelect: () => {
          queryClient.invalidateQueries();
          toast.success("Data refreshed");
        },
      },
      {
        title: "Re-run analysis",
        icon: DatabaseIcon,
        keywords: ["analyse", "analyze", "engine", "recompute"],
        onSelect: () =>
          toast.promise(
            api.rerunAnalysis().then((r) => {
              queryClient.invalidateQueries();
              return r;
            }),
            {
              loading: "Re-analysing feedback…",
              success: (r) => `Analysed ${r.analysed} distinct messages`,
              error: (e) => e.message,
            }
          ),
      },
    ],
    [queryClient, resolvedTheme, setTheme]
  );

  const metaMap = useMemo(() => {
    const map = new Map<string, { commandKind: CommandKind }>();
    actions.forEach((a) => map.set(a.title.toLowerCase(), { commandKind: "command" }));
    return map;
  }, [actions]);

  return (
    <CommandBox open={open} onOpenChange={onOpenChange} backdropBlur blurIntensity={6}>
      <CommandBoxInput placeholder="Jump to a page or run a command…" />
      <CommandBoxList>
        <CommandBoxEmpty>Nothing matches that.</CommandBoxEmpty>
        <CommandBoxLinkGroup
          heading="Go to"
          links={NAV_ITEMS.map((n) => ({ title: n.label, href: n.href, icon: n.icon, keywords: n.hint.split(" ") }))}
          onLinkSelect={(href) => run(() => router.push(href))()}
        />
        <CommandBoxGroup heading="Commands">
          {actions.map((action) => (
            <CommandBoxItem key={action.title} keywords={action.keywords} onSelect={run(action.onSelect)}>
              <action.icon />
              {action.title}
            </CommandBoxItem>
          ))}
        </CommandBoxGroup>
      </CommandBoxList>
      <CommandBoxFooter logo={<LogoMark />} commandMetaMap={metaMap} />
    </CommandBox>
  );
}

// InsightFlow build iteration: commit 242

// InsightFlow build iteration: commit 243
