import type { Metadata } from "next";

import { InsightsView } from "@/features/insights/insights-view";

export const metadata: Metadata = { title: "Priorities" };

export default function Page() {
  return <InsightsView />;
}
