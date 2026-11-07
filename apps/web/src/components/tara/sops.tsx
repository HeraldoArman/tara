"use client";

import "./sops.css";

import { Alert, AlertDescription } from "@tara/ui/components/alert";
import { Badge } from "@tara/ui/components/badge";
import { Button } from "@tara/ui/components/button";
import { Input } from "@tara/ui/components/input";
import { Textarea } from "@tara/ui/components/textarea";
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
import { useEffect, useState } from "react";
import { ApiError, api, errorMessage, humanize } from "@/lib/api";
import type { SopVersion } from "@/lib/contracts";
import { objectRecord } from "@/lib/draft-preview";
import { retainedSopDocumentId } from "@/lib/sop-import-retry";
import { sopVersionPath } from "@/lib/sop-version-route";
import { ProcedureRequirements } from "./procedure-requirements";
import { ReferenceMediaCards, SopReferenceUpload } from "./reference-media";
import { SourceDocument, ToolResults } from "./tool-results";
import { Status } from "./ui";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const SOURCE_EXTENSION = /\.(md|txt|docx|pdf)$/i;

function sourceFileError(file: File): string {
  if (!SOURCE_EXTENSION.test(file.name)) {
    return "Choose a Markdown (.md), TXT, DOCX or text-based PDF document.";
  }
  if (file.size === 0 || file.size > MAX_SOURCE_BYTES) {
    return "Choose a nonempty document no larger than 10 MB.";
  }
  return "";
}

export function SopImport({
  initialDocumentId = null,
}: {
  initialDocumentId?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "upload" | "retry">("");
  const [filename, setFilename] = useState("");
  const [documentId, setDocumentId] = useState(initialDocumentId);
  useEffect(() => {
    setDocumentId(initialDocumentId);
    if (initialDocumentId) {
      setFilename("");
    }
  }, [initialDocumentId]);
  const retainDocument = (id: string | null) => {
    setDocumentId(id);
    router.replace(
      id ? `/sops/import?documentId=${encodeURIComponent(id)}` : "/sops/import",
      { scroll: false }
    );
  };
  const showFailure = (cause: unknown, fallbackId: string | null = null) => {
    setError(errorMessage(cause));
    const retainedId =
      cause instanceof ApiError ? cause.details.documentId : null;
    retainDocument(retainedSopDocumentId(retainedId) ?? fallbackId);
  };
  const openDraft = (result: SopVersion) => {
    router.push(sopVersionPath(result));
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || documentId) {
      return;
    }
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (!(file instanceof File)) {
      setError("Choose a source document first.");
      return;
    }
    const invalid = sourceFileError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy("upload");
    setError("");
    try {
      openDraft(
        await api<SopVersion>("/sops/imports", {
          body: data,
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
    if (!documentId || busy) {
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
    <form aria-busy={!!busy} className="import-form panel" onSubmit={submit}>
      <label className="upload-zone" htmlFor="source-file">
        <span className="upload-icon">
          <Upload aria-hidden="true" size={30} />
        </span>
        <h2>
          {filename ||
            (documentId
              ? "Your source is saved."
              : "Start with your approved source.")}
        </h2>
        <p id="source-file-help">
          Choose a Markdown, TXT, DOCX or text-based PDF document, up to 10 MB.
        </p>
        <span className="button">
          Choose document
          <ArrowRight aria-hidden="true" size={15} />
        </span>
        <input
          accept=".md,.txt,.docx,.pdf,text/plain,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          aria-describedby="source-file-help"
          aria-label="Source document"
          disabled={!!busy}
          id="source-file"
          name="file"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            const invalid = file ? sourceFileError(file) : "";
            setFilename(invalid ? "" : (file?.name ?? ""));
            setError(invalid);
            if (invalid) {
              event.currentTarget.value = "";
            } else if (file && documentId) {
              retainDocument(null);
            }
          }}
          required
          type="file"
        />
      </label>
      <div className="import-details">
        <h3>
          <ShieldCheck aria-hidden="true" size={17} />A draft first. Always.
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
        <ol aria-label="Publishing workflow" className="sop-import-workflow">
          <li>
            <span>01</span>Import your source
          </li>
          <li>
            <span>02</span>Review and validate
          </li>
          <li>
            <span>03</span>Publish for your team
          </li>
        </ol>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {documentId ? (
          <div className="retained-source">
            <p role="status">
              Your source is saved. Retry draft generation without uploading the
              document again.
            </p>
            <Button disabled={!!busy} onClick={retry} type="button">
              {busy === "retry" ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="spin"
                  data-icon="inline-start"
                />
              ) : (
                <BookOpen aria-hidden="true" data-icon="inline-start" />
              )}{" "}
              {busy === "retry"
                ? "Retrying draft generation…"
                : "Retry draft generation"}
            </Button>
            <p className="subtle-note">
              Choose a different document to start another import.
            </p>
          </div>
        ) : (
          <Button disabled={!!busy || !filename} type="submit">
            {busy ? (
              <LoaderCircle
                aria-hidden="true"
                className="spin"
                data-icon="inline-start"
              />
            ) : (
              <BookOpen aria-hidden="true" data-icon="inline-start" />
            )}{" "}
            {busy ? "Extracting and creating draft…" : "Generate SOP draft"}
          </Button>
        )}
      </div>
    </form>
  );
}

function DraftActions({
  busy,
  pending,
  onAction,
}: {
  busy: string;
  pending: boolean;
  onAction: (kind: string) => Promise<void>;
}) {
  return (
    <div className="form-actions">
      <Button
        disabled={pending}
        onClick={() => onAction("save")}
        type="button"
        variant="outline"
      >
        {busy === "save" ? "Saving draft…" : "Save draft"}
      </Button>
      <Button
        disabled={pending}
        onClick={() => onAction("validate")}
        type="button"
        variant="outline"
      >
        <CheckCircle2 aria-hidden="true" data-icon="inline-start" />
        {busy === "validate" ? "Validating…" : "Validate"}
      </Button>
      <Button
        disabled={pending}
        onClick={() => onAction("publish")}
        type="button"
      >
        <ShieldCheck aria-hidden="true" data-icon="inline-start" />
        {busy === "publish" ? "Publishing…" : "Publish version"}
      </Button>
    </div>
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
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<unknown>(null);
  const editable = canEdit && version.status === "draft";
  const pending = !!busy || referenceBusy;
  const preview = objectRecord(version.definition);
  const readOnlyDescription =
    version.status === "published"
      ? "Published definitions are immutable."
      : "Review the instructions and sources for this saved draft.";
  const editorDescription = editable
    ? "Edit the structured draft, then save and validate."
    : readOnlyDescription;
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
    if (pending) {
      return;
    }
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
      if (cause instanceof ApiError && Array.isArray(cause.details.errors)) {
        setErrors(cause.details.errors);
      }
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
    <div aria-busy={pending} className="sop-editor">
      <section className="panel">
        <header className="panel-head">
          <div>
            <h2>Controlled definition</h2>
            <p>{editorDescription}</p>
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
                !!busy ||
                definition !== JSON.stringify(version.definition, null, 2)
              }
              onAttached={(saved) => {
                setVersion(saved);
                setDefinition(JSON.stringify(saved.definition, null, 2));
                setErrors(saved.validationErrors ?? []);
              }}
              onBusyChange={setReferenceBusy}
              version={version}
            />
          ) : null}
          {version.sourceFilename ? (
            <p className="subtle-note">
              <FileText aria-hidden="true" size={15} />
              {version.sourceFilename}
            </p>
          ) : null}
          {editable ? (
            <>
              <label className="field-label" htmlFor="sop-definition">
                SOP definition (JSON)
              </label>
              <Textarea
                autoComplete="off"
                className="code-editor"
                disabled={pending}
                id="sop-definition"
                name="definition"
                onChange={(event) => setDefinition(event.target.value)}
                rows={26}
                spellCheck={false}
                value={definition}
              />
              <DraftActions busy={busy} onAction={action} pending={pending} />
            </>
          ) : (
            <div className="definition-steps">
              {(version.definition?.steps ?? version.steps ?? []).map(
                (step, i) => (
                  <section className="sop-step" key={step.id}>
                    <div>
                      <span className="step-index">{i + 1}</span>
                      <h3>{step.title}</h3>
                      <Badge variant="secondary">
                        {humanize(step.verification.kind)}
                      </Badge>
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
                      <FileText aria-hidden="true" size={13} />
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
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {message ? (
            <Alert role="status">
              <CheckCircle2 aria-hidden="true" />
              <AlertDescription>{message}</AlertDescription>
            </Alert>
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
              <h2>Find an answer in this SOP</h2>
              <p>Search this exact published version.</p>
            </div>
            <Search aria-hidden="true" size={20} />
          </header>
          <form className="search-form" onSubmit={search}>
            <Input
              aria-label="Search the SOP"
              autoComplete="off"
              name="query"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask about a procedure or source clause…"
              required
              value={query}
            />
            <Button disabled={!!busy} type="submit">
              {busy === "search" ? "Searching…" : "Search"}
            </Button>
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
