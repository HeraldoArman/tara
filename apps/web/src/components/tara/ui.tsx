import {
  ArrowUpRight,
  CircleAlert,
  FileCheck2,
  Radio,
  ShieldCheck,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { humanize } from "@/lib/api";
import type { User } from "@/lib/contracts";
import { AccountMenu } from "./account-menu";

export function Wordmark() {
  return (
    <Link aria-label="TARa work queue" className="wordmark" href="/">
      <span aria-hidden="true" className="tara-mark">
        <i />
        <i />
        <i />
        <i />
      </span>
      TARa<span className="wordmark-dot">.</span>
    </Link>
  );
}
export function AppShell({
  children,
  user,
  active,
}: {
  children: ReactNode;
  user: User;
  active: string;
}) {
  return (
    <>
      <header className="app-header">
        <Wordmark />
        <span className="header-rule" />
        <nav aria-label="Primary">
          {(
            [
              ...(user.role === "sop_manager"
                ? []
                : [{ href: "/" as const, label: "Work queue" }]),
              { href: "/sops", label: "SOP library" },
              { href: "/sop-intelligence", label: "SOP intelligence" },
              ...(user.role === "sop_manager"
                ? []
                : [{ href: "/reports" as const, label: "Reports" }]),
              { href: "/evaluation", label: "Evaluation" },
            ] as const
          ).map((link) => (
            <Link
              aria-current={active === link.href ? "page" : undefined}
              href={link.href}
              key={link.href}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <AccountMenu user={user} />
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <span>
          <ShieldCheck size={14} />
          Approved work. A clear record.
        </span>
        <span>TARa · Field operations</span>
      </footer>
    </>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description ? <p className="lede">{description}</p> : null}
      </div>
      {children ? <div className="heading-actions">{children}</div> : null}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${value.toLowerCase()}`}>
      <span aria-hidden="true" />
      {humanize(value)}
    </span>
  );
}
export function EmptyState({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href?: Route;
  label?: string;
}) {
  return (
    <div className="empty-state">
      <FileCheck2 size={30} />
      <h2>{title}</h2>
      <p>{description}</p>
      {href ? (
        <Link className="button primary" href={href}>
          {label ?? "Go back"}
          <ArrowUpRight size={15} />
        </Link>
      ) : null}
    </div>
  );
}
export function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="notice danger" role="alert">
      <CircleAlert size={19} />
      <div>
        <strong>Unable to load this view</strong>
        <p>{message}</p>
        <Link href="/">Return to work queue</Link>
      </div>
    </div>
  );
}
export function PageUnavailable({ message }: { message: string }) {
  return (
    <main className="unavailable-page">
      <Wordmark />
      <ErrorPanel message={message} />
    </main>
  );
}
export function ReadOnlyNotice() {
  return (
    <p className="subtle-note">
      <Radio size={14} />
      Changes are saved by the server. Reconnect before completing work.
    </p>
  );
}
