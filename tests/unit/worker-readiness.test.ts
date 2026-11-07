import { describe, expect, test } from "bun:test";
import type { Run } from "../../apps/web/src/lib/contracts";
import { recoverWorkerContext } from "../../apps/web/src/lib/worker-readiness";

const snapshot = {
  id: "resumed-run",
  steps: [],
  version: 27,
} as unknown as Run;

describe("worker readiness across the LiveKit payload limit", () => {
  test("recovers a ready oversized run through the authenticated REST snapshot", async () => {
    let reads = 0;
    const result = await recoverWorkerContext(
      { refreshRequired: true, reportId: null, version: 27 },
      () => {
        reads += 1;
        return Promise.resolve(snapshot);
      }
    );
    expect(result).toBe(snapshot);
    expect(reads).toBe(1);
  });

  test("a starting worker cannot become ready through a refresh marker", async () => {
    let reads = 0;
    const result = await recoverWorkerContext(
      { error: { code: "AGENT_STARTING" }, refreshRequired: true },
      () => {
        reads += 1;
        return Promise.resolve(snapshot);
      }
    );
    expect(result).toBeNull();
    expect(reads).toBe(0);
  });

  test("a complete context uses the RPC snapshot without an extra read", async () => {
    const result = await recoverWorkerContext(snapshot, () =>
      Promise.reject(new Error("Unexpected REST request"))
    );
    expect(result).toBe(snapshot);
  });
});
