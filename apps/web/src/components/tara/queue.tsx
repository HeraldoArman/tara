"use client";
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  CircleAlert,
  Clock3,
  FileText,
  LoaderCircle,
  Play,
  RefreshCw,
  ShieldCheck,
  Video,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { api, dateTime, errorMessage, humanize } from "@/lib/api";
import type { Report, Role, Run, WorkOrder } from "@/lib/contracts";
import { Status } from "./ui";

export function WorkQueue({
  items,
  userId,
  role,
}: {
  items: WorkOrder[];
  userId: string;
  role: Role;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [refreshing, refresh] = useTransition();
  const filtered = items.filter(
    (item) => filter === "all" || item.priority.toLowerCase() === filter
  );
  const resume = items.find(
    (item) =>
      item.assignedTo === userId &&
      item.runId &&
      !["complete", "partial", "cancelled"].includes(item.status)
  );
  const start = async (item: WorkOrder) => {
    setBusy(item.id);
    setError("");
    try {
      const run = await api<Run>(`/work-orders/${item.id}/runs`, {
        method: "POST",
      });
      router.push(`/runs/${run.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      {resume ? (
        <div className="resume-strip">
          <span className="resume-icon">
            <Play size={18} />
          </span>
          <div>
            <strong>Pick up where you left off.</strong>
            <p>
              {resume.reference} · {resume.title}
            </p>
          </div>
          <Link className="button primary" href={`/runs/${resume.runId}`}>
            Resume session
            <ArrowRight size={16} />
          </Link>
        </div>
      ) : null}
      <section className="panel work-queue">
        <header className="panel-head">
          <div>
            <h2>
              Work queue <span className="count">{items.length}</span>
            </h2>
            <p>
              {role === "technician"
                ? "Choose an assigned job to start your video session."
                : "Assignments across your organization, in one place."}
            </p>
          </div>
          <fieldset aria-label="Filter work queue" className="segmented">
            {["all", "priority", "standard"].map((value) => (
              <button
                aria-pressed={filter === value}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {humanize(value)}
              </button>
            ))}
          </fieldset>
        </header>
        <div className="panel-body queue-session-help">
          <p className="subtle-note">
            <Video size={15} />
            Start a session, connect the assistant, then enable your camera.
          </p>
          <button
            className="text-button"
            disabled={refreshing || !!busy}
            onClick={() => refresh(() => router.refresh())}
            type="button"
          >
            <RefreshCw size={14} />
            {refreshing ? "Refreshing…" : "Refresh jobs"}
          </button>
        </div>
        {error ? (
          <div className="notice danger" role="alert">
            <CircleAlert size={18} />
            {error}
          </div>
        ) : null}
        <div className="work-order-list">
          {filtered.map((item) => (
            <article className="work-order" key={item.id}>
              <div className="work-order-top">
                <span className="mono">{item.reference}</span>
                <Status value={item.priority} />
                <span className="work-order-time">
                  <Clock3 size={13} />
                  {item.estimatedMinutes} min
                </span>
              </div>
              <div className="work-order-body">
                <div className="work-order-device">
                  <Wrench size={23} />
                </div>
                <div>
                  <h3>{item.title}</h3>
                  <p>
                    {item.asset.model} <span>· {item.asset.serial}</span>
                  </p>
                </div>
              </div>
              <p className="work-order-issue">{item.issue}</p>
              <div className="work-order-bottom">
                <span>
                  <ShieldCheck size={14} />
                  {humanize(item.status)}
                </span>
                {item.assignedTo === userId ? (
                  <button
                    className="button small"
                    disabled={!!busy}
                    onClick={() => start(item)}
                    type="button"
                  >
                    {busy === item.id ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Play size={14} />
                    )}{" "}
                    {item.runId ? "Resume session" : "Start video session"}
                    <ArrowUpRight size={14} />
                  </button>
                ) : null}
                {item.assignedTo !== userId && item.runId ? (
                  <Link className="button small" href={`/runs/${item.runId}`}>
                    Review session
                    <ArrowUpRight size={14} />
                  </Link>
                ) : null}
                {item.assignedTo !== userId && !item.runId ? (
                  <span className="subtle-note">
                    Awaiting assigned technician
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="inline-empty">
            {items.length === 0 ? (
              <>
                <h3>
                  {role === "owner"
                    ? "No jobs created yet"
                    : "No jobs assigned yet"}
                </h3>
                <p>
                  {role === "owner"
                    ? "Create a job using a published procedure and assign it to a technician. You can also assign it to yourself."
                    : "An owner must create a job using a published procedure and assign it to your account. Your job will then show a Start video session button here."}
                </p>
                {role === "owner" ? (
                  <Link className="button primary" href="/work-orders/new">
                    Create job
                    <ArrowRight size={15} />
                  </Link>
                ) : (
                  <p>
                    After the owner assigns your job, select Refresh jobs above.
                  </p>
                )}
              </>
            ) : (
              <>
                <p>{`No ${filter} jobs. Other jobs may be available under All.`}</p>
                <button
                  className="button"
                  onClick={() => setFilter("all")}
                  type="button"
                >
                  Show all jobs
                </button>
              </>
            )}
          </div>
        ) : null}
      </section>
    </>
  );
}
interface ReadinessState {
  api: string;
  browser: string;
  camera: string;
}
export function Readiness({ publishedCount }: { publishedCount?: number }) {
  const [state, setState] = useState<ReadinessState>({
    api: "Checking…",
    browser: "Checking…",
    camera: "Not checked",
  });
  const [busy, setBusy] = useState(false);
  const check = useCallback(async () => {
    setBusy(true);
    let apiState = "Unavailable";
    try {
      const r = await fetch("/api/health/ready", { cache: "no-store" });
      apiState = r.ok ? "Reachable" : "Not ready";
    } catch {
      apiState = "Unavailable";
    }
    let camera = "Not available";
    try {
      const devices = await navigator.mediaDevices?.enumerateDevices();
      camera = devices?.some((device) => device.kind === "videoinput")
        ? "Available · permission on start"
        : "No camera found";
    } catch {
      camera = "Permission required on start";
    }
    setState({
      api: apiState,
      browser:
        window.isSecureContext && navigator.mediaDevices
          ? "Supported"
          : "HTTPS required",
      camera,
    });
    setBusy(false);
  }, []);
  useEffect(() => {
    check().catch(() => setBusy(false));
  }, [check]);
  const checks = [
    { icon: ShieldCheck, label: "Secure browser", value: state.browser },
    { icon: Camera, label: "Bench camera", value: state.camera },
    { icon: Video, label: "Application API", value: state.api },
    {
      icon: FileText,
      label: "Published procedures",
      value:
        publishedCount === undefined
          ? "Check SOP library"
          : `${publishedCount} available`,
    },
  ];
  return (
    <section className="panel readiness">
      <header className="panel-head">
        <div>
          <h2>Workspace readiness</h2>
          <p>Checked on this device.</p>
        </div>
        <button
          aria-label="Recheck readiness"
          className="icon-button"
          disabled={busy}
          onClick={check}
          type="button"
        >
          <RefreshCw className={busy ? "spin" : ""} size={16} />
        </button>
      </header>
      <div className="readiness-list">
        {checks.map(({ icon: Icon, label, value }) => (
          <div className="readiness-row" key={label}>
            <span className="readiness-icon">
              <Icon size={16} />
            </span>
            <div>
              <strong>{label}</strong>
              <span>{value}</span>
            </div>
            {["Supported", "Reachable"].includes(value) ||
            value.startsWith("Available") ||
            (publishedCount !== undefined &&
              label === "Published procedures" &&
              publishedCount > 0) ? (
              <Check className="success-text" size={15} />
            ) : null}
          </div>
        ))}
      </div>
      <p className="readiness-note">
        Microphone access is requested only when you activate Ask TARa. Realtime
        availability is checked on connection.
      </p>
    </section>
  );
}
export function RecentReports({ items }: { items: Report[] }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>Recent reports</h2>
          <p>Your recorded work.</p>
        </div>
        <Link
          aria-label="View all reports"
          className="icon-button"
          href="/reports"
        >
          <ArrowUpRight size={17} />
        </Link>
      </header>
      {items.length ? (
        <div className="recent-reports">
          {items.slice(0, 3).map((report) => (
            <Link href={`/reports/${report.id}`} key={report.id}>
              <span className="report-icon">
                <FileText size={18} />
              </span>
              <div>
                <strong>
                  {report.workOrder?.reference ?? report.id.slice(0, 8)}
                </strong>
                <span>{dateTime(report.createdAt)}</span>
              </div>
              <Status value={report.outcome ?? report.status ?? "recorded"} />
            </Link>
          ))}
        </div>
      ) : (
        <p className="inline-empty">Completed and partial runs appear here.</p>
      )}
    </section>
  );
}
