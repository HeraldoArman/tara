import { expect, type Page, test } from "@playwright/test";

test.setTimeout(90_000);

const password = process.env.TARA_E2E_PASSWORD ?? process.env.DEMO_PASSWORD;
if (!password) {
  throw new Error(
    "Set TARA_E2E_PASSWORD to the password used by the isolated demonstration seed."
  );
}
const origin = process.env.TARA_E2E_ORIGIN ?? "http://localhost:3001";
const publishedVersionLink = /Version .*Published/i;
const versionPagePath = /^\/sops\/[^/]+\/versions\/\d+$/;

async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password as string);
  await page.getByRole("button", { exact: true, name: "Sign in" }).click();
  await expect(page).toHaveURL(
    (url) => url.origin === origin && url.pathname !== "/login"
  );
}

test("owner keeps the sidebar, active section, and same document across workspace pages", async ({
  page,
}) => {
  await login(page, "owner");
  await expect(page).toHaveURL((url) => url.pathname === "/dashboard");
  const navigation = page.getByRole("navigation", {
    exact: true,
    name: "Primary",
  });
  await expect(
    navigation.getByRole("link", { exact: true, name: "Overview" })
  ).toHaveAttribute("aria-current", "page");

  const documentRequests: string[] = [];
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentRequests.push(request.url());
    }
  });

  await navigation
    .getByRole("link", { exact: true, name: "SOP library" })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === "/sops");
  await expect(
    navigation.getByRole("link", { exact: true, name: "SOP library" })
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: publishedVersionLink }).first().click();
  await expect(page).toHaveURL((url) => versionPagePath.test(url.pathname));
  await expect(
    navigation.getByRole("link", { exact: true, name: "SOP library" })
  ).toHaveAttribute("aria-current", "page");

  await navigation
    .getByRole("link", { exact: true, name: "SOP library" })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === "/sops");
  await page
    .getByRole("link", { exact: true, name: "Import a procedure" })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === "/sops/import");
  await expect(
    navigation.getByRole("link", { exact: true, name: "SOP library" })
  ).toHaveAttribute("aria-current", "page");

  const libraryResponse = await page.request.get("/api/v1/sops");
  expect(libraryResponse.ok()).toBe(true);
  const library: { items: { versions: { id: string; status: string }[] }[] } =
    await libraryResponse.json();
  const published = library.items
    .flatMap((sop) => sop.versions)
    .find((version) => version.status === "published");
  expect(published).toBeDefined();
  const sessionResponse = await page.request.post(
    `/api/v1/sop-versions/${published?.id}/runs`,
    {
      data: {},
      headers: { Origin: origin },
    }
  );
  expect(sessionResponse.ok()).toBe(true);
  const session: { id: string } = await sessionResponse.json();

  await navigation.getByRole("link", { exact: true, name: "Reports" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/reports");
  await expect(
    navigation.getByRole("link", { exact: true, name: "Reports" })
  ).toHaveAttribute("aria-current", "page");
  await page.locator(`a[href="/reports/runs/${session.id}"]`).first().click();
  await expect(page).toHaveURL(
    (url) => url.pathname === `/reports/runs/${session.id}`
  );
  await expect(
    navigation.getByRole("link", { exact: true, name: "Reports" })
  ).toHaveAttribute("aria-current", "page");

  await navigation
    .getByRole("link", { exact: true, name: "Evaluation" })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === "/evaluation");
  await expect(
    navigation.getByRole("link", { exact: true, name: "Evaluation" })
  ).toHaveAttribute("aria-current", "page");
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  expect(page.context().pages()).toHaveLength(1);
  expect(documentRequests).toEqual([]);
});

test("owner dashboard anchors and create-job page select the matching sidebar item", async ({
  page,
}) => {
  await login(page, "owner");
  const navigation = page.getByRole("navigation", {
    exact: true,
    name: "Primary",
  });
  const queue = navigation.getByRole("link", {
    exact: true,
    name: "Work queue",
  });
  const activity = navigation.getByRole("link", {
    exact: true,
    name: "SOP activity",
  });
  const overview = navigation.getByRole("link", {
    exact: true,
    name: "Overview",
  });

  await queue.click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/dashboard" && url.hash === "#work-queue"
  );
  await expect(queue).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#work-queue")).toBeInViewport();
  await activity.click();
  await expect(page).toHaveURL((url) => url.hash === "#sop-breakdown");
  await expect(activity).toHaveAttribute("aria-current", "page");
  await expect(queue).not.toHaveAttribute("aria-current", "page");
  await expect(page.locator("#sop-breakdown")).toBeInViewport();

  await page.goBack();
  await expect(page).toHaveURL((url) => url.hash === "#work-queue");
  await expect(queue).toHaveAttribute("aria-current", "page");
  await overview.click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/dashboard" && url.hash === ""
  );
  await expect(overview).toHaveAttribute("aria-current", "page");

  await page
    .getByRole("link", { exact: true, name: "Create job" })
    .first()
    .click();
  await expect(page).toHaveURL((url) => url.pathname === "/work-orders/new");
  await expect(queue).toHaveAttribute("aria-current", "page");
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await queue.click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/dashboard" && url.hash === "#work-queue"
  );
  await expect(queue).toHaveAttribute("aria-current", "page");
});

test("technician has the same workspace sidebar with role-appropriate navigation", async ({
  page,
}) => {
  await page.setViewportSize({ height: 1000, width: 1440 });
  await login(page, "technician");
  await expect(page).toHaveURL((url) => url.pathname === "/");
  const navigation = page.getByRole("navigation", {
    exact: true,
    name: "Primary",
  });
  const queue = navigation.getByRole("link", {
    exact: true,
    name: "Work queue",
  });
  await expect(queue).toHaveAttribute("aria-current", "page");
  await expect(
    navigation.getByRole("link", { exact: true, name: "Overview" })
  ).toHaveCount(0);
  await expect(
    navigation.getByRole("link", { exact: true, name: "SOP activity" })
  ).toHaveCount(0);

  await navigation.getByRole("link", { exact: true, name: "Reports" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/reports");
  await expect(
    navigation.getByRole("link", { exact: true, name: "Reports" })
  ).toHaveAttribute("aria-current", "page");
  await queue.click();
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await expect(queue).toHaveAttribute("aria-current", "page");
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  expect(page.context().pages()).toHaveLength(1);
  await page.screenshot({
    path: ".cache/e2e-runtime/technician-workspace-desktop.png",
  });
  await page.setViewportSize({ height: 844, width: 390 });
  await page.screenshot({
    path: ".cache/e2e-runtime/technician-workspace-mobile.png",
  });
  await page
    .getByRole("button", { exact: true, name: "Open navigation" })
    .click();
  await expect(
    page.getByRole("dialog", { exact: true, name: "Workspace navigation" })
  ).toBeVisible();
  await page.screenshot({
    path: ".cache/e2e-runtime/technician-workspace-menu.png",
  });
});

test("mobile workspace navigation closes after selecting a page or pressing Escape", async ({
  page,
}) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await login(page, "owner");
  const openMenu = page.getByRole("button", {
    exact: true,
    name: "Open navigation",
  });
  const dialog = page.getByRole("dialog", {
    exact: true,
    name: "Workspace navigation",
  });
  await expect(dialog).not.toBeVisible();
  await expect(openMenu).toHaveAttribute("aria-expanded", "false");
  await openMenu.click();
  await expect(dialog).toBeVisible();
  await expect(openMenu).toHaveAttribute("aria-expanded", "true");
  await expect(
    dialog.getByRole("link", { exact: true, name: "Overview" })
  ).toHaveAttribute("aria-current", "page");
  await dialog.getByRole("link", { exact: true, name: "SOP library" }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sops");
  await expect(dialog).not.toBeVisible();
  await expect(openMenu).toHaveAttribute("aria-expanded", "false");

  await openMenu.click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("link", { exact: true, name: "SOP library" })
  ).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(openMenu).toHaveAttribute("aria-expanded", "false");
  await expect(openMenu).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  expect(page.context().pages()).toHaveLength(1);
});
