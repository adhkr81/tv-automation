import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { testConfig } from "../config/testConfig.js";

const AUTH_FILE = "playwright/.auth/user.json";

test("capture authenticated session", async ({ page }) => {
  await page.goto(testConfig.baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  const usernameSelectors = testConfig.selectors.usernameInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const passwordSelectors = testConfig.selectors.passwordInput
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const loginButtonSelectors = testConfig.selectors.loginButton
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const pinSelectors = (
    testConfig.selectors.pinInput ||
    'input[name*="pin" i], input[id*="pin" i], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const waitForSelectorsToDisappear = async (selectors, timeoutMs, label) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      let anyVisible = false;
      for (const selector of selectors) {
        const visible = await page.locator(selector).first().isVisible().catch(() => false);
        if (visible) {
          anyVisible = true;
          break;
        }
      }
      if (!anyVisible) {
        console.log(`${label} completed.`);
        return;
      }
      await page.waitForTimeout(1000);
    }
    throw new Error(`${label} did not complete within ${Math.round(timeoutMs / 1000)}s.`);
  };

  // Give dynamic login UI time to render before deciding state.
  await page.waitForTimeout(2000);
  console.log("Complete login (and PIN if prompted). Waiting up to 5 minutes...");

  // Phase 1: primary login fields disappear.
  await waitForSelectorsToDisappear(
    [...usernameSelectors, ...passwordSelectors, ...loginButtonSelectors],
    180000,
    "Primary login",
  );
  // Phase 2: monitor for delayed PIN/OTP screens and wait for a stable authenticated state.
  // This avoids closing the browser too early if MFA appears after a redirect.
  const extraAuthSelectors = [
    ...pinSelectors,
    'input[type="tel"]',
    'input[name*="otp" i]',
    'input[id*="otp" i]',
    'input[name*="code" i]',
    'input[id*="code" i]',
    'input[maxlength="6"]',
    'input[maxlength="8"]',
  ];
  const authSelectorsToTrack = [
    ...usernameSelectors,
    ...passwordSelectors,
    ...loginButtonSelectors,
    ...extraAuthSelectors,
  ];

  console.log("Waiting for any PIN/OTP step to finish (up to 4 minutes)...");
  const monitorDeadline = Date.now() + 240000;
  const mustRunUntil = Date.now() + 30000; // Keep watching at least 30s for delayed MFA.
  let seenAdditionalAuth = false;
  let stableNoAuthMs = 0;

  while (Date.now() < monitorDeadline) {
    let authVisible = false;
    let additionalAuthVisible = false;

    for (const selector of authSelectorsToTrack) {
      const visible = await page.locator(selector).first().isVisible().catch(() => false);
      if (visible) {
        authVisible = true;
        if (extraAuthSelectors.includes(selector)) {
          additionalAuthVisible = true;
        }
      }
    }

    // Text-based fallback for non-standard MFA layouts.
    const mfaTextVisible = await page
      .locator("text=/pin|verification code|one-time code|otp/i")
      .first()
      .isVisible()
      .catch(() => false);
    if (mfaTextVisible) {
      authVisible = true;
      additionalAuthVisible = true;
    }

    if (additionalAuthVisible) {
      seenAdditionalAuth = true;
    }

    if (authVisible) {
      stableNoAuthMs = 0;
    } else {
      stableNoAuthMs += 1000;
    }

    // If MFA was seen, require 10s of no auth UI.
    // If MFA was not seen, still require at least 30s observation + 15s quiet.
    if (seenAdditionalAuth && stableNoAuthMs >= 10000) {
      console.log("PIN/OTP step completed.");
      break;
    }
    if (!seenAdditionalAuth && Date.now() >= mustRunUntil && stableNoAuthMs >= 15000) {
      console.log("No additional auth step detected. Proceeding.");
      break;
    }

    await page.waitForTimeout(1000);
  }

  await expect(page).toHaveURL(/rmus\.samsungcsportal\.com/i);

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
  console.log(`Saved auth state to ${AUTH_FILE}`);
});
