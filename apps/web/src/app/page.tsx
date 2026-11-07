import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";

import { LandingPage } from "@/components/landing/landing-page";
import { PageUnavailable } from "@/components/tara/ui";
import { WorkQueuePage } from "@/components/tara/work-queue-page";
import { errorMessage } from "@/lib/api";
import { optionalCurrentUser } from "@/lib/server-api";

export const metadata: Metadata = {
  description:
    "Turn your SOPs into guided work. TARA connects intelligent workflows, real-time workforce assistance, and a clearer view of your operations.",
  title: { absolute: "TARA · Intelligence in Every Operation" },
};

export default async function HomePage() {
  try {
    const user = await optionalCurrentUser();
    if (user?.role === "owner") {
      redirect("/dashboard");
    }
    return user ? <WorkQueuePage user={user} /> : <LandingPage />;
  } catch (cause) {
    unstable_rethrow(cause);
    return <PageUnavailable message={errorMessage(cause)} />;
  }
}
