import { afterEach, expect, mock, test } from "bun:test";

const configuration = {
  ADDITIONAL_APP_ORIGINS: "",
  API_INTERNAL_URL: "http://api.internal:8000",
  APP_ORIGIN: "http://localhost:3001",
};
mock.module("../../apps/web/src/env.ts", () => ({ ENV: configuration }));

const { GET, POST } = await import(
  "../../apps/web/src/app/api/v1/[...path]/route"
);
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  configuration.APP_ORIGIN = "http://localhost:3001";
  configuration.ADDITIONAL_APP_ORIGINS = "";
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

for (const origin of [
  "https://tara.heraldoarman.com",
  "https://web-production-4f08e.up.railway.app",
]) {
  test(`trusted app origin ${origin} preserves cookie login and mutation headers`, async () => {
    configuration.APP_ORIGIN = "HTTPS://TARA.HERALDOARMAN.COM:443/";
    configuration.ADDITIONAL_APP_ORIGINS =
      " https://web-production-4f08e.up.railway.app/ ,";
    let forwarded: RequestInit | undefined;
    globalThis.fetch = mock((_url, init) => {
      forwarded = init;
      return Promise.resolve(
        Response.json(
          { role: "technician" },
          {
            headers: {
              "set-cookie":
                "tara_session=test-token; HttpOnly; Secure; SameSite=Lax",
            },
          }
        )
      );
    }) as typeof fetch;
    const result = await POST(
      new Request(`${origin}/api/v1/auth/login`, {
        body: JSON.stringify({
          password: "fixture-only",
          username: "technician",
        }),
        headers: {
          "content-type": "application/json",
          cookie: "tara_session=existing",
          origin,
          "sec-fetch-site": "same-origin",
        },
        method: "POST",
      }),
      { params: Promise.resolve({ path: ["auth", "login"] }) }
    );
    expect(result.status).toBe(200);
    expect(new Headers(forwarded?.headers).get("origin")).toBe(origin);
    expect(new Headers(forwarded?.headers).get("cookie")).toBe(
      "tara_session=existing"
    );
    expect(result.headers.get("set-cookie")).toContain(
      "HttpOnly; Secure; SameSite=Lax"
    );
  });
}

test("allowlisted alternates do not weaken origin or cross-site mutation rejection", async () => {
  configuration.APP_ORIGIN = "https://tara.heraldoarman.com";
  configuration.ADDITIONAL_APP_ORIGINS =
    "https://web-production-4f08e.up.railway.app";
  const upstream = mock(() => Promise.resolve(Response.json({})));
  globalThis.fetch = upstream as typeof fetch;
  const origins = [
    "https://tara.heraldoarman.com.evil.example",
    "https://unknown.example",
    "http://tara.heraldoarman.com",
    "https://tara.heraldoarman.com:444",
    "null",
    "",
  ];
  const results = await Promise.all(
    origins.map((origin) =>
      POST(
        new Request("https://tara.heraldoarman.com/api/v1/auth/logout", {
          headers: {
            cookie: "tara_session=test-token",
            ...(origin.length > 0 ? { origin } : {}),
          },
          method: "POST",
        }),
        { params: Promise.resolve({ path: ["auth", "logout"] }) }
      )
    )
  );
  for (const result of results) {
    expect(result.status).toBe(403);
  }
  const crossSite = await POST(
    new Request("https://tara.heraldoarman.com/api/v1/auth/logout", {
      headers: {
        cookie: "tara_session=test-token",
        origin: "https://tara.heraldoarman.com",
        "sec-fetch-site": "cross-site",
      },
      method: "POST",
    }),
    { params: Promise.resolve({ path: ["auth", "logout"] }) }
  );
  expect(crossSite.status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});
