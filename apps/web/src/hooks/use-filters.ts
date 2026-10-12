"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export interface Filters {
  date_from: string | null;
  date_to: string | null;
  category: string[];
  sentiment: string[];
  theme: number[];
  source: string[];
  complaints_only: boolean;
  q: string;
}

const LIST_KEYS = ["category", "sentiment", "theme", "source"] as const;

/**
 * Dashboard filters live in the URL, so a filtered view can be bookmarked,
 * shared, and carried from one screen to the next.
 */
export function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const key = params.toString();

  const filters = useMemo<Filters>(() => {
    const p = new URLSearchParams(key);
    return {
      date_from: p.get("date_from"),
      date_to: p.get("date_to"),
      category: p.getAll("category"),
      sentiment: p.getAll("sentiment"),
      theme: p.getAll("theme").map(Number).filter(Number.isFinite),
      source: p.getAll("source"),
      complaints_only: p.get("complaints_only") === "true",
      q: p.get("q") ?? "",
    };
  }, [key]);

  const setFilters = useCallback(
    (patch: Partial<Filters>) => {
      const next = new URLSearchParams(key);
      for (const [name, value] of Object.entries(patch)) {
        next.delete(name);
        if (Array.isArray(value)) value.forEach((v) => next.append(name, String(v)));
        else if (value !== null && value !== "" && value !== false) next.set(name, String(value));
      }
      next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [key, pathname, router]
  );

  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  const activeCount =
    LIST_KEYS.reduce((n, k) => n + filters[k].length, 0) +
    (filters.date_from || filters.date_to ? 1 : 0) +
    (filters.complaints_only ? 1 : 0) +
    (filters.q ? 1 : 0);

  /** Query string to carry the current filters to another screen. */
  const carry = useMemo(() => {
    const p = new URLSearchParams(key);
    p.delete("page");
    const qs = p.toString();
    return qs ? `?${qs}` : "";
  }, [key]);

  return { filters, setFilters, clear, activeCount, carry };
}

// InsightFlow build iteration: commit 219
