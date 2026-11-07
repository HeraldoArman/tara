import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  ApiError,
  api,
  apiErrorFromResponse,
} from "../../apps/web/src/lib/api";

afterEach(() => mock.restore());

describe("saved SOP import recovery metadata", () => {
  test("an HTTP failure preserves document and request IDs for retrying the saved source", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: "PROVIDER_UNAVAILABLE",
            details: { documentId: "saved-source" },
            message: "Draft generation timed out.",
            requestId: "import-request",
          },
        },
        { status: 503 }
      )
    );
    let failure: unknown;
    try {
      await api("/sops/imports", { body: new FormData(), method: "POST" });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ApiError);
    if (!(failure instanceof ApiError)) {
      throw new Error("Expected structured API error");
    }
    expect(failure.details.documentId).toBe("saved-source");
    expect(failure.requestId).toBe("import-request");
    expect(failure.code).toBe("PROVIDER_UNAVAILABLE");
    expect(failure.status).toBe(503);
    fetchSpy.mockResolvedValueOnce(Response.json({ id: "draft-version" }));
    await api(`/sops/imports/${String(failure.details.documentId)}/retry`, {
      method: "POST",
    });
    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      "/api/v1/sops/imports/saved-source/retry"
    );
    expect(fetchSpy.mock.calls[1]?.[1]?.body).toBeUndefined();
  });

  test("malformed error payloads keep safe defaults instead of losing recovery state to a parsing error", () => {
    const failure = apiErrorFromResponse(
      { error: { details: ["not-a-record"], message: 42, requestId: [] } },
      502
    );
    expect(failure.message).toBe("The request could not be completed.");
    expect(failure.details).toEqual({});
    expect(failure.requestId).toBeUndefined();
    expect(failure.code).toBe("REQUEST_FAILED");
  });

  test("offline requests retain their cause and remain distinguishable from a provider failure", async () => {
    const cause = new TypeError("Offline test connection");
    spyOn(globalThis, "fetch").mockRejectedValueOnce(cause);
    let failure: unknown;
    try {
      await api("/runs/run-test/activity");
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ApiError);
    if (!(failure instanceof ApiError)) {
      throw new Error("Expected structured API error");
    }
    expect(failure.code).toBe("NETWORK_ERROR");
    expect(failure.cause).toBe(cause);
    expect(failure.details).toEqual({});
  });
});
