"use client";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api("/auth/login", {
        body: JSON.stringify({
          password: form.get("password"),
          username: form.get("username"),
        }),
        method: "POST",
      });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="username">Username</label>
      <input
        autoComplete="username"
        autoFocus
        id="username"
        name="username"
        placeholder="Your assigned username"
        required
      />
      <label htmlFor="password">Password</label>
      <input
        autoComplete="current-password"
        id="password"
        name="password"
        placeholder="Enter your password"
        required
        type="password"
      />
      {error ? (
        <div className="notice danger" role="alert">
          {error}
        </div>
      ) : null}
      <button className="button primary" disabled={busy} type="submit">
        {busy ? <LoaderCircle className="spin" size={17} /> : null}Sign in
        <ArrowRight size={17} />
      </button>
      <p className="subtle-note">
        <ShieldCheck size={15} />
        Use the account assigned by your organization.
      </p>
    </form>
  );
}
