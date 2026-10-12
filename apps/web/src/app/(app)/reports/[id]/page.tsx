import type { Metadata } from "next";

import { ReportDetailView } from "@/features/reports/reports-view";

export const metadata: Metadata = { title: "Report" };

export default function Page() {
  return <ReportDetailView />;
}
