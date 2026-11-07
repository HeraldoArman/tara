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
  Building2,
  CircleHelp,
  FileText,
  Hand,
  Info,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";

import { DocumentPanel } from "./document-panel";
import { OpportunityPanel } from "./opportunity-panel";
import { sampleAnalysis } from "./sample-analysis";
import {
  canAssist,
  categoryLabels,
  type Opportunity,
  type OpportunityFilter,
  type SopAnalysis,
} from "./types";
import { UploadDialog } from "./upload-dialog";

export function SopWorkspace() {
  const [analysis, setAnalysis] = useState<SopAnalysis>(sampleAnalysis);
  const [selectedId, setSelectedId] = useState<string | null>("identify");
  const [filter, setFilter] = useState<OpportunityFilter>("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const { document, opportunities } = analysis;
  const selected = opportunities.find((item) => item.id === selectedId);
  const assistCount = opportunities.filter((item) =>
    canAssist(item.category)
  ).length;
  const coverage = Math.round(
    (assistCount / Math.max(opportunities.length, 1)) * 100
  );

  const replaceAnalysis = useCallback((next: SopAnalysis) => {
    setAnalysis(next);
    setSelectedId(next.opportunities[0]?.id ?? null);
    setFilter("all");
    setUploadOpen(false);
    setAnnouncement(
      `${next.document.name} is ready. ${next.opportunities.length} source-linked suggestions.`
    );
  }, []);

  const exportMap = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            analysisMode:
              document.origin === "sample"
                ? "curated-sample"
                : "rule-based-preview",
            requiresHumanReview: true,
            schemaVersion: 1,
            ...analysis,
          },
          null,
          2
        ),
      ],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${document.name}-opportunity-map.json`;
    link.click();
    URL.revokeObjectURL(url);
    setAnnouncement(
      "Opportunity map exported with its source passages and preview labels."
    );
  }, [analysis, document.name, document.origin]);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const openUpload = useCallback(() => setUploadOpen(true), []);
  const closeUpload = useCallback(() => setUploadOpen(false), []);
  const loadSample = useCallback(
    () => replaceAnalysis(sampleAnalysis),
    [replaceAnalysis]
  );
  const selectOpportunity = useCallback((opportunity: Opportunity) => {
    setSelectedId(opportunity.id);
    setAnnouncement(
      `${opportunity.title}. ${categoryLabels[opportunity.category]}. Source passage highlighted ${canAssist(opportunity.category) ? "green" : "red"}.`
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
            <Link href="/assistant">
              <Sparkles aria-hidden="true" />
              Field assistant
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
              Explore your procedures. Discover where TARA can lend a hand.
            </p>
          </div>
          <div className="sop-intro-actions">
            <Button onClick={exportMap} variant="outline">
              <ArrowDownToLine data-icon="inline-start" />
              Export map
            </Button>
            <Button onClick={openUpload}>
              <Upload data-icon="inline-start" />
              Upload SOP
            </Button>
          </div>
        </section>

        <section
          aria-label="Document analysis overview"
          className="sop-overview"
        >
          <div className="sop-stat">
            <span className="sop-stat-icon">
              <FileText aria-hidden="true" />
            </span>
            <div>
              <p>Source passages</p>
              <strong>{String(opportunities.length).padStart(2, "0")}</strong>
              <span>in this procedure</span>
            </div>
          </div>
          <div className="sop-stat" data-tone="assist">
            <span className="sop-stat-icon">
              <Sparkles aria-hidden="true" />
            </span>
            <div>
              <p>Can assist</p>
              <strong>{String(assistCount).padStart(2, "0")}</strong>
              <span>AI opportunities</span>
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
              <span>human expertise comes first</span>
            </div>
          </div>
          <div className="sop-coverage">
            <div>
              <span>Assistance potential</span>
              <strong>{coverage}%</strong>
            </div>
            <div
              aria-label={`${coverage}% of passages have preview AI opportunities`}
              className="sop-coverage-track"
              role="img"
            >
              <span style={{ width: `${coverage}%` }} />
            </div>
            <p>Of source passages in this preview</p>
          </div>
        </section>

        <div className="sop-review-bar">
          <div>
            <span className="sop-state-dot" />
            <strong>Ready to explore</strong>
            <Badge variant="outline">
              {document.origin === "sample" ? "Sample SOP" : "Uploaded SOP"}
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
            document={document}
            key={document.id}
            selected={selected}
          />
          <OpportunityPanel
            filter={filter}
            onFilterChange={setFilter}
            onSelect={selectOpportunity}
            opportunities={opportunities}
            selectedId={selectedId}
          />
        </div>

        <footer className="sop-footer">
          <span>
            <ShieldCheck aria-hidden="true" />
            Your SOP stays the source of truth.
          </span>
          <span>
            <Info aria-hidden="true" />
            {document.origin === "sample"
              ? "Curated sample analysis"
              : "Rule-based preview analysis"}{" "}
            · Human review required
          </span>
          {document.origin === "upload" ? (
            <button onClick={loadSample} type="button">
              Load sample SOP
              <ArrowUpRight aria-hidden="true" />
            </button>
          ) : (
            <span>
              <Building2 aria-hidden="true" />
              Built for the people behind the process.
            </span>
          )}
        </footer>
        <p aria-live="polite" className="sr-only" role="status">
          {announcement}
        </p>
      </div>

      {uploadOpen ? (
        <UploadDialog onAnalyze={replaceAnalysis} onClose={closeUpload} />
      ) : null}
      <Dialog onOpenChange={setHelpOpen} open={helpOpen}>
        <DialogContent className="tara-assistant sop-dialog">
          <DialogHeader>
            <DialogTitle>A closer look at your SOP.</DialogTitle>
            <DialogDescription>
              Read the source and explore possible assistance, side by side.
            </DialogDescription>
          </DialogHeader>
          <ol className="sop-help-list">
            <li>
              <strong>Start with a document.</strong>
              <p>
                Explore the sample or upload a PDF, DOCX, TXT, or Markdown SOP.
                The left panel shows its extracted text.
              </p>
            </li>
            <li>
              <strong>Follow an opportunity to its source.</strong>
              <p>
                Select a card to highlight the corresponding passage. Green
                indicates possible AI assistance. Red indicates work or approval
                that stays with a person.
              </p>
            </li>
            <li>
              <strong>Review the suggestions.</strong>
              <p>
                This frontend preview uses a curated sample and local rules for
                uploads. Live AI analysis is not connected. Categories describe
                possible capabilities, and do not certify a task or establish
                compliance.
              </p>
            </li>
          </ol>
          <p className="sop-help-note">
            Export the map to keep your source passages and suggestions before
            leaving this page.
          </p>
        </DialogContent>
      </Dialog>
    </main>
  );
}
