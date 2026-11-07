import { AssistantMark } from "@tara/ui/components/assistant-status";
import {
  ArrowUpRight,
  BookOpen,
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  LayoutDashboard,
  Radio,
  Sparkles,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccountMenu } from "@/components/tara/account-menu";
import type { User } from "@/lib/contracts";

export function DashboardShell({
  children,
  user,
}: {
  children: ReactNode;
  user: User;
}) {
  return (
    <div className="tara-assistant tara-dashboard">
      <a className="dash-skip" href="#dashboard-content">
        Skip to dashboard
      </a>
      <aside className="dash-sidebar">
        <Link
          aria-label="tara management overview"
          className="dash-brand"
          href="/dashboard"
        >
          <AssistantMark />
          <span>
            tara<span className="dash-brand-period">.</span>
          </span>
        </Link>
        <div className="dash-workspace-label">
          <Building2 aria-hidden="true" />
          <div>
            <strong>Operations workspace</strong>
            <span>Owner overview</span>
          </div>
        </div>
        <p className="dash-nav-label">YOUR WORKSPACE</p>
        <nav aria-label="Management workspace" className="dash-nav">
          <Link aria-current="page" href="/dashboard">
            <LayoutDashboard aria-hidden="true" />
            Overview
          </Link>
          <a href="#sop-breakdown">
            <ChartNoAxesCombined aria-hidden="true" />
            SOP activity
          </a>
          <a href="#work-queue">
            <Wrench aria-hidden="true" />
            Work queue
          </a>
          <Link href="/sops">
            <BookOpen aria-hidden="true" />
            SOP library
            <ArrowUpRight aria-hidden="true" className="dash-nav-external" />
          </Link>
          <Link href="/sop-intelligence">
            <Sparkles aria-hidden="true" />
            SOP intelligence
            <ArrowUpRight aria-hidden="true" className="dash-nav-external" />
          </Link>
          <Link href="/reports">
            <ClipboardList aria-hidden="true" />
            Execution reports
            <ArrowUpRight aria-hidden="true" className="dash-nav-external" />
          </Link>
          <Link href="/evaluation">
            <ChartNoAxesCombined aria-hidden="true" />
            Evaluation
            <ArrowUpRight aria-hidden="true" className="dash-nav-external" />
          </Link>
        </nav>
        <div className="dash-sidebar-note">
          <Sparkles aria-hidden="true" />
          <strong>A little perspective.</strong>
          <p>See where guidance makes a difference, one procedure at a time.</p>
          <Link href="/sops">
            Review SOPs
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
        <div className="dash-sidebar-footer">
          <Radio aria-hidden="true" />
          <span>Connected by procedure.</span>
        </div>
      </aside>
      <main className="dash-main" id="dashboard-content" tabIndex={-1}>
        <header className="dash-topbar">
          <p>
            WORKSPACE <span>/</span> OPERATIONS OVERVIEW
          </p>
          <AccountMenu user={user} />
        </header>
        {children}
        <footer className="dash-footer">
          <span>tara · Your work, in focus.</span>
          <span>Recorded work. A clearer perspective.</span>
        </footer>
      </main>
    </div>
  );
}
