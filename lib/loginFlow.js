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

export async function loginAndWaitAuthenticated(page, options = {}) {
  const { interactivePinConfirmation = false, waitForUserConfirmation } = options;
  const usernameSelectors = selectorList(automationConfig.selectors.usernameInput);
  const passwordSelectors = selectorList(automationConfig.selectors.passwordInput);
  const loginButtonSelectors = selectorList(automationConfig.selectors.loginButton);

  await page.goto(automationConfig.baseUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2000);

  const loginButton = await waitForFirstVisible(page, loginButtonSelectors, 10000, "Login button");
  const loginVisible = await loginButton.isVisible().catch(() => false);
  if (!loginVisible) return;

  if (automationConfig.credentials?.username) {
    const usernameInput = await waitForFirstVisible(page, usernameSelectors, 10000, "Username input");
    await usernameInput.fill(automationConfig.credentials.username);
  }
  if (automationConfig.credentials?.password) {
    const passwordInput = await waitForFirstVisible(page, passwordSelectors, 10000, "Password input");
    await passwordInput.fill(automationConfig.credentials.password);
  }
  await loginButton.click();

  if (interactivePinConfirmation) {
    if (typeof waitForUserConfirmation === "function") {
      await waitForUserConfirmation();
    }
    await page.waitForTimeout(1500);
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

  const monitorDeadline = Date.now() + 240000;
  const mustRunUntil = Date.now() + 30000;
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

    if (seenAdditionalAuth && stableNoAuthMs >= 10000) break;
    if (!seenAdditionalAuth && Date.now() >= mustRunUntil && stableNoAuthMs >= 15000) break;
    await page.waitForTimeout(1000);
  }
}
