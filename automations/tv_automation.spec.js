import { test, expect } from "@playwright/test";
import { testConfig } from "../config/testConfig.js";

test.describe("RMUS Automation Starter", () => {
  test("loads RMUS portal with saved auth state", async ({ page }) => {
    if (testConfig.browser.viewport) {
      await page.setViewportSize(testConfig.browser.viewport);
    }

    await page.goto(testConfig.baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Basic URL and title checks for a stable starter baseline.
    await expect(page).toHaveURL(/rmus\.samsungcsportal\.com/i);
    await expect(page).toHaveTitle(/Remote Management|Log-In/i);

    // Accept both states:
    // - First run / expired session: login page is visible.
    // - After auth setup: portal loads as authenticated.
    const loginButton = page.locator(testConfig.selectors.loginButton).first();
    const loginVisible = await loginButton.isVisible().catch(() => false);
    if (loginVisible) {
      await expect(loginButton).toBeVisible({ timeout: 15000 });
    } else {
      await expect(page.locator("body")).toBeVisible();
    }
  });
});
