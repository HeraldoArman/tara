import type { Metadata } from "next";

import { SopWorkspace } from "@/components/sop-intelligence/sop-workspace";

export const metadata: Metadata = {
  description:
    "Explore SOP documents and discover opportunities for AI assistance with TARA.",
  title: "SOP Intelligence · TARA",
};

export default function SopIntelligencePage() {
  return <SopWorkspace />;
}
