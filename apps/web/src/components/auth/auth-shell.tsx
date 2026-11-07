import { AssistantMark } from "@tara/ui/components/assistant-status";
import { ArrowRight, FileText, ScanLine, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import "@tara/ui/assistant.css";
import "./auth.css";

interface AuthShellProps {
  readonly children: ReactNode;
  readonly description: string;
  readonly eyebrow: string;
  readonly mode: "login" | "register";
  readonly title: string;
}

const workflowSteps = [
  { icon: FileText, label: "Your procedures", number: "01" },
  { icon: ScanLine, label: "Live guidance", number: "02" },
  { icon: ShieldCheck, label: "Clear evidence", number: "03" },
];

export function AuthShell({
  children,
  mode,
  eyebrow,
  title,
  description,
}: AuthShellProps) {
  return (
    <div className="tara-assistant tara-auth" data-auth-mode={mode}>
      <a className="tara-auth-skip" href="#auth-content">
        Skip to {mode === "login" ? "sign in" : "registration"}
      </a>

      <header className="tara-auth-header">
        <Link aria-label="tara home" className="tara-auth-brand" href="/">
          <AssistantMark />
          <span>
            tara<span className="tara-auth-brand-period">.</span>
          </span>
        </Link>
        <span className="tara-auth-header-caption">
          INTELLIGENCE IN EVERY OPERATION.
        </span>
        <Link className="tara-auth-preview-link" href="/assistant">
          Meet your assistant
          <ArrowRight aria-hidden="true" />
        </Link>
      </header>

      <main className="tara-auth-main" id="auth-content" tabIndex={-1}>
        <section aria-labelledby="auth-story-title" className="tara-auth-story">
          <div className="tara-auth-story-copy">
            <p className="tara-auth-eyebrow">
              <span aria-hidden="true" className="tara-auth-dot" /> FROM
              PROCEDURE TO PRACTICE
            </p>
            <h2 id="auth-story-title">
              {mode === "login" ? (
                <>
                  A clearer way
                  <br />
                  <span>to work.</span>
                </>
              ) : (
                <>
                  Your standards.
                  <br />
                  <span>Brought to life.</span>
                </>
              )}
            </h2>
            <p className="tara-auth-story-description">
              Connect what your procedures say with what happens on the floor.
              tara keeps your team guided, one step at a time.
            </p>
          </div>

          <div className="tara-auth-flow">
            <div aria-hidden="true" className="tara-auth-orbit">
              <span className="tara-auth-orbit-ring" />
              <span className="tara-auth-orbit-ring" />
              <span className="tara-auth-orbit-core">
                <AssistantMark />
              </span>
              <span className="tara-auth-orbit-dot" />
            </div>
            <ol aria-label="How tara connects your operations">
              {workflowSteps.map(({ icon: Icon, label, number }) => (
                <li key={number}>
                  <span className="tara-auth-flow-number">{number}</span>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ol>
            <p>Grounded in your SOPs. Focused on your people.</p>
          </div>
        </section>

        <section aria-labelledby="auth-title" className="tara-auth-panel">
          <div className="tara-auth-panel-heading">
            <p className="tara-auth-eyebrow">{eyebrow}</p>
            <h1 id="auth-title">{title}</h1>
            <p className="tara-auth-description">{description}</p>
          </div>
          {children}
        </section>
      </main>

      <footer className="tara-auth-footer">
        <span>A little guidance. A clearer view.</span>
        <span>Operational intelligence, with people at the center.</span>
      </footer>
    </div>
  );
}
