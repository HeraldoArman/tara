"use client";

import "@tara/ui/assistant.css";
import "./sop-workspace.css";

import { AssistantMark } from "@tara/ui/components/assistant-status";
import { Badge } from "@tara/ui/components/badge";
import { Button } from "@tara/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@tara/ui/components/dialog";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CircleHelp,
  FileText,
  Hand,
  Info,
  LoaderCircle,
  Play,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, errorMessage, humanize } from "@/lib/api";
import type { Run, SopVersion, User } from "@/lib/contracts";
import { sopVersionPath } from "@/lib/sop-version-route";
import { DocumentPanel } from "./document-panel";
import { OpportunityPanel } from "./opportunity-panel";
import {
  canAssist,
  categoryLabels,
  type Opportunity,
  type OpportunityFilter,
  type SavedSopAnalysis,
  type SavedSopVersion,
} from "./types";
import { UploadDialog } from "./upload-dialog";

function SavedProcedureSelector({
  canRun,
  loading,
  onRefresh,
  onSelect,
  onStart,
  ready,
  selectedVersion,
  starting,
  versionId,
  versions,
}: {
  canRun: boolean;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onSelect: (event: ChangeEvent<HTMLSelectElement>) => void;
  onStart: () => Promise<void>;
  ready: boolean;
  selectedVersion?: SavedSopVersion;
  starting: boolean;
  versionId: string;
  versions: SavedSopVersion[];
}) {
  return (
    <div className="sop-saved-procedure">
      <label htmlFor="saved-sop-version">Saved SOP</label>
      <select
        disabled={starting || !versions.length}
        id="saved-sop-version"
        onChange={onSelect}
        value={versionId}
      >
        {versions.length ? null : <option value="">No saved procedures</option>}
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {version.key} · {version.title} · v{version.version} ·{" "}
            {humanize(version.status)} · revision {version.versionNumber}
          </option>
        ))}
      </select>
      <Button
        disabled={starting || loading}
        onClick={onRefresh}
        variant="outline"
      >
        Refresh saved SOPs
      </Button>
      {selectedVersion ? (
        <Link href={sopVersionPath(selectedVersion)}>
          {selectedVersion.status === "draft"
            ? "Review draft"
            : "View controlled version"}
          <ArrowUpRight aria-hidden="true" />
        </Link>
      ) : null}
      {canRun ? (
        <Button
          disabled={
            !ready || selectedVersion?.status !== "published" || starting
          }
          onClick={onStart}
        >
          {starting ? <LoaderCircle className="sop-spinner" /> : <Play />}{" "}
          {starting ? "Starting session…" : "Start session"}
        </Button>
      ) : null}
    </div>
  );
}

function SavedProcedureReview({
  analysis,
  canUpload,
  error,
  filter,
  loading,
  onFilterChange,
  onSelect,
  selectedId,
}: {
  analysis: SavedSopAnalysis | null;
  canUpload: boolean;
  error: string;
  filter: OpportunityFilter;
  loading: boolean;
  onFilterChange: (filter: OpportunityFilter) => void;
  onSelect: (opportunity: Opportunity) => void;
  selectedId: string | null;
}) {
  if (!analysis) {
    if (loading || error) {
      return null;
    }
    return (
      <section className="sop-connected-empty" id="sop-review">
        <FileText aria-hidden="true" />
        <h2>Your saved procedures appear here.</h2>
        <p>
          {canUpload
            ? "Upload an approved source to create a reviewable draft, then select a saved version."
            : "Ask an SOP manager to publish a procedure for your organization."}
        </p>
      </section>
    );
  }
  const { opportunities } = analysis;
  const selected = opportunities.find((item) => item.id === selectedId);
  const assistCount = opportunities.filter((item) =>
    canAssist(item.category)
  ).length;
  const coverage = Math.round(
    (assistCount / Math.max(opportunities.length, 1)) * 100
  );
  return (
    <>
      <section aria-label="Document analysis overview" className="sop-overview">
        <div className="sop-stat">
          <span className="sop-stat-icon">
            <FileText aria-hidden="true" />
          </span>
          <div>
            <p>Source passages</p>
            <strong>
              {String(analysis.document.sections.length).padStart(2, "0")}
            </strong>
            <span>in this saved procedure</span>
          </div>
        </div>
        <div className="sop-stat" data-tone="assist">
          <span className="sop-stat-icon">
            <Sparkles aria-hidden="true" />
          </span>
          <div>
            <p>Can assist</p>
            <strong>{String(assistCount).padStart(2, "0")}</strong>
            <span>configured checkpoints</span>
          </div>
        </div>
        <div className="sop-stat" data-tone="human">
          <span className="sop-stat-icon">
            <Hand aria-hidden="true" />
          </span>
          <div>
            <p>Human-led</p>
            <strong>
              {String(opportunities.length - assistCount).padStart(2, "0")}
            </strong>
            <span>confirmation stays with a person</span>
          </div>
        </div>
        <div className="sop-coverage">
          <div>
            <span>Assistance configuration</span>
            <strong>{coverage}%</strong>
          </div>
          <div
            aria-label={`${coverage}% of mapped checks and passages allow AI assistance`}
            className="sop-coverage-track"
            role="img"
          >
            <span style={{ width: `${coverage}%` }} />
          </div>
          <p>Of the saved procedure’s mapped checks and passages</p>
        </div>
      </section>
      <div className="sop-review-bar">
        <div>
          <span className="sop-state-dot" />
          <strong>Saved procedure</strong>
          <Badge variant="outline">
            {humanize(analysis.version.status)} · v{analysis.version.version}
          </Badge>
        </div>
        <div className="sop-legend">
          <span data-tone="assist">
            <i />
            Can assist
          </span>
          <span data-tone="human">
            <i />
            Human-led
          </span>
        </div>
      </div>
      <div className="sop-review-grid" id="sop-review">
        <DocumentPanel
          document={analysis.document}
          key={analysis.version.id}
          selected={selected}
        />
        <OpportunityPanel
          filter={filter}
          onFilterChange={onFilterChange}
          onSelect={onSelect}
          opportunities={opportunities}
          selectedId={selectedId}
        />
      </div>
    </>
  );
}

export function SopWorkspace({
  initialVersionId,
  initialVersions,
  role,
}: {
  initialVersionId: string;
  initialVersions: SavedSopVersion[];
  role: User["role"];
}) {
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersions);
  const [versionId, setVersionId] = useState(initialVersionId);
  const [analysis, setAnalysis] = useState<SavedSopAnalysis | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<OpportunityFilter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [loading, setLoading] = useState(Boolean(initialVersionId));
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const request = useRef<AbortController | null>(null);
  const canUpload = role === "owner" || role === "sop_manager";
  const canRun = role === "owner" || role === "technician";
  const selectedVersion = versions.find((version) => version.id === versionId);
  const ready = Boolean(
    analysis && analysis.version.id === versionId && !loading
  );

  const loadAnalysis = useCallback(async (id: string) => {
    request.current?.abort();
    const current = new AbortController();
    request.current = current;
    setLoading(true);
    setError("");
    setAnalysis(null);
    try {
      const next = await api<SavedSopAnalysis>(
        `/sop-versions/${encodeURIComponent(id)}/intelligence`,
        { signal: current.signal }
      );
      if (current.signal.aborted || next.version.id !== id) {
        return;
      }
      setAnalysis(next);
      setVersions((previous) =>
        previous.map((version) =>
          version.id === next.version.id ? next.version : version
        )
      );
      setSelectedId(next.opportunities[0]?.id ?? null);
      setFilter("all");
      setAnnouncement(
        `${next.document.name} loaded from the saved procedure. ${next.opportunities.length} mapped checks and passages.`
      );
    } catch (cause) {
      if (!current.signal.aborted) {
        setError(errorMessage(cause));
      }
    } finally {
      if (!current.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setVersions(initialVersions);
    setVersionId((previous) =>
      initialVersions.some((version) => version.id === previous)
        ? previous
        : (initialVersions.find((version) => version.status === "published")
            ?.id ??
          initialVersions[0]?.id ??
          "")
    );
  }, [initialVersions]);

  useEffect(() => {
    if (versionId) {
      loadAnalysis(versionId);
    }
    return () => request.current?.abort();
  }, [loadAnalysis, versionId]);

  const selectVersion = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    request.current?.abort();
    setVersionId(event.currentTarget.value);
    setAnalysis(null);
    setSelectedId(null);
    setError("");
  }, []);
  const imported = useCallback((version: SopVersion) => {
    request.current?.abort();
    const option: SavedSopVersion = {
      id: version.id,
      key: version.key ?? version.definition.sopKey ?? "Saved SOP",
      sopId: version.sopId,
      status: version.status,
      title: version.title,
      version: version.version,
      versionNumber: version.versionNumber,
    };
    setVersions((previous) => [
      option,
      ...previous.filter((item) => item.id !== option.id),
    ]);
    setVersionId(version.id);
    setUploadOpen(false);
  }, []);
  const exportMap = useCallback(() => {
    if (!analysis) {
      return;
    }
    const blob = new Blob(
      [
        JSON.stringify(
          { requiresHumanReview: true, schemaVersion: 1, ...analysis },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${analysis.document.name}-opportunity-map.json`;
    link.click();
    URL.revokeObjectURL(url);
    setAnnouncement(
      "Saved procedure map exported with source links and configuration labels."
    );
  }, [analysis]);
  const startSession = useCallback(async () => {
    if (
      !(canRun && analysis) ||
      analysis.version.id !== versionId ||
      analysis.version.status !== "published" ||
      loading ||
      starting
    ) {
      return;
    }
    setStarting(true);
    setError("");
    try {
      const run = await api<Run>(
        `/sop-versions/${encodeURIComponent(analysis.version.id)}/runs`,
        { body: JSON.stringify({}), method: "POST" }
      );
      router.push(`/runs/${run.id}`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setStarting(false);
    }
  }, [analysis, canRun, loading, router, starting, versionId]);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const openUpload = useCallback(() => setUploadOpen(true), []);
  const closeUpload = useCallback(() => setUploadOpen(false), []);
  const reload = useCallback(async () => {
    if (versionId) {
      await loadAnalysis(versionId);
    }
  }, [loadAnalysis, versionId]);
  const refreshSaved = useCallback(async () => {
    router.refresh();
    if (versionId) {
      await loadAnalysis(versionId);
    }
  }, [loadAnalysis, router, versionId]);
  const selectOpportunity = useCallback((opportunity: Opportunity) => {
    setSelectedId(opportunity.id);
    setAnnouncement(
      `${opportunity.title}. ${categoryLabels[opportunity.category]}. Linked passage highlighted.`
    );
  }, []);

  return (
    <main className="tara-assistant sop-workspace">
      <a className="sop-skip-link" href="#sop-review">
        Skip to document review
      </a>
      <div className="sop-workspace-inner">
        <header className="sop-header">
          <Link aria-label="TARA home" className="sop-brand" href="/">
            <AssistantMark />
            <span className="sop-brand-word">
              tara<span className="sop-brand-period">.</span>
            </span>
          </Link>
          <div className="sop-brand-caption">
            <span className="sop-eyebrow">OPERATIONAL INTELLIGENCE</span>
            <span>A little clarity. At every step.</span>
          </div>
          <nav aria-label="Workspace" className="sop-navigation">
            <Link aria-current="page" href="/sop-intelligence">
              <FileText aria-hidden="true" />
              SOP intelligence
            </Link>
            <Link href="/">
              <Sparkles aria-hidden="true" />
              Work queue
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </nav>
          <Button
            aria-label="About SOP intelligence"
            className="sop-help-button"
            onClick={openHelp}
            size="icon"
            variant="outline"
          >
            <CircleHelp />
          </Button>
        </header>
        <section aria-labelledby="sop-title" className="sop-intro">
          <div>
            <p className="sop-eyebrow">
              MANAGEMENT WORKSPACE <span>/</span> UNDERSTAND &amp; OPTIMIZE
            </p>
            <h1 id="sop-title">A little intelligence in every SOP.</h1>
            <p className="sop-intro-description">
              Select a saved procedure to explore its source and configured
              checkpoints.
            </p>
          </div>
          <div className="sop-intro-actions">
            <Button
              disabled={!ready || starting}
              onClick={exportMap}
              variant="outline"
            >
              <ArrowDownToLine data-icon="inline-start" />
              Export map
            </Button>
            {canUpload ? (
              <Button disabled={starting} onClick={openUpload}>
                <Upload data-icon="inline-start" />
                Upload SOP
              </Button>
            ) : null}
          </div>
        </section>
        <SavedProcedureSelector
          canRun={canRun}
          loading={loading}
          onRefresh={refreshSaved}
          onSelect={selectVersion}
          onStart={startSession}
          ready={ready}
          selectedVersion={selectedVersion}
          starting={starting}
          versionId={versionId}
          versions={versions}
        />
        {selectedVersion?.status === "draft" ? (
          <p className="sop-connected-notice">
            This is a saved draft. Review, validate and publish it before
            starting a session.
          </p>
        ) : null}
        {error ? (
          <div className="sop-connected-error" role="alert">
            <p>{error}</p>
            {!analysis && versionId ? (
              <Button
                disabled={loading || starting}
                onClick={reload}
                variant="outline"
              >
                Retry loading SOP
              </Button>
            ) : null}
          </div>
        ) : null}
        {loading ? (
          <p aria-live="polite" className="sop-connected-notice" role="status">
            <LoaderCircle className="sop-spinner" />
            Loading the saved procedure…
          </p>
        ) : null}
        <SavedProcedureReview
          analysis={ready ? analysis : null}
          canUpload={canUpload}
          error={error}
          filter={filter}
          loading={loading}
          onFilterChange={setFilter}
          onSelect={selectOpportunity}
          selectedId={selectedId}
        />
        <footer className="sop-footer">
          <span>
            <ShieldCheck aria-hidden="true" />
            Your SOP stays the source of truth.
          </span>
          <span>
            <Info aria-hidden="true" />
            Saved verification configuration · No work has been verified
          </span>
          <Link href="/sops">
            SOP library
            <ArrowUpRight aria-hidden="true" />
          </Link>
        </footer>
        <p aria-live="polite" className="sr-only" role="status">
          {announcement}
        </p>
      </div>
      {uploadOpen && canUpload ? (
        <UploadDialog onClose={closeUpload} onImported={imported} />
      ) : null}
      <Dialog onOpenChange={setHelpOpen} open={helpOpen}>
        <DialogContent className="tara-assistant sop-dialog">
          <DialogHeader>
            <DialogTitle>A closer look at your SOP.</DialogTitle>
            <DialogDescription>
              Read a saved source and its configured verification steps, side by
              side.
            </DialogDescription>
          </DialogHeader>
          <ol className="sop-help-list">
            <li>
              <strong>Choose a saved procedure.</strong>
              <p>
                Select the version you want to review. Published procedures are
                immutable; drafts require review and publication.
              </p>
            </li>
            <li>
              <strong>Follow a step to its source.</strong>
              <p>
                Select a card to highlight its saved passage. Colors describe
                how that step is configured, not a completed verification.
              </p>
            </li>
            <li>
              <strong>Start approved work.</strong>
              <p>
                Technicians and owners can start a session from a published
                procedure. Uploading creates a saved source and draft through
                the application server.
              </p>
            </li>
          </ol>
          <p className="sop-help-note">
            The map reflects the saved SOP definition. It does not replace human
            review, evidence checks or an audit record.
          </p>
        </DialogContent>
      </Dialog>
    </main>
  );
}
