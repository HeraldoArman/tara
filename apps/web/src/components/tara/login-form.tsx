"use client";

import { Button } from "@tara/ui/components/button";
import { Input } from "@tara/ui/components/input";
import { Label } from "@tara/ui/components/label";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { formString } from "@/components/auth/form-data";
import { api, errorMessage } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) {
      return;
    }

    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");

    try {
      await api("/auth/login", {
        body: JSON.stringify({
          password: formString(form, "password"),
          username: formString(form, "username").trim(),
        }),
        method: "POST",
      });
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <form
      aria-busy={busy}
      className="tara-auth-form"
      method="post"
      onSubmit={submit}
    >
      <div className="tara-auth-field">
        <Label className="tara-auth-label" htmlFor="username">
          Username
        </Label>
        <Input
          autoCapitalize="none"
          autoComplete="username"
          className="tara-auth-input"
          disabled={busy}
          id="username"
          name="username"
          placeholder="Your username"
          required
          spellCheck={false}
        />
      </div>

      <div className="tara-auth-field">
        <Label className="tara-auth-label" htmlFor="password">
          Password
        </Label>
        <div className="tara-auth-input-wrap">
          <Input
            autoComplete="current-password"
            className="tara-auth-input"
            disabled={busy}
            id="password"
            name="password"
            placeholder="Enter your password"
            required
            type={showPassword ? "text" : "password"}
          />
          <div className="tara-auth-password-action">
            <Button
              aria-controls="password"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="tara-auth-password-toggle"
              disabled={busy}
              onClick={() => setShowPassword((visible) => !visible)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              {showPassword ? (
                <EyeOff aria-hidden="true" data-icon="inline-start" />
              ) : (
                <Eye aria-hidden="true" data-icon="inline-start" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="tara-auth-error" role="alert">
          {error}
        </p>
      ) : null}

      <Button className="tara-auth-submit" disabled={busy} type="submit">
        {busy ? (
          <LoaderCircle
            aria-hidden="true"
            className="tara-auth-spinner"
            data-icon="inline-start"
          />
        ) : null}
        {busy ? "Signing you in…" : "Sign in"}
        {busy ? null : <ArrowRight aria-hidden="true" data-icon="inline-end" />}
      </Button>

      <p className="tara-auth-note">
        <ShieldCheck aria-hidden="true" />
        <span>
          Part of a team? Use the account provided by your organization.
        </span>
      </p>

      <p className="tara-auth-alternate">
        Bringing your team to TARA? <Link href="/register">Get started</Link>
      </p>
    </form>
  );
}
