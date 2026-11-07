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

import { createPreviewAnalysis } from "./preview-analysis";
import { readDocument, validateDocument } from "./read-document";
import type { SopAnalysis } from "./types";

interface UploadDialogProps {
  onAnalyze: (analysis: SopAnalysis) => void;
  onClose: () => void;
}

export function UploadDialog({ onClose, onAnalyze }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
    },
    [busy]
  );

  const analyze = useCallback(async () => {
    if (!file || busy) {
      return;
    }
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError(null);
    try {
      const document = await readDocument(file, request.signal);
      if (!request.signal.aborted) {
        onAnalyze(createPreviewAnalysis(document));
      }
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(
          cause instanceof Error
            ? cause.message
            : "This document could not be read. Try another PDF, DOCX, or text file."
        );
      }
    } finally {
      if (!request.signal.aborted) {
        setBusy(false);
      }
    }
  }, [file, busy, onAnalyze]);
  const changeOpen = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
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
    dropzone.current?.focus();
  }, []);

  return (
    <Dialog defaultOpen onOpenChange={changeOpen}>
      <DialogContent className="tara-assistant sop-dialog">
        <DialogHeader>
          <span className="sop-dialog-icon">
            <Upload aria-hidden="true" />
          </span>
          <DialogTitle>Give your SOP a closer look.</DialogTitle>
          <DialogDescription>
            Upload a document to explore its steps and opportunities for AI
            assistance.
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
          <span>Text-based PDFs, up to 50 pages</span>
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
            <AlertTitle>We couldn’t read this document</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <p className="sop-upload-privacy">
          <LockKeyhole aria-hidden="true" /> Your document stays in this
          browser. Suggestions use local preview rules and need human review.
        </p>
        <div aria-live="polite" className="sop-upload-status" role="status">
          {busy
            ? "Reading the document and preparing source-linked suggestions…"
            : ""}
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            {busy ? "Cancel analysis" : "Cancel"}
          </Button>
          <Button disabled={!file || busy} onClick={analyze}>
            {busy ? (
              <LoaderCircle className="sop-spinner" data-icon="inline-start" />
            ) : (
              <Sparkles data-icon="inline-start" />
            )}
            {busy ? "Reading document…" : "Analyze document"}
            {busy ? null : <ArrowRight data-icon="inline-end" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
