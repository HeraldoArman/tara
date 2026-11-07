import { expect, type Page, test } from "@playwright/test";
import type { SopVersion } from "../../apps/web/src/lib/contracts";

const password = process.env.TARA_E2E_PASSWORD ?? process.env.DEMO_PASSWORD;
if (!password) {
  throw new Error(
    "Set TARA_E2E_PASSWORD to the isolated demonstration seed password."
  );
}
const origin = process.env.TARA_E2E_ORIGIN ?? "http://localhost:3001";
const misleadingSessionLink = /Select SOP.*start session/i;
const publishedVersionLink = /Version .*Published/i;
const intelligenceLink = /sop-intelligence\?sopVersionId=/;
const versionPagePath = /^\/sops\/[^/]+\/versions\/\d+$/;
const docxFixture = "tests/fixtures/sop-lifecycle.docx";
const lifecycleSource = [
  "# E2E lifecycle SOP",
  "Confirm the device is disconnected before service.",
  "Record the final inspection and close the procedure.",
].join("\n\n");

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password as string);
  await page.getByRole("button", { exact: true, name: "Sign in" }).click();
  await expect(page).toHaveURL(
    (url) => url.origin === origin && url.pathname !== "/login"
  );
}

function versionPath(version: SopVersion): string {
  return `/sops/${version.sopId}/versions/${version.versionNumber}`;
}

async function importSource(
  page: Page,
  wordDocument = false
): Promise<SopVersion> {
  await page.goto("/sops/import");
  const file = page.locator('input[type="file"]');
  if (wordDocument) {
    await file.setInputFiles(docxFixture);
  } else {
    await file.setInputFiles({
      buffer: Buffer.from(lifecycleSource),
      mimeType: "text/markdown",
      name: "e2e-lifecycle.md",
    });
  }
  const response = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname === "/api/v1/sops/imports" &&
      item.request().method() === "POST"
  );
  await page
    .getByRole("button", { exact: true, name: "Generate SOP draft" })
    .click();
  const imported = await response;
  expect(imported.ok()).toBe(true);
  const draft: SopVersion = await imported.json();
  expect(draft.status).toBe("draft");
  await expect(page).toHaveURL((url) => url.pathname === versionPath(draft));
  return draft;
}

async function publishDraft(page: Page, draft: SopVersion) {
  const response = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname ===
      `/api/v1/sop-versions/${draft.id}/publish`
  );
  await page
    .getByRole("button", { exact: true, name: "Publish version" })
    .click();
  const published = await response;
  expect(published.ok()).toBe(true);
  expect((await published.json()).status).toBe("published");
  await expect(
    page.getByText("Published definitions are immutable.")
  ).toBeVisible();
}

test("SOP import accepts Word documents and blocks invalid files before uploading", async ({
  page,
}) => {
  await login(page, "sop_manager");
  await page.goto("/sops/import");
  const input = page.locator('input[type="file"]');
  expect((await input.getAttribute("accept"))?.split(",")).toContain(".docx");
  let uploads = 0;
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname === "/api/v1/sops/imports" &&
      request.method() === "POST"
    ) {
      uploads += 1;
    }
  });
  await input.setInputFiles({
    buffer: Buffer.from(""),
    mimeType: "text/plain",
    name: "empty.txt",
  });
  await expect(page.locator('.notice[role="alert"]')).toContainText("nonempty");
  await expect(
    page.getByRole("button", { exact: true, name: "Generate SOP draft" })
  ).toBeDisabled();
  await input.setInputFiles({
    buffer: Buffer.from("not a source"),
    mimeType: "text/csv",
    name: "unsupported.csv",
  });
  await expect(page.locator('.notice[role="alert"]')).toContainText("DOCX");
  await input.setInputFiles(docxFixture);
  await expect(
    page.getByRole("button", { exact: true, name: "Generate SOP draft" })
  ).toBeEnabled();
  await expect(page.locator('.notice[role="alert"]')).toHaveCount(0);
  expect(uploads).toBe(0);
});

test("navigation describes SOP review and leaves job creation as the explicit assignment action", async ({
  page,
}) => {
  await login(page, "owner");
  await expect(
    page.getByRole("link", { name: misleadingSessionLink })
  ).toHaveCount(0);
  await page.getByRole("link", { exact: true, name: "SOP library" }).click();
  await page.getByRole("link", { name: publishedVersionLink }).first().click();
  await expect(page).toHaveURL((url) => versionPagePath.test(url.pathname));
  await expect(
    page.getByText("Published definitions are immutable.")
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: misleadingSessionLink })
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { exact: true, name: "Explore this SOP" })
  ).toHaveAttribute("href", intelligenceLink);
  await expect(
    page.getByRole("link", { exact: true, name: "Create job from this SOP" })
  ).toBeVisible();
  await page.context().clearCookies();
  await login(page, "technician");
  await expect(
    page.getByRole("link", { name: misleadingSessionLink })
  ).toHaveCount(0);
});

test("a saved source can be retried after reloading without uploading the file again", async ({
  page,
}) => {
  await login(page, "sop_manager");
  const library = await page.request.get("/api/v1/sops");
  expect(library.ok()).toBe(true);
  const [procedure] = (await library.json()).items;
  const [version] = procedure.versions;
  const retainedId = "e2e-reload-retained-source";
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
            details: { documentId: retainedId },
            message: "Draft provider is unavailable in this browser fixture.",
          },
        },
        status: 503,
      });
    }
  );
  await page.route(
    (url) => url.pathname === `/api/v1/sops/imports/${retainedId}/retry`,
    async (route) => {
      retries += 1;
      expect(route.request().method()).toBe("POST");
      expect(route.request().postData()).toBeNull();
      await route.fulfill({ json: version });
    }
  );
  await page.goto("/sops/import");
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(lifecycleSource),
    mimeType: "text/markdown",
    name: "retained.md",
  });
  await page
    .getByRole("button", { exact: true, name: "Generate SOP draft" })
    .click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("documentId") === retainedId
  );
  await page.reload();
  await expect(
    page.getByRole("button", { exact: true, name: "Retry draft generation" })
  ).toBeEnabled();
  await expect(page.locator('input[type="file"]')).toHaveValue("");
  await page
    .getByRole("button", { exact: true, name: "Retry draft generation" })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === versionPath(version));
  expect(uploads).toBe(1);
  expect(retries).toBe(1);
});

// These tests require the guarded local API in tests/fixtures/sop-lifecycle-server.py.
// Only AI drafting is deterministic; extraction, storage, auth, publication, and jobs use the real API.
if (process.env.TARA_E2E_SOP_LIFECYCLE === "1") {
  test("a new DOCX SOP can be reviewed, published, assigned, and opened by its technician", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page, "owner");
    const draft = await importSource(page, true);
    const editor = page.getByLabel("SOP definition (JSON)", { exact: true });
    await expect(editor).toBeEditable();
    await page
      .getByRole("link", { exact: true, name: "Explore this SOP" })
      .click();
    await expect(
      page.getByRole("button", { exact: true, name: "Start session" })
    ).toBeDisabled();
    const review = page.getByRole("link", {
      exact: true,
      name: "Review draft",
    });
    await expect(review).toHaveAttribute("href", versionPath(draft));
    await review.click();
    await expect(editor).toBeEditable();

    const saveGate = Promise.withResolvers<void>();
    const patchPath = `/api/v1/sop-versions/${draft.id}`;
    const draftRoute = (url: URL) => url.pathname === patchPath;
    await page.route(draftRoute, async (route) => {
      await saveGate.promise;
      await route.continue();
    });
    const saved = page.waitForResponse(
      (item) =>
        new URL(item.url()).pathname === patchPath &&
        item.request().method() === "PATCH"
    );
    await page.getByRole("button", { exact: true, name: "Save draft" }).click();
    try {
      await expect(editor).toBeDisabled();
      await expect(
        page.getByRole("button", { exact: true, name: "Publish version" })
      ).toBeDisabled();
    } finally {
      saveGate.resolve();
    }
    expect((await saved).ok()).toBe(true);
    await page.unroute(draftRoute);
    await expect(editor).toBeEditable();
    await page.getByRole("button", { exact: true, name: "Validate" }).click();
    await expect(page.getByRole("status")).toContainText(
      "Schema and business validation passed."
    );
    await publishDraft(page, draft);
    await page
      .getByRole("link", { exact: true, name: "Create job from this SOP" })
      .click();
    await expect(
      page.getByLabel("Approved procedure", { exact: true })
    ).toHaveValue(draft.id);
    const reference = `WO-E2E-LIFECYCLE-${Date.now()}`;
    await page
      .getByLabel("Assign to", { exact: true })
      .selectOption("technician");
    await page.getByLabel("Work reference", { exact: true }).fill(reference);
    await page
      .getByLabel("Job title", { exact: true })
      .fill("Lifecycle verification");
    await page
      .getByLabel("Equipment or work area", { exact: true })
      .fill("Isolated test bench");
    await page
      .getByLabel("Asset or location ID", { exact: true })
      .fill("E2E-BENCH");
    await page
      .getByLabel("Work to be done", { exact: true })
      .fill("Follow the imported fixture procedure.");
    await page.getByRole("button", { exact: true, name: "Create job" }).click();
    await expect(page.getByRole("status")).toContainText(
      `Job created: ${reference}`
    );
    await page.context().clearCookies();
    await login(page, "technician");
    const order = page.getByRole("article").filter({ hasText: reference });
    await order
      .getByRole("button", { exact: true, name: "Start video session" })
      .click();
    await expect(
      page.getByRole("button", { exact: true, name: "Start bench camera" })
    ).toBeEnabled();
    const runId = new URL(page.url()).pathname.split("/").at(-1);
    const run = await page.request.get(`/api/v1/runs/${runId}`);
    expect(run.ok()).toBe(true);
    const snapshot = await run.json();
    expect(snapshot.sop.id).toBe(draft.sopId);
    expect(snapshot.workOrder.sopVersionId).toBe(draft.id);
  });

  test("duplicate display versions stay distinguishable in the library and assignment picker", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await login(page, "owner");
    const first = await importSource(page);
    await publishDraft(page, first);
    const second = await importSource(page);
    await publishDraft(page, second);
    expect(second.sopId).toBe(first.sopId);
    expect(second.version).toBe(first.version);
    expect(second.versionNumber).toBeGreaterThan(first.versionNumber);
    await page.goto("/sops");
    const firstLink = page.locator(`a[href="${versionPath(first)}"]`);
    const secondLink = page.locator(`a[href="${versionPath(second)}"]`);
    await expect(firstLink).toContainText(`revision ${first.versionNumber}`);
    await expect(secondLink).toContainText(`revision ${second.versionNumber}`);
    await secondLink.click();
    await page
      .getByRole("link", { exact: true, name: "Create job from this SOP" })
      .click();
    const procedures = page.getByLabel("Approved procedure", { exact: true });
    await expect(procedures).toHaveValue(second.id);
    await expect(
      procedures.locator(`option[value="${first.id}"]`)
    ).toContainText(`revision ${first.versionNumber}`);
    await expect(
      procedures.locator(`option[value="${second.id}"]`)
    ).toContainText(`revision ${second.versionNumber}`);
  });
}
