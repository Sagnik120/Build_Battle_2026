import type { Metadata } from "next";

import { IssuesView } from "@/features/issues/issues-view";

export const metadata: Metadata = { title: "Issues" };

export default function Page() {
  return <IssuesView />;
}

// InsightFlow build iteration: commit 304
