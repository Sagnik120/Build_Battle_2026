import type { Metadata } from "next";

import { AdaptionView } from "@/features/adaption/adaption-view";

export const metadata: Metadata = { title: "Adaption" };

export default function Page() {
  return <AdaptionView />;
}
