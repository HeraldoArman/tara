import { mock } from "bun:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { User } from "../../apps/web/src/lib/contracts";
import {
  ownerEvaluationFixture,
  ownerSopFixtures,
} from "./owner-dashboard-data";

let role: User["role"] | null = "owner";
let failedPath = "";
const requests: string[] = [];
const webRequire = createRequire(
  new URL("../../apps/web/package.json", import.meta.url)
);
const renderToStaticMarkup: (element: unknown) => string =
  webRequire("react-dom/server").renderToStaticMarkup;

function redirect(path: string): never {
  throw new Error(`redirect:${path}`);
}

mock.module("next/navigation", () => ({
  redirect,
  unstable_rethrow: (cause: unknown) => {
    if (cause instanceof Error && cause.message.startsWith("redirect:")) {
      throw cause;
    }
  },
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));
mock.module("../../apps/web/src/lib/server-api", () => ({
  currentUser: () => {
    if (role === null) {
      redirect("/login");
    }
    return {
      id: "owner",
      name: "Test Owner",
      organizationId: "org",
      role,
      username: "owner",
    };
  },
  serverApi: (path: string) => {
    requests.push(path);
    if (path === failedPath) {
      throw new Error("Test API unavailable");
    }
    if (path === "/evaluation/summary") {
      return ownerEvaluationFixture;
    }
    if (path === "/sops") {
      return {
        items: ownerSopFixtures.map((sop) => ({
          ...sop,
          versions: [{ status: "published" }],
        })),
      };
    }
    return { items: [] };
  },
}));

const { default: DashboardPage } = await import(
  "../../apps/web/src/app/dashboard/page"
);

for (const [nextRole, destination] of [
  [null, "/login"],
  ["technician", "/"],
  ["supervisor", "/"],
  ["sop_manager", "/sops"],
] as const) {
  role = nextRole;
  requests.length = 0;
  // biome-ignore lint/performance/noAwaitInLoops: Each guard check changes the shared authenticated role.
  await assert.rejects(DashboardPage(), { message: `redirect:${destination}` });
  assert.equal(
    requests.length,
    0,
    "Unauthorized roles must not fetch management data"
  );
}

role = "owner";
const html = renderToStaticMarkup(await DashboardPage());
assert.deepEqual(requests.sort(), [
  "/evaluation/summary",
  "/reports",
  "/sops",
  "/work-orders",
]);
assert.ok(html.includes("87.5%"));
assert.ok(html.includes("Maya Putri"));
assert.ok(html.includes("Assistant alerts"));
assert.ok(html.includes('href="/work-orders/new"'));
assert.ok(html.includes('href="/sops"'));
assert.ok(!html.includes("Demo data"));
assert.ok(!html.includes("state triggers"));

failedPath = "/work-orders";
const partial = renderToStaticMarkup(await DashboardPage());
assert.ok(partial.includes("Work queue unavailable"));
assert.ok(
  partial.includes("87.5%"),
  "A queue failure must preserve available analytics"
);
process.stdout.write("Owner dashboard route checks passed\n");
