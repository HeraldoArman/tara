"use client";

import "@tara/ui/assistant.css";
import "./sop-workspace.css";

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
  ArrowUpRight,
  CircleHelp,
  FileText,
  Hand,
  Info,
  LoaderCircle,
  Play,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, humanize } from "@/lib/api";
import type { Run, User } from "@/lib/contracts";
import { sopVersionPath } from "@/lib/sop-version-route";
import { DocumentPanel } from "./document-panel";
import { OpportunityPanel } from "./opportunity-panel";
import { findSourceHighlight } from "./source-highlight";
import {
  canAssist,
  categoryLabels,
  type Opportunity,
  type OpportunityFilter,
  type SavedSopAnalysis,
} from "./types";

function SavedProcedureReview({
  analysis,
  error,
  filter,
  loading,
  onFilterChange,
  onSelect,
  selectedId,
}: {
  analysis: SavedSopAnalysis | null;
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
        <h2>No procedure to review yet.</h2>
        <p>
          Open a procedure from the SOP library to explore its source and
          configured checkpoints.
        </p>
      </section>
    );
  }
  const { opportunities } = analysis;
  const selected = opportunities.find((item) => item.id === selectedId);
  const highlightedId = findSourceHighlight(analysis.document, selected)
    ? selectedId
    : null;
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
          highlightedId={highlightedId}
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
  role,
}: {
  initialVersionId: string;
  role: User["role"];
}) {
  const router = useRouter();
  const versionId = initialVersionId;
  const [analysis, setAnalysis] = useState<SavedSopAnalysis | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<OpportunityFilter>("all");
  const [helpOpen, setHelpOpen] = useState(false);
  const [loading, setLoading] = useState(Boolean(initialVersionId));
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const request = useRef<AbortController | null>(null);
  const canRun = role === "owner" || role === "technician";
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
    if (versionId) {
      loadAnalysis(versionId);
    }
    return () => request.current?.abort();
  }, [loadAnalysis, versionId]);

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
  const reload = useCallback(async () => {
    if (versionId) {
      await loadAnalysis(versionId);
    }
  }, [loadAnalysis, versionId]);
  const selectOpportunity = useCallback(
    (opportunity: Opportunity) => {
      setSelectedId(opportunity.id);
      const linked =
        analysis && findSourceHighlight(analysis.document, opportunity);
      const sourceMessage = linked
        ? "Exact instruction highlighted."
        : "Exact source text unavailable. Review the saved instruction.";
      setAnnouncement(
        `${opportunity.title}. ${categoryLabels[opportunity.category]}. ${sourceMessage}`
      );
    },
    [analysis]
  );
  const changeFilter = useCallback(
    (nextFilter: OpportunityFilter) => {
      setFilter(nextFilter);
      const visible = analysis?.opportunities.filter(
        (item) =>
          nextFilter === "all" ||
          canAssist(item.category) === (nextFilter === "assist")
      );
      if (visible?.some((item) => item.id === selectedId)) {
        return;
      }
      if (visible?.[0]) {
        selectOpportunity(visible[0]);
      } else {
        setSelectedId(null);
      }
    },
    [analysis, selectedId, selectOpportunity]
  );

  return (
    <div className="tara-assistant sop-workspace sop-workspace-embedded">
      <a className="sop-skip-link" href="#sop-review">
        Skip to document review
      </a>
      <div className="sop-workspace-inner">
        <section aria-labelledby="sop-title" className="sop-intro">
          <div>
            <p className="sop-eyebrow">
              MANAGEMENT WORKSPACE <span>/</span> UNDERSTAND &amp; OPTIMIZE
            </p>
            <h1 id="sop-title">A little intelligence in every SOP.</h1>
            <p className="sop-intro-description">
              Explore this procedure’s source and configured checkpoints.
            </p>
          </div>
          <div className="sop-intro-actions">
            <Button
              aria-label="About SOP intelligence"
              onClick={openHelp}
              size="icon"
              variant="outline"
            >
              <CircleHelp />
            </Button>
            {canRun && ready ? (
              <Button
                disabled={analysis?.version.status !== "published" || starting}
                onClick={startSession}
              >
                {starting ? <LoaderCircle className="sop-spinner" /> : <Play />}
                {starting ? "Starting session…" : "Start session"}
              </Button>
            ) : null}
          </div>
        </section>
        {ready && analysis?.version.status === "draft" ? (
          <p className="sop-connected-notice">
            This is a saved draft. Review, validate and publish it before
            starting a session.{" "}
            <Link
              className="underline underline-offset-4"
              href={sopVersionPath(analysis.version)}
            >
              Review draft
            </Link>
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
          error={error}
          filter={filter}
          loading={loading}
          onFilterChange={changeFilter}
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
              <strong>Review the procedure.</strong>
              <p>
                This view follows the procedure opened from the SOP library.
                Published versions are immutable; drafts require review and
                publication.
              </p>
            </li>
            <li>
              <strong>Follow a step to its source.</strong>
              <p>
                Select a card to highlight only its linked instruction. If an
                exact excerpt is unavailable, review the saved instruction and
                its source. Colors describe how that step is configured, not a
                completed verification.
              </p>
            </li>
            <li>
              <strong>Start approved work.</strong>
              <p>
                Technicians and owners can start a session from a published
                procedure once it has been reviewed and approved.
              </p>
            </li>
          </ol>
          <p className="sop-help-note">
            The map reflects the saved SOP definition. It does not replace human
            review, evidence checks or an audit record.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
