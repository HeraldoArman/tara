import { afterEach, beforeEach, expect, mock, test } from "bun:test";

let sessionCookie: string | undefined;
const redirectTo = mock((path: string): never => {
  throw new Error(`redirect:${path}`);
});

mock.module("server-only", () => ({}));
mock.module("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "tara_session" && sessionCookie !== undefined
        ? { name, value: sessionCookie }
        : undefined,
    toString: () =>
      sessionCookie === undefined ? "" : `tara_session=${sessionCookie}`,
  }),
}));
mock.module("next/navigation", () => ({ redirect: redirectTo }));
mock.module("../../apps/web/src/env.ts", () => ({
  ENV: { API_INTERNAL_URL: "http://api.internal:8000" },
}));

const { currentUser, optionalCurrentUser } = await import(
  "../../apps/web/src/lib/server-api"
);
const originalFetch = globalThis.fetch;

beforeEach(() => {
  sessionCookie = undefined;
  redirectTo.mockClear();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("public entry without a session never needs the backend", async () => {
  const backend = mock(() => Promise.reject(new Error("API unavailable")));
  globalThis.fetch = backend as typeof fetch;

  expect(await optionalCurrentUser()).toBeNull();
  sessionCookie = "";
  expect(await optionalCurrentUser()).toBeNull();
  expect(backend).not.toHaveBeenCalled();
  expect(redirectTo).not.toHaveBeenCalled();
});

test("public entry treats a rejected session as a guest without redirecting", async () => {
  sessionCookie = "expired-session";
  globalThis.fetch = mock(() =>
    Promise.resolve(
      Response.json(
        { error: { code: "UNAUTHORIZED", message: "Sign in to continue." } },
        { status: 401 }
      )
    )
  ) as typeof fetch;

  expect(await optionalCurrentUser()).toBeNull();
  expect(redirectTo).not.toHaveBeenCalled();
});

test("public entry validates a session before returning its user", async () => {
  sessionCookie = "valid-session";
  const user = {
    id: "technician-id",
    name: "Test Technician",
    organizationId: "organization-id",
    role: "technician",
    username: "technician",
  };
  let destination = "";
  let forwarded: RequestInit | undefined;
  globalThis.fetch = mock((url, init) => {
    destination = String(url);
    forwarded = init;
    return Promise.resolve(Response.json(user));
  }) as typeof fetch;

  expect(await optionalCurrentUser()).toEqual(user);
  expect(destination).toBe("http://api.internal:8000/api/v1/auth/me");
  expect(new Headers(forwarded?.headers).get("Cookie")).toBe(
    "tara_session=valid-session"
  );
  expect(forwarded?.cache).toBe("no-store");
  expect(redirectTo).not.toHaveBeenCalled();
});

test("protected pages retain their sign-in redirect for rejected sessions", async () => {
  globalThis.fetch = mock(() =>
    Promise.resolve(Response.json({}, { status: 401 }))
  ) as typeof fetch;

  await expect(currentUser()).rejects.toThrow("redirect:/login");
  expect(redirectTo).toHaveBeenCalledWith("/login");
});

for (const status of [403, 503]) {
  test(`public entry does not hide a backend ${status} as a guest session`, async () => {
    sessionCookie = "existing-session";
    globalThis.fetch = mock(() =>
      Promise.resolve(
        Response.json(
          { error: { message: "The request cannot be completed." } },
          { status }
        )
      )
    ) as typeof fetch;

    await expect(optionalCurrentUser()).rejects.toMatchObject({ status });
    expect(redirectTo).not.toHaveBeenCalled();
  });
}

test("public entry preserves a connection error for a session that needs validation", async () => {
  sessionCookie = "existing-session";
  globalThis.fetch = mock(() =>
    Promise.reject(new Error("Connection refused"))
  ) as typeof fetch;

  await expect(optionalCurrentUser()).rejects.toMatchObject({
    code: "PROVIDER_UNAVAILABLE",
    status: 503,
  });
  expect(redirectTo).not.toHaveBeenCalled();
});
