import type { Metadata } from "next";

import { SharedReportView } from "@/features/reports/reports-view";

export const metadata: Metadata = { title: "Shared insight report", robots: { index: false } };

export default function Page() {
  return <SharedReportView />;
}
