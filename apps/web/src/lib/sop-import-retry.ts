const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function retainedSopDocumentId(value: unknown): string | null {
  return typeof value === "string" && DOCUMENT_ID.test(value) ? value : null;
}
