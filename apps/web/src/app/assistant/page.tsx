import type { Metadata } from "next";

import { AssistantWorkspace } from "@/components/assistant/assistant-workspace";

export const metadata: Metadata = {
  description:
    "A preview of tara's reusable real-time workforce assistant components.",
  robots: { follow: false, index: false },
  title: "Live workspace",
};

export default function AssistantPage() {
  return <AssistantWorkspace />;
}
