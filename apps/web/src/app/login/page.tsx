import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/tara/login-form";

export const metadata: Metadata = {
  description:
    "Sign in to tara for SOP-grounded guidance and a clearer view of your operations.",
  title: { absolute: "Sign in · tara" },
};

export default function LoginPage() {
  return (
    <AuthShell
      description="Your procedures, your team, your next step. All in one workspace."
      eyebrow="WELCOME BACK"
      mode="login"
      title="Good to see you."
    >
      <LoginForm />
    </AuthShell>
  );
}
