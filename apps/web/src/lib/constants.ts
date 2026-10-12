import {
  ClipboardListIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  LightbulbIcon,
  MessagesSquareIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";

import type { IssueStatus, Sentiment, Tier } from "@/lib/types";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon, hint: "Metrics and trends" },
  { href: "/feedback", label: "Feedback", icon: MessagesSquareIcon, hint: "Browse, add and import" },
  { href: "/insights", label: "Priorities", icon: LightbulbIcon, hint: "What to fix first, and why" },
  { href: "/issues", label: "Issues", icon: ClipboardListIcon, hint: "Track what you act on" },
  { href: "/reports", label: "Reports", icon: FileTextIcon, hint: "Export and share" },
  { href: "/adaption", label: "Adaption", icon: SparklesIcon, hint: "AI enrichment pipeline" },
  { href: "/settings", label: "Settings", icon: SettingsIcon, hint: "Workspace and assumptions" },
] as const;

// Stack order is part of the colour-safety contract (adjacent pairs were
// validated for colour-blind separation) - keep charts in this order.
export const SENTIMENT_ORDER: Sentiment[] = ["positive", "mixed", "neutral", "negative"];

export const SENTIMENT_META: Record<Sentiment, { label: string; color: string }> = {
  positive: { label: "Positive", color: "var(--sentiment-positive)" },
  mixed: { label: "Mixed", color: "var(--sentiment-mixed)" },
  neutral: { label: "Neutral", color: "var(--sentiment-neutral)" },
  negative: { label: "Negative", color: "var(--sentiment-negative)" },
};

export const SEVERITY_LABEL: Record<number, string> = { 1: "Low", 2: "Medium", 3: "High", 4: "Critical" };

export const TIER_META: Record<Tier, { label: string; className: string }> = {
  P0: { label: "Fix now", className: "bg-rose-600 text-white dark:bg-rose-500" },
  P1: { label: "Fix this sprint", className: "bg-amber-500 text-zinc-950" },
  P2: { label: "Plan", className: "bg-zinc-800 text-zinc-50 dark:bg-zinc-200 dark:text-zinc-900" },
  P3: { label: "Monitor", className: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
};

export const ISSUE_STATUSES: { value: IssueStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "wont_fix", label: "Won't fix" },
];

export const FACTOR_META: Record<string, { label: string; help: string }> = {
  reach: { label: "Reach", help: "How many customers complain about this, relative to the biggest issue" },
  severity: { label: "Severity", help: "How damaging each case is — fraud and lost money rank highest" },
  unresolved: { label: "Unresolved", help: "Share of complaints that mention no fix, refund or follow-up" },
  momentum: { label: "Growth", help: "Increase versus the earlier half of the period" },
};

// InsightFlow build iteration: commit 217
