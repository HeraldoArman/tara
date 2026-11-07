"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage, humanize } from "@/lib/api";
import type { User } from "@/lib/contracts";
export function AccountMenu({ user }: { user: User }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const logout = async () => {
    try {
      await api("/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div className="account">
      <div className="account-copy">
        <strong>{user.name}</strong>
        <span>{humanize(user.role)}</span>
      </div>
      <span aria-hidden="true" className="avatar">
        {user.name
          .split(" ")
          .map((part) => part[0])
          .slice(0, 2)
          .join("")}
      </span>
      <button
        aria-label="Sign out"
        className="icon-button"
        onClick={logout}
        type="button"
      >
        <LogOut size={17} />
      </button>
      {error ? (
        <span className="account-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
