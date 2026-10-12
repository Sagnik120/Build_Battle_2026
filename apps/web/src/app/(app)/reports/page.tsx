import type { Metadata } from "next";

import { ReportsView } from "@/features/reports/reports-view";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return <ReportsView />;
}

// InsightFlow build iteration: commit 305
