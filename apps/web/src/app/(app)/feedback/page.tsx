import type { Metadata } from "next";

import { FeedbackView } from "@/features/feedback/feedback-view";

export const metadata: Metadata = { title: "Feedback" };

export default function Page() {
  return <FeedbackView />;
}
