import type { Metadata } from "next";

import { AssistantWorkspace } from "@/components/assistant/assistant-workspace";

export const metadata: Metadata = {
  description:
    "A preview of TARA's reusable real-time workforce assistant components.",
  robots: { follow: false, index: false },
  title: "Live workspace · TARA",
};

export default function AssistantPage() {
  return <AssistantWorkspace />;
}
