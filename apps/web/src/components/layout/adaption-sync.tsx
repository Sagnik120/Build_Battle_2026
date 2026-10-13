"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { formatNumber } from "@/lib/format";

const isActive = (stage: string) => stage === "ingesting" || stage === "running";

/**
 * Keeps Adaption runs moving from any page. New feedback is queued for Adaption
 * automatically, so the run has to advance (and the screens have to refresh when
 * it lands) even if the Adaption page is never opened. On hosts with no
 * background worker this poll is the only thing driving the run.
 */
export function AdaptionSync() {
  const queryClient = useQueryClient();
  const watching = useRef(new Set<number>());

  useQuery({
    queryKey: ["adaption-sync"],
    queryFn: async () => {
      const { items } = await api.adaptionRuns();
      const active = items.filter((r) => r.mode === "api" && isActive(r.stage));
      const advanced = await Promise.all(active.map((r) => api.advanceAdaptionRun(r.id).catch(() => r)));
      const runs = items.map((r) => advanced.find((a) => a.id === r.id) ?? r);

      for (const run of runs) {
        if (isActive(run.stage)) {
          watching.current.add(run.id);
        } else if (watching.current.delete(run.id)) {
          if (run.stage === "completed") {
            toast.success("Adaption finished", {
              description: `${formatNumber(run.rows_merged)} ${run.rows_merged === 1 ? "message now has" : "messages now have"} a root cause and suggested fix.`,
            });
          }
          // Everything derived from the analyses is stale now.
          queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "adaption-sync" });
        }
      }
      return runs;
    },
    refetchInterval: (query) => (query.state.data?.some((r) => isActive(r.stage)) ? 10_000 : 30_000),
    retry: false,
  });

  return null;
}
