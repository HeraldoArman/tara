import type { Run } from "./contracts";

/** A ready worker may return a refresh marker when its snapshot exceeds the RPC limit. */
export async function recoverWorkerContext(
  response: unknown,
  loadSnapshot: () => Promise<Run>
): Promise<Run | null> {
  if (!response || typeof response !== "object") {
    return null;
  }
  const value = response as Record<string, unknown>;
  if (value.error || value.ready === false) {
    return null;
  }
  if (value.refreshRequired === true) {
    return await loadSnapshot();
  }
  if (typeof value.id === "string" && Array.isArray(value.steps)) {
    return value as Run;
  }
  return null;
}
