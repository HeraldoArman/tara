"use client";

import "./workspace-shell.css";
import { Button } from "@tara/ui/components/button";
import {
  BookOpen,
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  LayoutDashboard,
  Menu,
  ShieldCheck,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { User } from "@/lib/contracts";
import { workspaceSection } from "@/lib/workspace-navigation";
import { AccountMenu } from "./account-menu";

function workspaceLinks(role: User["role"]) {
  return [
    ...(role === "owner"
      ? [
          {
            href: "/dashboard",
            icon: LayoutDashboard,
            id: "overview",
            label: "Overview",
          },
          {
            href: "/dashboard#sop-breakdown",
            icon: ChartNoAxesCombined,
            id: "activity",
            label: "SOP activity",
          },
        ]
      : []),
    ...(role === "sop_manager"
      ? []
      : [
          {
            href: role === "owner" ? "/dashboard#work-queue" : "/",
            icon: Wrench,
            id: "queue",
            label: "Work queue",
          },
        ]),
    { href: "/sops", icon: BookOpen, id: "sops", label: "SOP library" },
    {
      href: "/sop-intelligence",
      icon: Sparkles,
      id: "intelligence",
      label: "SOP intelligence",
    },
    ...(role === "sop_manager"
      ? []
      : [
          {
            href: "/reports",
            icon: ClipboardList,
            id: "reports",
            label: "Reports",
          },
        ]),
    {
      href: "/evaluation",
      icon: ChartNoAxesCombined,
      id: "evaluation",
      label: "Evaluation",
    },
  ];
}

function WorkspaceBrand({ href }: { href: Route }) {
  return (
    <Link aria-label="tara workspace" className="wordmark" href={href}>
      <span aria-hidden="true" className="tara-mark">
        <i />
        <i />
        <i />
        <i />
      </span>
      tara<span className="wordmark-dot">.</span>
    </Link>
  );
}

function SidebarContent({
  user,
  section,
  onNavigate,
}: {
  user: User;
  section: string;
  onNavigate: (href: string) => void;
}) {
  const home = user.role === "owner" ? "/dashboard" : "/";
  return (
    <>
      <WorkspaceBrand href={home} />
      <div className="workspace-label">
        <Building2 aria-hidden="true" size={18} />
        <div>
          <strong>Operations workspace</strong>
          <span>
            {user.role === "owner" ? "Team overview" : "Your work, in focus."}
          </span>
        </div>
      </div>
      <p className="eyebrow">YOUR WORKSPACE</p>
      <nav aria-label="Primary" className="workspace-nav">
        {workspaceLinks(user.role).map(({ id, href, label, icon: Icon }) => (
          <Link
            aria-current={section === id ? "page" : undefined}
            href={href as Route}
            key={id}
            onClick={() => onNavigate(href)}
          >
            <Icon aria-hidden="true" size={18} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="workspace-sidebar-note">
        <Sparkles aria-hidden="true" size={20} />
        <strong>One step. A clearer view.</strong>
        <p>Keep your procedures, work, and evidence connected.</p>
      </div>
      <div className="workspace-sidebar-foot">
        <ShieldCheck aria-hidden="true" size={14} />
        Approved work. A clear record.
      </div>
    </>
  );
}

export function WorkspaceShell({
  children,
  user,
  active,
}: {
  children: ReactNode;
  user: User;
  active: string;
}) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const section = workspaceSection(user.role, pathname || active, hash);
  const current = workspaceLinks(user.role).find((link) => link.id === section);

  useEffect(() => {
    const syncHash = () => {
      if (window.location.pathname === pathname) {
        setHash(window.location.hash);
      }
    };
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, [pathname]);

  useEffect(() => {
    if (menuOpen) {
      dialog.current?.showModal();
    } else {
      dialog.current?.close();
    }
  }, [menuOpen]);

  const navigate = (href: string) => {
    const hashIndex = href.indexOf("#");
    setHash(hashIndex === -1 ? "" : href.slice(hashIndex));
    setMenuOpen(false);
  };

  return (
    <div className="workspace-shell">
      <a className="workspace-skip" href="#main-content">
        Skip to content
      </a>
      <aside aria-label="Workspace sidebar" className="workspace-sidebar">
        <SidebarContent onNavigate={navigate} section={section} user={user} />
      </aside>
      <div className="workspace-body">
        <header className="workspace-topbar">
          <Button
            aria-controls="workspace-menu"
            aria-expanded={menuOpen}
            aria-label="Open navigation"
            className="workspace-menu-toggle"
            onClick={() => setMenuOpen(true)}
            size="icon"
            variant="outline"
          >
            <Menu aria-hidden="true" />
          </Button>
          <p className="workspace-location">
            <span>WORKSPACE</span>
            <span aria-hidden="true">/</span>
            <strong>{current?.label ?? "Workspace"}</strong>
          </p>
          <AccountMenu user={user} />
        </header>
        <main className="workspace-content" id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-bottomline">
          <span>tara · Your work, in focus.</span>
          <span>Recorded work. A clearer perspective.</span>
        </footer>
      </div>
      <dialog
        aria-label="Workspace navigation"
        className="workspace-mobile-sidebar"
        id="workspace-menu"
        onCancel={() => setMenuOpen(false)}
        onClose={() => setMenuOpen(false)}
        ref={dialog}
      >
        {menuOpen ? (
          <>
            <Button
              aria-label="Close navigation"
              className="workspace-menu-close"
              onClick={() => setMenuOpen(false)}
              size="icon"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
            <SidebarContent
              onNavigate={navigate}
              section={section}
              user={user}
            />
          </>
        ) : null}
      </dialog>
    </div>
  );
}
