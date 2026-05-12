import { automationConfig } from "../config/automationConfig.js";

const selectorList = (selectorString) =>
  selectorString
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export async function waitForFirstVisible(page, selectors, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);
      if (visible) return locator;
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} was not visible. Tried: ${selectors.join(", ")}`);
}

/** Same as waitForFirstVisible but returns null if nothing matches within timeout (e.g. already logged in). */
async function waitForFirstVisibleOrNull(page, selectors, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      const visible = await locator.isVisible().catch(() => false);
      if (visible) return locator;
    }
    await page.waitForTimeout(250);
  }
  return null;
}

export async function loginAndWaitAuthenticated(page, options = {}) {
  const { interactivePinConfirmation = false, waitForUserConfirmation } = options;
  const { timeouts = {}, security = {} } = automationConfig;
  const usernameSelectors = selectorList(automationConfig.selectors.usernameInput);
  const passwordSelectors = selectorList(automationConfig.selectors.passwordInput);
  const loginButtonSelectors = selectorList(automationConfig.selectors.loginButton);
  const username = (process.env[security.usernameEnv || ""] || "").trim();
  const password = (process.env[security.passwordEnv || ""] || "").trim();

  await page.goto(automationConfig.baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: timeouts.loginNavigationMs ?? 60000,
  });
  await page.waitForTimeout(timeouts.initialPageSettleMs ?? 2000);

  // Storage-state / reused session: remote UI loads with no login form — do not treat as failure.
  const loginButton = await waitForFirstVisibleOrNull(
    page,
    loginButtonSelectors,
    timeouts.loginSelectorVisibleMs ?? 10000,
  );
  if (!loginButton) return;

  if (username) {
    const usernameInput = await waitForFirstVisible(
      page,
      usernameSelectors,
      timeouts.loginSelectorVisibleMs ?? 10000,
      "Username input",
    );
    await usernameInput.fill(username);
  }
  if (password) {
    const passwordInput = await waitForFirstVisible(
      page,
      passwordSelectors,
      timeouts.loginSelectorVisibleMs ?? 10000,
      "Password input",
    );
    await passwordInput.fill(password);
  }
  await loginButton.click();

  if (interactivePinConfirmation) {
    if (typeof waitForUserConfirmation === "function") {
      await waitForUserConfirmation();
    }
    await page.waitForTimeout(timeouts.startButtonPostClickMs ?? 1500);
    return;
  }

  const pinSelectors = (
    automationConfig.selectors.pinInput ||
    'input[name*="pin" i], input[id*="pin" i], input[autocomplete="one-time-code"], input[inputmode="numeric"]'
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const authSelectorsToTrack = [
    ...usernameSelectors,
    ...passwordSelectors,
    ...loginButtonSelectors,
    ...pinSelectors,
    'input[type="tel"]',
    'input[name*="otp" i]',
    'input[id*="otp" i]',
    'input[name*="code" i]',
    'input[id*="code" i]',
    'input[maxlength="6"]',
    'input[maxlength="8"]',
  ];

  const monitorDeadline = Date.now() + (timeouts.authMonitorTotalMs ?? 240000);
  const mustRunUntil = Date.now() + (timeouts.authMustRunUntilMs ?? 30000);
  let seenAdditionalAuth = false;
  let stableNoAuthMs = 0;

  while (Date.now() < monitorDeadline) {
    let authVisible = false;
    let additionalAuthVisible = false;

    for (const selector of authSelectorsToTrack) {
      const visible = await page.locator(selector).first().isVisible().catch(() => false);
      if (visible) {
        authVisible = true;
        if (pinSelectors.includes(selector)) additionalAuthVisible = true;
      }
    }

    const mfaTextVisible = await page
      .locator("text=/pin|verification code|one-time code|otp/i")
      .first()
      .isVisible()
      .catch(() => false);
    if (mfaTextVisible) {
      authVisible = true;
      additionalAuthVisible = true;
    }

    if (additionalAuthVisible) seenAdditionalAuth = true;
    stableNoAuthMs = authVisible ? 0 : stableNoAuthMs + 1000;

    if (seenAdditionalAuth && stableNoAuthMs >= (timeouts.authStableNoAuthAfterMfaMs ?? 10000)) break;
    if (
      !seenAdditionalAuth &&
      Date.now() >= mustRunUntil &&
      stableNoAuthMs >= (timeouts.authStableNoAuthWithoutMfaMs ?? 15000)
    ) {
      break;
    }
    await page.waitForTimeout(1000);
  }
}
