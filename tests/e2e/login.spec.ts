import { expect, test } from "@playwright/test";

test("protects the picker and opens it with the shared password", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Password").fill("test-password");
  const loginResponse = page.waitForResponse((response) => response.url().endsWith("/api/login"));
  await page.getByRole("button", { name: "Enter" }).click();
  await expect((await loginResponse).status()).toBe(200);
  await expect(page).toHaveURL("http://localhost:3000/");
  await expect(page.getByRole("heading", { name: "Where can we look?" })).toBeVisible();
});
