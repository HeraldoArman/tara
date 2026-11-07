"use client";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FileText,
  LoaderCircle,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, api, errorMessage } from "@/lib/api";
import type { SopVersion } from "@/lib/contracts";
import { objectRecord } from "@/lib/draft-preview";
import { sopVersionPath } from "@/lib/sop-version-route";
import { ProcedureRequirements } from "./procedure-requirements";
import { ReferenceMediaCards, SopReferenceUpload } from "./reference-media";
import { SourceDocument, ToolResults } from "./tool-results";
import { Status } from "./ui";

export function SopImport() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "upload" | "retry">("");
  const [filename, setFilename] = useState("");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const showFailure = (cause: unknown, fallbackId: string | null = null) => {
    setError(errorMessage(cause));
    const retainedId =
      cause instanceof ApiError ? cause.details.documentId : null;
    setDocumentId(
      typeof retainedId === "string" && retainedId ? retainedId : fallbackId
    );
  };
  const openDraft = (result: SopVersion) => {
    router.push(sopVersionPath(result));
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("upload");
    setError("");
    try {
      openDraft(
        await api<SopVersion>("/sops/imports", {
          body: new FormData(event.currentTarget),
          method: "POST",
        })
      );
    } catch (cause) {
      showFailure(cause);
    } finally {
      setBusy("");
    }
  };
  const retry = async () => {
    if (!documentId) {
      return;
    }
    setBusy("retry");
    setError("");
    try {
      openDraft(
        await api<SopVersion>(
          `/sops/imports/${encodeURIComponent(documentId)}/retry`,
          { method: "POST" }
        )
      );
    } catch (cause) {
      showFailure(cause, documentId);
    } finally {
      setBusy("");
    }
  };
  return (
    <form className="import-form panel" onSubmit={submit}>
      <label className="upload-zone" htmlFor="source-file">
        <span className="upload-icon">
          <Upload size={30} />
        </span>
        <h2>{filename || "Start with your approved source."}</h2>
        <p>Choose a Markdown, TXT or text-based PDF document.</p>
        <span className="button">
          Choose document
          <ArrowRight size={15} />
        </span>
        <input
          accept=".md,.markdown,.txt,.pdf,text/plain,text/markdown,application/pdf"
          disabled={!!busy}
          id="source-file"
          name="file"
          onChange={(event) => {
            setFilename(event.target.files?.[0]?.name ?? "");
            setDocumentId(null);
            setError("");
          }}
          required
          type="file"
        />
      </label>
      <div className="import-details">
        <h3>
          <ShieldCheck size={17} />A draft first. Always.
        </h3>
        <p>
          tara extracts source sections and creates a structured procedure.
          Review instructions, references, criteria and failure behavior before
          publishing.
        </p>
        <p>
          Scanned documents and OCR are not supported. Upload only documents
          authorized for your organization.
        </p>
        {error ? (
          <div className="notice danger" role="alert">
            {error}
          </div>
        ) : null}
        {documentId ? (
          <div className="retained-source">
            <p role="status">
              Your source is saved. Retry draft generation without uploading the
              document again.
            </p>
            <button
              className="button primary"
              disabled={!!busy}
              onClick={retry}
              type="button"
            >
              {busy === "retry" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <BookOpen size={16} />
              )}{" "}
              {busy === "retry"
                ? "Retrying draft generation…"
                : "Retry draft generation"}
            </button>
            <p className="subtle-note">
              Choose a different document to start another import.
            </p>
          </div>
        ) : (
          <button
            className="button primary"
            disabled={!!busy || !filename}
            type="submit"
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <BookOpen size={16} />
            )}{" "}
            {busy ? "Extracting and creating draft…" : "Generate SOP draft"}
          </button>
        )}
      </div>
    </form>
  );
}

export function SopEditor({
  initialVersion,
  canEdit,
}: {
  initialVersion: SopVersion;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [version, setVersion] = useState(initialVersion);
  const [definition, setDefinition] = useState(
    JSON.stringify(initialVersion.definition, null, 2)
  );
  const [errors, setErrors] = useState<unknown[]>(
    initialVersion.validationErrors ?? []
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<unknown>(null);
  const editable = canEdit && version.status === "draft";
  const preview = objectRecord(version.definition);
  const saveDraft = async () => {
    const parsed: unknown = JSON.parse(definition);
    const saved = await api<SopVersion>(`/sop-versions/${version.id}`, {
      body: JSON.stringify({ definition: parsed }),
      method: "PATCH",
    });
    setVersion(saved);
    setDefinition(JSON.stringify(saved.definition, null, 2));
    setErrors(saved.validationErrors ?? []);
    return saved;
  };
  const action = async (kind: string) => {
    setBusy(kind);
    setError("");
    setMessage("");
    try {
      const saved = await saveDraft();
      if (kind === "save") {
        router.replace(sopVersionPath(saved));
        setMessage(
          "Draft saved. Validate all citations and transitions before publication."
        );
        return;
      }
      if (kind === "publish") {
        const published = await api<SopVersion>(
          `/sop-versions/${saved.id}/publish`,
          { method: "POST" }
        );
        setVersion(published);
        setDefinition(JSON.stringify(published.definition, null, 2));
        setErrors(published.validationErrors ?? []);
        router.replace(sopVersionPath(published));
        setMessage(
          "Published. This version is immutable and available to new runs."
        );
        router.refresh();
        return;
      }
      const result = await api<{
        errors?: unknown[];
        validationErrors?: unknown[];
      }>(`/sop-versions/${saved.id}/validate`, { method: "POST" });
      const validation = result.errors ?? result.validationErrors ?? [];
      setErrors(validation);
      router.replace(sopVersionPath(saved));
      setMessage(
        validation.length
          ? "Review the validation results below."
          : "Schema and business validation passed."
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  };
  const search = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("search");
    setError("");
    try {
      setResults(
        await api(
          `/sop-versions/${version.id}/search?q=${encodeURIComponent(query)}`
        )
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  return (
    <div className="sop-editor">
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Controlled definition</h2>
            <p>
              {editable
                ? "Edit the structured draft, then save and validate."
                : "Published definitions are immutable."}
            </p>
          </div>
          <Status value={version.status} />
        </header>
        <div className="panel-body">
          <SourceDocument source={version.source} />
          <ProcedureRequirements
            prerequisites={preview?.prerequisites}
            scope={preview?.scope}
          />
          <ReferenceMediaCards items={version.media ?? []} />
          {editable ? (
            <SopReferenceUpload
              disabled={
                definition !== JSON.stringify(version.definition, null, 2)
              }
              onAttached={(saved) => {
                setVersion(saved);
                setDefinition(JSON.stringify(saved.definition, null, 2));
                setErrors(saved.validationErrors ?? []);
              }}
              version={version}
            />
          ) : null}
          {version.sourceFilename ? (
            <p className="subtle-note">
              <FileText size={15} />
              {version.sourceFilename}
            </p>
          ) : null}
          {editable ? (
            <>
              <label className="field-label" htmlFor="sop-definition">
                SOP definition (JSON)
              </label>
              <textarea
                className="code-editor"
                id="sop-definition"
                onChange={(event) => setDefinition(event.target.value)}
                rows={26}
                spellCheck={false}
                value={definition}
              />
              <div className="form-actions">
                <button
                  className="button"
                  disabled={!!busy}
                  onClick={() => action("save")}
                  type="button"
                >
                  Save draft
                </button>
                <button
                  className="button"
                  disabled={!!busy}
                  onClick={() => action("validate")}
                  type="button"
                >
                  <CheckCircle2 size={16} />
                  Validate
                </button>
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() => action("publish")}
                  type="button"
                >
                  <ShieldCheck size={16} />
                  Publish version
                </button>
              </div>
            </>
          ) : (
            <div className="definition-steps">
              {(version.definition?.steps ?? version.steps ?? []).map(
                (step, i) => (
                  <section className="sop-step" key={step.id}>
                    <div>
                      <span className="step-index">{i + 1}</span>
                      <h3>{step.title}</h3>
                      <span className="tag">{step.verification.kind}</span>
                    </div>
                    <p>{step.instruction}</p>
                    {step.rationale ? (
                      <div className="rationale">
                        <strong>Why this matters</strong>
                        <p>{step.rationale}</p>
                      </div>
                    ) : null}
                    {step.verification.criteria?.length ? (
                      <ul className="criterion-list">
                        {step.verification.criteria.map((criterion) => (
                          <li key={criterion.id}>
                            <span />
                            <span>{criterion.description}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="subtle-note">
                      <FileText size={13} />
                      {step.sources
                        .map((source) =>
                          [
                            source.heading,
                            source.page ? `p. ${source.page}` : source.section,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        )
                        .join(" / ")}
                    </p>
                  </section>
                )
              )}
            </div>
          )}
          {error ? (
            <div className="notice danger" role="alert">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="notice info" role="status">
              {message}
            </div>
          ) : null}
          {errors.length ? (
            <div className="validation-errors">
              <h3>Validation results</h3>
              <ul>
                {errors.map((item) => (
                  <li key={JSON.stringify(item)}>
                    {typeof item === "string" ? item : JSON.stringify(item)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>
      {version.status === "published" ? (
        <section className="panel">
          <header className="panel-head">
            <div>
              <h2>Test grounded retrieval</h2>
              <p>Search this exact published version.</p>
            </div>
            <Search size={20} />
          </header>
          <form className="search-form" onSubmit={search}>
            <input
              aria-label="Search the SOP"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask about a procedure or source clause…"
              required
              value={query}
            />
            <button className="button primary" disabled={!!busy} type="submit">
              Search
            </button>
          </form>
          {results === null ? null : (
            <div className="panel-body">
              <ToolResults data={results} />
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
