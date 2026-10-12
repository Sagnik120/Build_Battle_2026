import { cn } from "@/lib/utils";

/** Three rising bars folding into a forward arrow: feedback flowing into a decision. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={cn("size-6", className)}>
      <rect width="24" height="24" rx="7" className="fill-foreground" />
      <path
        d="M6.5 15.5v-3M10.5 15.5v-6M14.5 15.5V8l3.5 3.5"
        className="stroke-background"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      InsightFlow
    </span>
  );
}
