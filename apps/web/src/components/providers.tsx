"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // A sleeping free-tier API needs ~30-50s to wake: keep retrying
            // network failures, but never retry a real 4xx.
            retry: (failures, error) =>
              error instanceof ApiError && error.status === 0 ? failures < 6 : failures < 1,
            retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 12_000),
          },
        },
      })
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
