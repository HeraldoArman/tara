import { expect, type Page, test } from "@playwright/test";

const password = process.env.TARA_E2E_PASSWORD ?? process.env.DEMO_PASSWORD;
if (!password) {
  throw new Error(
    "Set TARA_E2E_PASSWORD to the explicit password used by seed:demo."
  );
}
const origin = process.env.TARA_E2E_ORIGIN ?? "http://localhost:3001";
const loginPath = /\/login$/;
const workQueueHeading = /Work queue/;
const publishedVersionLink = /Version .*Published/i;
const startOrResumeButton = /Start video session|Resume session/;
const runPath = /\/runs\/.+/;
const importPath = /\/sops\/import$/;
const priorityFilter = /^priority$/i;
const allFilter = /^all$/i;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password as string);
  await page.getByRole("button", { exact: true, name: "Sign in" }).click();
  await expect(page).toHaveURL(
    (url) => url.origin === origin && url.pathname !== "/login"
  );
}

test("invalid login stays signed out and shows a useful error", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill("technician");
  await page
    .getByLabel("Password", { exact: true })
    .fill("invalid-password-for-e2e");
  await page.getByRole("button", { exact: true, name: "Sign in" }).click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(loginPath);
});

test("technician queue filters assigned jobs and reads the immutable published SOP", async ({
  page,
}) => {
  await login(page, "technician");
  await expect(
    page.getByRole("heading", { name: workQueueHeading })
  ).toBeVisible();
  await expect(
    page.getByText("WO-1042", { exact: true }).first()
  ).toBeVisible();
  await page.getByRole("button", { name: priorityFilter }).click();
  await expect(
    page.getByRole("button", { name: priorityFilter })
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: allFilter }).click();
  await expect(
    page.getByRole("link", { exact: true, name: "Evaluation" })
  ).toHaveCount(1);
  await page.getByRole("link", { exact: true, name: "SOP library" }).click();
  await expect(
    page.getByRole("link", { name: "Import a procedure" })
  ).toHaveCount(0);
  await page.getByRole("link", { name: publishedVersionLink }).first().click();
  await expect(
    page.getByText("Published definitions are immutable.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save draft" })).toHaveCount(0);
});

test("technician cannot import SOPs and evaluation stays scoped to own history", async ({
  page,
}) => {
  await login(page, "technician");
  await page.goto("/sops/import");
  await expect(page.locator('.notice[role="alert"]')).toContainText(
    "Only an SOP manager or owner"
  );
  await page.goto("/evaluation");
  await expect(
    page.getByRole("heading", { name: "See the work clearly." })
  ).toBeVisible();
  await expect(page.getByLabel("Technician", { exact: true })).toBeDisabled();
  const response = await page.request.get("/api/v1/evaluation/summary");
  expect(response.status()).toBe(200);
  const foreign = await page.request.get(
    "/api/v1/evaluation/summary?technicianId=foreign-technician"
  );
  expect(foreign.status()).toBe(200);
  expect((await foreign.json()).runs).toBe(0);
});

test("workspace stays silent when the realtime provider is unavailable", async ({
  page,
}) => {
  let mediaRequests = 0;
  await page.exposeFunction("recordMediaRequest", () => {
    mediaRequests += 1;
  });
  await page.addInitScript(() => {
    if (!navigator.mediaDevices) {
      return;
    }
    const request = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      await (
        window as unknown as { recordMediaRequest: () => Promise<void> }
      ).recordMediaRequest();
      return await request(constraints);
    };
  });
  await login(page, "technician");
  const order = page.getByRole("article").filter({ hasText: "WO-1042" });
  await order.getByRole("button", { name: startOrResumeButton }).click();
  await expect(page).toHaveURL(runPath);
  await expect(
    page.getByRole("heading", { exact: true, name: "Sleep" })
  ).toBeVisible();
  await expect(
    page.getByLabel("Reply to tara", { exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { exact: true, name: "Resume listening" })
  ).toBeDisabled();
  await expect(page.getByText("Microphone off", { exact: true })).toBeVisible();
  await expect(page.locator("audio")).toHaveCount(0);
  const connection = page.waitForResponse(
    (response) =>
      response.url().includes("/connection") &&
      response.request().method() === "POST"
  );
  await page
    .getByRole("button", { exact: true, name: "Start bench camera" })
    .click();
  expect((await connection).status()).toBe(503);
  await expect(page.locator('.tara-live-error[role="alert"]')).toContainText(
    "not configured"
  );
  await expect(
    page.getByLabel("Reply to tara", { exact: true })
  ).toBeDisabled();
  expect(mediaRequests).toBe(0);
});

test("SOP manager gets the draft import flow and clear invalid-document feedback", async ({
  page,
}) => {
  await login(page, "sop_manager");
  await page.goto("/sops");
  await page.getByRole("link", { name: "Import a procedure" }).click();
  await expect(page.getByText("A draft first. Always.")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(""),
    mimeType: "text/plain",
    name: "empty.txt",
  });
  await page.getByRole("button", { name: "Generate SOP draft" }).click();
  await expect(page.locator('.notice[role="alert"]')).toBeVisible();
  await expect(page).toHaveURL(importPath);
});

test("owner evaluation reads recorded data and rejects a foreign request origin", async ({
  page,
}) => {
  await login(page, "owner");
  await page.getByRole("link", { exact: true, name: "Evaluation" }).click();
  await expect(
    page.getByRole("heading", { name: "See the work clearly." })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Apply filters" })
  ).toBeEnabled();
  const data = await page.request.get("/api/v1/evaluation/summary");
  expect(data.status()).toBe(200);
  const blocked = await page.request.post("/api/v1/auth/logout", {
    headers: { Origin: "https://untrusted.example" },
  });
  expect(blocked.status()).toBe(403);
  await expect(
    page.getByRole("link", { exact: true, name: "Evaluation" })
  ).toBeVisible();
});
