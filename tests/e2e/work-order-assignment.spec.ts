import { expect, type Page, test } from "@playwright/test";

const password = process.env.TARA_E2E_PASSWORD ?? process.env.DEMO_PASSWORD;
if (!password) {
  throw new Error(
    "Set TARA_E2E_PASSWORD to the password used by the isolated demonstration seed."
  );
}
const origin = process.env.TARA_E2E_ORIGIN ?? "http://localhost:3001";
const publishedVersionLink = /Version .*Published/i;
const runPath = /\/runs\/.+/;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password as string);
  await page.getByRole("button", { exact: true, name: "Sign in" }).click();
  await expect(page).toHaveURL(
    (url) => url.origin === origin && url.pathname !== "/login"
  );
}

test("owner assigns a published SOP job that its technician can start", async ({
  page,
}) => {
  const reference = `WO-E2E-ASSIGN-${Date.now()}`;
  await login(page, "owner");
  await page.getByRole("link", { exact: true, name: "SOP library" }).click();
  await page.getByRole("link", { name: publishedVersionLink }).first().click();
  await page
    .getByRole("link", { exact: true, name: "Create job from this SOP" })
    .click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/work-orders/new" &&
      url.searchParams.has("sopVersionId")
  );
  const versionId = new URL(page.url()).searchParams.get("sopVersionId");
  expect(versionId).toBeTruthy();
  const procedure = page.getByLabel("Approved procedure", { exact: true });
  await expect(procedure).toHaveValue(versionId as string);
  await procedure.selectOption(versionId as string);
  await page
    .getByLabel("Assign to", { exact: true })
    .selectOption("technician");
  await page.getByLabel("Work reference", { exact: true }).fill(reference);
  await page
    .getByLabel("Job title", { exact: true })
    .fill("Inspect assigned workstation keyboard");
  await page
    .getByLabel("Equipment or work area", { exact: true })
    .fill("Workshop bench B keyboard");
  await page
    .getByLabel("Asset or location ID", { exact: true })
    .fill("BENCH-B-KBD-004");
  await page
    .getByLabel("Work to be done", { exact: true })
    .fill(
      "Replace the intermittent E-key switch using the approved procedure."
    );
  await page.getByLabel("Priority", { exact: true }).selectOption("priority");
  await page.getByLabel("Estimated minutes", { exact: true }).fill("20");
  const creation = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/work-orders" &&
      response.request().method() === "POST"
  );
  await page.getByRole("button", { exact: true, name: "Create job" }).click();
  const createdResponse = await creation;
  expect(createdResponse.status()).toBe(201);
  const created = await createdResponse.json();
  expect(created).toMatchObject({
    asset: { model: "Workshop bench B keyboard", serial: "BENCH-B-KBD-004" },
    estimatedMinutes: 20,
    priority: "priority",
    reference,
    sopVersionId: versionId,
    title: "Inspect assigned workstation keyboard",
  });
  await expect(page.getByRole("status")).toContainText(
    `Job created: ${reference}`
  );
  await expect(page.getByRole("status")).toContainText("Demo Technician");
  await expect(
    page.getByRole("button", { exact: true, name: "Start video session" })
  ).toHaveCount(0);

  await page.context().clearCookies();
  await login(page, "technician");
  const order = page.getByRole("article").filter({ hasText: reference });
  await expect(order).toContainText("Inspect assigned workstation keyboard");
  const started = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/v1/work-orders/${created.id}/runs` &&
      response.request().method() === "POST"
  );
  await order
    .getByRole("button", { exact: true, name: "Start video session" })
    .click();
  const runResponse = await started;
  expect(runResponse.ok()).toBe(true);
  expect((await runResponse.json()).workOrderId).toBe(created.id);
  await expect(page).toHaveURL(runPath);
  await expect(
    page.getByRole("button", { exact: true, name: "Start bench camera" })
  ).toBeEnabled();
  await expect(
    page.getByLabel("Reply to tara", { exact: true })
  ).toBeDisabled();
});

test("technician cannot create assignments through the page or direct API", async ({
  page,
}) => {
  await login(page, "technician");
  await page.goto("/work-orders/new");
  await expect(page.locator('.notice[role="alert"]')).toContainText(
    "Only an owner can create and assign jobs."
  );
  await expect(
    page.getByRole("button", { exact: true, name: "Create job" })
  ).toHaveCount(0);
  const procedures = await page.request.get("/api/v1/sops");
  expect(procedures.ok()).toBe(true);
  const [procedure] = (await procedures.json()).items;
  const version = procedure.versions.find(
    (item: { status: string }) => item.status === "published"
  );
  const blocked = await page.request.post("/api/v1/work-orders", {
    data: {
      asset: { model: "Workshop bench", serial: "NO-ASSIGNMENT" },
      assignedUsername: "technician",
      estimatedMinutes: 20,
      issue: "This unauthorized assignment must not be created.",
      priority: "standard",
      reference: `WO-E2E-FORBIDDEN-${Date.now()}`,
      sopVersionId: version.id,
      title: "Unauthorized work assignment",
    },
    headers: { Origin: origin },
  });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).error.code).toBe("FORBIDDEN");
  const assignees = await page.request.get("/api/v1/work-orders/assignees");
  expect(assignees.status()).toBe(403);
});
