import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { RegistrationForm } from "@/components/auth/registration-form";

export const metadata: Metadata = {
  description:
    "Start your company's TARA workspace and bring your first SOP into focus.",
  title: "Create your account",
};

export default function RegisterPage() {
  return (
    <AuthShell
      description="For company heads bringing their team onto TARA. Your first SOP is where it all begins."
      eyebrow="A CLEARER WAY TO WORK"
      mode="register"
      title="Create your company account."
    >
      <RegistrationForm />
    </AuthShell>
  );
}
