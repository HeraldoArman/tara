import { expect, type Page, test } from "@playwright/test";

test.setTimeout(60_000);

const password = process.env.TARA_E2E_PASSWORD ?? process.env.DEMO_PASSWORD;
if (!password) {
  throw new Error(
    "Set TARA_E2E_PASSWORD to the password used by the isolated demonstration seed."
  );
}
const origin = process.env.TARA_E2E_ORIGIN ?? "http://localhost:3001";
const isoTime = "2026-11-07T04:00:00Z";
const fixtureTechnician = /Fixture Technician/;
const noAttemptsTechnician = /No Attempts Technician/;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password as string);
  await page.getByRole("button", { exact: true, name: "Sign in" }).click();
  await expect(page).toHaveURL(
    (url) => url.origin === origin && url.pathname !== "/login"
  );
}

test("saved source survives repeated decomposition errors and retry does not upload it again", async ({
  page,
}) => {
  await login(page, "sop_manager");
  const library = await page.request.get("/api/v1/sops");
  expect(library.ok()).toBe(true);
  const [procedure] = (await library.json()).items;
  const [existingVersion] = procedure.versions;
  let uploads = 0;
  let retries = 0;
  await page.route(
    (url) => url.pathname === "/api/v1/sops/imports",
    async (route) => {
      uploads += 1;
      await route.fulfill({
        json: {
          error: {
            code: "PROVIDER_UNAVAILABLE",
            details: { documentId: "retained-browser-source" },
            message: "Draft decomposition timed out in this browser fixture.",
            requestId: "browser-import-request",
          },
        },
        status: 503,
      });
    }
  );
  await page.route(
    (url) =>
      url.pathname === "/api/v1/sops/imports/retained-browser-source/retry",
    async (route) => {
      retries += 1;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postData()).toBeNull();
      if (retries === 1) {
        await route.fulfill({
          json: {
            error: {
              code: "TIMEOUT",
              details: {},
              message: "The retry timed out. Your source remains saved.",
            },
          },
          status: 503,
        });
        return;
      }
      await route.fulfill({ json: existingVersion, status: 200 });
    }
  );
  await page.goto("/sops/import");
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(
      "# Approved test source\nConfirm device identity before service."
    ),
    mimeType: "text/markdown",
    name: "browser-source.md",
  });
  await page
    .getByRole("button", { exact: true, name: "Generate SOP draft" })
    .click();
  await expect(
    page.getByText(
      "Your source is saved. Retry draft generation without uploading the document again."
    )
  ).toBeVisible();
  const retry = page.getByRole("button", {
    exact: true,
    name: "Retry draft generation",
  });
  await retry.click();
  await expect(page.locator('.notice[role="alert"]')).toContainText(
    "The retry timed out"
  );
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname ===
      `/sops/${existingVersion.sopId}/versions/${existingVersion.versionNumber}`
  );
  expect(uploads).toBe(1);
  expect(retries).toBe(2);
});

test("activity loads beyond the first page, retains earlier records offline and reaches both history streams", async ({
  page,
}) => {
  await login(page, "technician");
  const queue = await page.request.get("/api/v1/work-orders");
  const work = (await queue.json()).items.find(
    (item: { reference: string }) => item.reference === "WO-1042"
  );
  const started = await page.request.post(
    `/api/v1/work-orders/${work.id}/runs`,
    { headers: { Origin: origin } }
  );
  expect(started.ok()).toBe(true);
  const run = await started.json();
  const offsets: number[] = [];
  let laterAttempts = 0;
  const event = (index: number) => ({
    id: `audit-${index}`,
    message: `Browser audit record ${String(index).padStart(3, "0")}`,
    occurredAt: isoTime,
    type: "fixture.event",
  });
  const tool = (index: number) => ({
    arguments: { expectedStepId: "fixture-step" },
    createdAt: isoTime,
    durationMs: 25,
    id: `tool-${index}`,
    name: `fixture-check-${String(index).padStart(3, "0")}`,
    result: { runVersion: 2, status: index === 100 ? "failed" : "completed" },
    status: index === 100 ? "failed" : "completed",
  });
  await page.route(
    (url) => url.pathname === `/api/v1/runs/${run.id}/activity`,
    async (route) => {
      const offset = Number(
        new URL(route.request().url()).searchParams.get("offset")
      );
      offsets.push(offset);
      if (offset === 100) {
        laterAttempts += 1;
        if (laterAttempts === 1) {
          await route.abort("internetdisconnected");
          return;
        }
      }
      await route.fulfill({
        json: {
          hasMore: offset === 0,
          items:
            offset === 0
              ? Array.from({ length: 100 }, (_, i) => event(i))
              : [event(99), event(100)],
          limit: 100,
          nextOffset: offset === 0 ? 100 : null,
          offset,
          toolCalls:
            offset === 0
              ? Array.from({ length: 100 }, (_, i) => tool(i))
              : [tool(99), tool(100)],
        },
        status: 200,
      });
    }
  );
  await page.goto(`/runs/${run.id}`);
  await page.getByText("Step checks & prerequisites", { exact: true }).click();
  await expect(page.getByText("ESD-safe bench", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { exact: false, name: "Session record" })
    .click();
  const drawer = page.getByRole("dialog", { name: "Session record" });
  await expect(drawer.getByRole("article")).toHaveCount(100);
  await drawer
    .getByRole("button", { exact: true, name: "Load more history" })
    .click();
  await expect(drawer.getByRole("alert")).toContainText(
    "server is unreachable"
  );
  await expect(drawer.getByRole("article")).toHaveCount(100);
  await drawer
    .getByRole("button", { exact: true, name: "Retry loading history" })
    .click();
  await expect(
    drawer.getByText("Browser audit record 100", { exact: true })
  ).toBeVisible();
  await expect(
    drawer.getByRole("heading", { exact: true, name: "fixture check 100" })
  ).toBeVisible();
  await expect(drawer.getByRole("article")).toHaveCount(101);
  await expect(drawer.getByRole("listitem")).toHaveCount(101);
  await expect(drawer.getByRole("status")).toHaveText(
    "All session history is loaded."
  );
  await expect(
    drawer.getByRole("button", { exact: true, name: "Load more history" })
  ).toHaveCount(0);
  expect(offsets.filter((offset) => offset === 0).length).toBeGreaterThan(0);
  expect(offsets.filter((offset) => offset > 0)).toEqual([100, 100]);
});

test("technician outcomes show all aggregate measures and undefined first-pass rates stay unknown", async ({
  page,
}) => {
  await login(page, "owner");
  await page.goto("/evaluation");
  await page.route(
    (url) => url.pathname === "/api/v1/evaluation/summary",
    async (route) => {
      await route.fulfill({
        json: {
          active: 1,
          completed: 2,
          criterionFailures: [],
          evidenceCoverage: 0.5,
          firstPassRate: 0.75,
          latency: [],
          partial: 1,
          runs: 4,
          stepMetrics: [],
          technicianMetrics: [
            {
              active: 1,
              activeSeconds: 125,
              attemptedSteps: 6,
              attempts: 8,
              completed: 2,
              firstPassRate: 0.75,
              partial: 1,
              retakes: 2,
              runs: 4,
              technicianId: "fixture-technician",
              technicianName: "Fixture Technician",
            },
            {
              active: 1,
              activeSeconds: 0,
              attemptedSteps: 0,
              attempts: 0,
              completed: 0,
              firstPassRate: null,
              partial: 0,
              retakes: 0,
              runs: 1,
              technicianId: "no-attempts",
              technicianName: "No Attempts Technician",
            },
          ],
        },
        status: 200,
      });
    }
  );
  await page
    .getByRole("button", { exact: true, name: "Apply filters" })
    .click();
  const table = page.getByRole("table", {
    exact: true,
    name: "Technician outcomes",
  });
  await expect(table.getByRole("columnheader")).toHaveCount(10);
  const row = table.getByRole("row", { name: fixtureTechnician });
  await expect(row.getByRole("cell")).toHaveCount(10);
  await expect(
    row.getByRole("cell", { exact: true, name: "75.0%" })
  ).toBeVisible();
  await expect(
    row.getByRole("cell", { exact: true, name: "02:05" })
  ).toBeVisible();
  await expect(
    table.getByRole("columnheader", { exact: true, name: "Retakes" })
  ).toBeVisible();
  await expect(
    table
      .getByRole("row", { name: noAttemptsTechnician })
      .getByRole("cell")
      .nth(7)
  ).toHaveText("—");
});
