import { afterEach, expect, mock, test } from "bun:test";

mock.module("../../apps/web/src/env.ts", () => ({
  ENV: {
    API_INTERNAL_URL: "http://api.internal:8000",
    APP_ORIGIN: "http://localhost:3001",
  },
}));

const { GET, POST } = await import(
  "../../apps/web/src/app/api/v1/[...path]/route"
);
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("same-origin proxy forwards auth cookie and query only to the private API", async () => {
  let destination = "";
  let forwarded: RequestInit | undefined;
  globalThis.fetch = mock((url, init) => {
    destination = String(url);
    forwarded = init;
    return Promise.resolve(
      Response.json(
        { items: [] },
        { headers: { "set-cookie": "tara_session=token; HttpOnly" } }
      )
    );
  }) as typeof fetch;
  const result = await GET(
    new Request("http://localhost:3001/api/v1/work-orders?filter=priority", {
      headers: { authorization: "not-forwarded", cookie: "tara_session=token" },
    }),
    { params: Promise.resolve({ path: ["work-orders"] }) }
  );
  expect(destination).toBe(
    "http://api.internal:8000/api/v1/work-orders?filter=priority"
  );
  expect(new Headers(forwarded?.headers).get("cookie")).toBe(
    "tara_session=token"
  );
  expect(new Headers(forwarded?.headers).has("authorization")).toBe(false);
  expect(result.headers.get("cache-control")).toContain("no-store");
  expect(result.headers.get("set-cookie")).toContain("HttpOnly");
});

test("cross-origin cookie mutations never reach the backend", async () => {
  const upstream = mock(() => Promise.resolve(Response.json({})));
  globalThis.fetch = upstream as typeof fetch;
  const result = await POST(
    new Request("http://localhost:3001/api/v1/auth/logout", {
      headers: {
        cookie: "tara_session=token",
        origin: "https://other.example",
      },
      method: "POST",
    }),
    { params: Promise.resolve({ path: ["auth", "logout"] }) }
  );
  expect(result.status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

test("bounded upload rejects oversized body before forwarding", async () => {
  const upstream = mock(() => Promise.resolve(Response.json({})));
  globalThis.fetch = upstream as typeof fetch;
  const result = await POST(
    new Request("http://localhost:3001/api/v1/sops/imports", {
      body: new Uint8Array(12 * 1024 * 1024 + 1),
      headers: { origin: "http://localhost:3001" },
      method: "POST",
    }),
    { params: Promise.resolve({ path: ["sops", "imports"] }) }
  );
  expect(result.status).toBe(413);
  expect(upstream).not.toHaveBeenCalled();
});

test("private API failure returns a safe recoverable error", async () => {
  globalThis.fetch = mock(() =>
    Promise.reject(new Error("private-secret-host"))
  ) as typeof fetch;
  const result = await GET(
    new Request("http://localhost:3001/api/v1/auth/me"),
    {
      params: Promise.resolve({ path: ["auth", "me"] }),
    }
  );
  const body = await result.json();
  expect(result.status).toBe(503);
  expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
  expect(JSON.stringify(body)).not.toContain("private-secret-host");
});
