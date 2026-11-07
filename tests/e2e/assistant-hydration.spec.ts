import { expect, test } from "@playwright/test";

test("assistant hydrates and reloads without client-rendering errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  await page.goto("/assistant");
  const workspace = page.locator("main.tara-workspace");
  const instruction = page.locator("#current-instruction");
  const success = page.getByRole("button", { exact: true, name: "Success" });

  await page.getByRole("button", { name: "Mute assistant audio" }).click();
  await success.click();
  await expect(instruction.getByRole("heading")).toHaveText(
    "Replace the switch"
  );
  await expect(workspace).toHaveAttribute("data-state", "active");
  await expect(
    page.getByRole("button", { name: "Session record 2/5 complete" })
  ).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Mute assistant audio" }).click();
  await expect(instruction.getByRole("heading")).toHaveText(
    "Inspect the faulty key"
  );
  await expect(success).toBeEnabled();
  expect(errors).toEqual([]);
});
