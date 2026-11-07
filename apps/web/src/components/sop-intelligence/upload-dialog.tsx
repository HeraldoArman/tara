import { Alert, AlertDescription, AlertTitle } from "@tara/ui/components/alert";
import { Button } from "@tara/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tara/ui/components/dialog";
import {
  AlertCircle,
  ArrowRight,
  FileText,
  LoaderCircle,
  LockKeyhole,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ApiError, api, errorMessage } from "@/lib/api";
import type { SopVersion } from "@/lib/contracts";
import { validateDocument } from "./read-document";

interface UploadDialogProps {
  onClose: () => void;
  onImported: (version: SopVersion) => void;
}

async function importSource(
  file: File | null,
  documentId: string | null,
  signal: AbortSignal
): Promise<SopVersion> {
  if (documentId) {
    return await api<SopVersion>(
      `/sops/imports/${encodeURIComponent(documentId)}/retry`,
      { method: "POST", signal }
    );
  }
  const body = new FormData();
  if (file) {
    body.append("file", file, file.name);
  }
  return await api<SopVersion>("/sops/imports", {
    body,
    method: "POST",
    signal,
  });
}

export function UploadDialog({ onClose, onImported }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const dropzone = useRef<HTMLButtonElement>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const selectFiles = useCallback(
    (files: FileList | null) => {
      if (busy || !files?.length) {
        return;
      }
      if (files.length > 1) {
        setError(
          "Upload one SOP at a time so each map stays linked to its source."
        );
        return;
      }
      const selected = files.item(0);
      if (!selected) {
        return;
      }
      const message = validateDocument(selected);
      setError(message);
      setFile(message ? null : selected);
      setDocumentId(null);
    },
    [busy]
  );

  const analyze = useCallback(async () => {
    if (!(file || documentId) || busy) {
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError(null);
    try {
      const version = await importSource(file, documentId, request.signal);
      if (!request.signal.aborted) {
        onImported(version);
      }
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(errorMessage(cause));
        if (
          cause instanceof ApiError &&
          typeof cause.details.documentId === "string"
        ) {
          setDocumentId(cause.details.documentId);
        }
      }
    } finally {
      if (!request.signal.aborted) {
        setBusy(false);
      }
    }
  }, [file, documentId, busy, onImported]);
  const changeOpen = useCallback(
    (open: boolean) => {
      if (!(open || busy)) {
        onClose();
      }
    },
    [busy, onClose]
  );
  const leaveDropzone = useCallback(() => setDragging(false), []);
  const dragOver = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      if (!busy) {
        setDragging(true);
      }
    },
    [busy]
  );
  const dropFile = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      event.preventDefault();
      setDragging(false);
      selectFiles(event.dataTransfer.files);
    },
    [selectFiles]
  );
  const changeFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      selectFiles(event.currentTarget.files);
      event.currentTarget.value = "";
    },
    [selectFiles]
  );
  const openFilePicker = useCallback(() => input.current?.click(), []);
  const removeFile = useCallback(() => {
    setFile(null);
    setError(null);
    setDocumentId(null);
    dropzone.current?.focus();
  }, []);

  let submitLabel = documentId
    ? "Retry draft generation"
    : "Generate SOP draft";
  if (busy) {
    submitLabel = "Creating draft…";
  }
  return (
    <Dialog onOpenChange={changeOpen} open>
      <DialogContent className="tara-assistant sop-dialog">
        <DialogHeader>
          <span className="sop-dialog-icon">
            <Upload aria-hidden="true" />
          </span>
          <DialogTitle>Give your SOP a closer look.</DialogTitle>
          <DialogDescription>
            Save your source and generate a reviewable SOP draft on the
            application server.
          </DialogDescription>
        </DialogHeader>

        <input
          accept=".pdf,.docx,.txt,.md"
          aria-label="Upload SOP document"
          disabled={busy}
          hidden
          id="sop-file"
          onChange={changeFile}
          ref={input}
          type="file"
        />
        <button
          aria-describedby="upload-formats"
          className="sop-dropzone"
          data-busy={busy}
          data-dragging={dragging}
          disabled={busy}
          onClick={openFilePicker}
          onDragLeave={leaveDropzone}
          onDragOver={dragOver}
          onDrop={dropFile}
          ref={dropzone}
          type="button"
        >
          <span className="sop-dropzone-icon">
            <FileText aria-hidden="true" />
          </span>
          <strong>
            {dragging ? "Drop your SOP here" : "Drop your SOP here, or browse"}
          </strong>
          <span id="upload-formats">
            PDF, DOCX, TXT, or Markdown · up to 10 MB
          </span>
          <span>Text-based PDFs, up to 250 pages · no scanned documents</span>
        </button>

        {file ? (
          <div className="sop-upload-file">
            <FileText aria-hidden="true" />
            <div>
              <strong>{file.name}</strong>
              <span>
                {Math.max(1, Math.ceil(file.size / 1024))} KB · Ready to read
              </span>
            </div>
            <Button
              aria-label="Remove selected document"
              disabled={busy}
              onClick={removeFile}
              size="icon-sm"
              variant="ghost"
            >
              <X />
            </Button>
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>We couldn’t prepare this procedure</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {documentId ? (
          <p className="sop-upload-privacy" role="status">
            Your original source is saved. Retry draft generation without
            uploading it again.
          </p>
        ) : null}

        <p className="sop-upload-privacy">
          <LockKeyhole aria-hidden="true" /> Your source is uploaded to your
          organization’s private storage. AI-generated drafts require review
          before publication.
        </p>
        <div aria-live="polite" className="sop-upload-status" role="status">
          {busy
            ? "Saving the source and preparing a reviewable SOP draft…"
            : ""}
        </div>
        <DialogFooter>
          <Button disabled={busy} onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={!(file || documentId) || busy} onClick={analyze}>
            {busy ? (
              <LoaderCircle className="sop-spinner" data-icon="inline-start" />
            ) : (
              <Sparkles data-icon="inline-start" />
            )}
            {submitLabel}
            {busy ? null : <ArrowRight data-icon="inline-end" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
