import { automationConfig } from "../config/automationConfig.js";

/**
 * Generates a randomized human-like delay between min and max.
 * @param {number} min
 * @param {number} max
 * @returns {Promise<void>}
 */
export async function humanDelay(
  min = automationConfig.delays.short.min,
  max = automationConfig.delays.short.max,
) {
  const delay = Math.floor(Math.random() * (max - min + 1) + min);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Scrolls an element into view smoothly.
 * @param {import('@playwright/test').Page | import('@playwright/test').Frame} context
 * @param {string} selector
 */
export async function smartScroll(context, selector) {
  try {
    const element = context.locator(selector).first();
    // Wait for the element to be attached to the DOM first
    await element.waitFor({ state: "attached", timeout: 5000 });

    // Try to scroll - scrollIntoViewIfNeeded handles visibility internally
    // Note: scrollIntoViewIfNeeded doesn't accept timeout option, uses locator timeout
    await element.scrollIntoViewIfNeeded();
    await humanDelay();
  } catch (error) {
    // If scroll fails, log but don't throw - allow test to continue
    logEvent(
      `Warning: Could not scroll to element "${selector}": ${error.message}`,
      "error",
    );
    // Still add a small delay to maintain timing
    await humanDelay(
      automationConfig.delays.short.min / 2,
      automationConfig.delays.short.max / 2,
    );
  }
}

/**
 * Logs events to the console with timestamps.
 * @param {string} message
 * @param {'info' | 'error' | 'success'} type
 */
export function logEvent(message, type = "info") {
  const timestamp = new Date().toISOString();
  const icon = type === "error" ? "❌" : type === "success" ? "✅" : "ℹ️";
  console.log(`[${timestamp}] ${icon} ${message}`);
}

/**
 * Switches to an iframe and interacts with it.
 * @param {import('@playwright/test').Page} page
 * @param {string} iframeSelector
 * @returns {Promise<import('@playwright/test').Frame | null>}
 */
export async function getIframeContext(page, iframeSelector) {
  const frameElement = page.locator(iframeSelector);
  await frameElement.waitFor({ state: "visible" });
  const frame = page.frame({
    url: (await frameElement.getAttribute("src")) || "",
  });
  return frame;
}

/**
 * Dismisses any Medallia/feedback survey popups that may be blocking the page.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>} - Returns true if a popup was dismissed
 */
export async function dismissFeedbackPopup(page) {
  try {
    // List of popup selectors to check (in order of priority)
    const popupSelectors = [
      // Medallia Digital Survey popup (new format)
      '#survey-wrapper',
      '.LzH7a0KU5MrRzBnQUWw3',
      // Old Medallia wrapper
      '#MDigitalLightboxWrapper',
      // Kampyle iframe container
      '#kampyle_contentDIV',
      '[id*="kampyle"]',
    ];

    // List of close button selectors to try (in order of priority)
    const closeButtonSelectors = [
      // X close button (Medallia Digital Survey)
      'button[data-aut="button-x-close"]',
      'button.surveyX',
      '.oAWMrQUNeByuhVosi1Hl.surveyX',
      // Close button in footer
      'button[data-aut="button-close"]',
      'button.surveyBtn_close',
      '.surveyBtn.surveyBtn_close',
      // Generic close buttons
      '[aria-label="Close Survey"]',
      '[aria-label="Close"]',
      'button[aria-label*="close" i]',
      '.close-button',
      '.modal-close',
    ];

    let popupFound = false;
    let popupElement = null;

    // Check for any popup selector
    for (const selector of popupSelectors) {
      try {
        const element = page.locator(selector);
        const count = await element.count();
        if (count > 0) {
          const isVisible = await element.first().isVisible().catch(() => false);
          if (isVisible) {
            popupFound = true;
            popupElement = element.first();
            logEvent(`Detected Medallia feedback popup (${selector}), attempting to dismiss...`, "info");
            break;
          }
        }
      } catch {
        // Continue to next selector
      }
    }

    // Also check for Medallia iframe
    if (!popupFound) {
      try {
        const iframeSelectors = [
          'iframe[src*="medallia"]',
          'iframe[src*="kampyle"]',
          'iframe[title*="survey" i]',
          'iframe[title*="feedback" i]',
        ];
        for (const iframeSelector of iframeSelectors) {
          const iframe = page.locator(iframeSelector);
          if (await iframe.count() > 0 && await iframe.first().isVisible().catch(() => false)) {
            popupFound = true;
            logEvent(`Detected Medallia iframe (${iframeSelector}), attempting to dismiss...`, "info");
            break;
          }
        }
      } catch {
        // Ignore iframe check errors
      }
    }

    if (!popupFound) {
      return false;
    }

    // Try multiple strategies to dismiss the popup

    // Strategy 1: Try clicking close buttons
    for (const closeSelector of closeButtonSelectors) {
      try {
        const closeButton = page.locator(closeSelector);
        if (await closeButton.count() > 0 && await closeButton.first().isVisible().catch(() => false)) {
          await closeButton.first().click({ timeout: 3000 });
          await humanDelay(500, 1000);
          logEvent(`Medallia popup dismissed via close button (${closeSelector})`, "info");
          return true;
        }
      } catch {
        // Try next close button
      }
    }

    // Strategy 2: Press Escape key
    try {
      await page.keyboard.press('Escape');
      await humanDelay(500, 1000);
      // Check if popup is still visible
      if (popupElement) {
        const stillVisible = await popupElement.isVisible().catch(() => false);
        if (!stillVisible) {
          logEvent(`Medallia popup dismissed via Escape key`, "info");
          return true;
        }
      }
    } catch {
      // Escape didn't work, continue
    }

    // Strategy 3: Remove via JavaScript
    try {
      await page.evaluate(() => {
        // Remove survey wrapper elements
        const selectors = [
          '#survey-wrapper',
          '.LzH7a0KU5MrRzBnQUWw3',
          '#MDigitalLightboxWrapper',
          '#kampyle_contentDIV',
          '[id*="kampyle"]',
        ];
        
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            if (el && el.parentNode) {
              el.parentNode.removeChild(el);
            }
          });
        });
        
        // Remove any overlay/backdrop
        const overlays = document.querySelectorAll(
          '[class*="lightbox-overlay"], [class*="modal-overlay"], [class*="backdrop"]'
        );
        overlays.forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });

        // Remove Medallia iframes
        const iframes = document.querySelectorAll(
          'iframe[src*="medallia"], iframe[src*="kampyle"], iframe[title*="survey" i]'
        );
        iframes.forEach(el => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
      });
      await humanDelay(500, 1000);
      logEvent(`Medallia popup removed via JavaScript`, "info");
      return true;
    } catch (jsError) {
      logEvent(`Could not remove Medallia popup via JavaScript: ${jsError.message}`, "error");
    }

    return false;
  } catch (error) {
    // Ignore errors - popup might not exist
    return false;
  }
}

/**
 * Dismisses Medallia survey popups that may appear inside iframes.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>} - Returns true if a popup was dismissed
 */
export async function dismissMedalliaIframePopup(page) {
  try {
    // Look for Medallia iframe containers
    const iframeContainerSelectors = [
      '#kampyle_vertical_1',
      '#kampyle_vertical_2',
      '#kampyle_horizontal_1',
      '#kampyle_horizontal_2',
      '[id^="kampyle_"]',
      '.kampyle_vertical',
      '.kampyle_horizontal',
      '#MDigitalContentDIV',
      '#MDigitalIframeDIV',
    ];

    for (const containerSelector of iframeContainerSelectors) {
      try {
        const container = page.locator(containerSelector);
        if (await container.count() > 0) {
          const isVisible = await container.first().isVisible().catch(() => false);
          if (isVisible) {
            logEvent(`Found Medallia iframe container: ${containerSelector}`, "info");
            
            // Try to find close button inside the iframe
            try {
              const frameLocator = page.frameLocator(`${containerSelector} iframe`);
              const closeButtons = [
                'button[data-aut="button-x-close"]',
                'button.surveyX',
                'button[data-aut="button-close"]',
                'button.surveyBtn_close',
                '[aria-label="Close Survey"]',
              ];
              
              for (const closeBtn of closeButtons) {
                try {
                  const btn = frameLocator.locator(closeBtn);
                  if (await btn.count() > 0) {
                    await btn.first().click({ timeout: 3000 });
                    await humanDelay(500, 1000);
                    logEvent(`Clicked close button in Medallia iframe: ${closeBtn}`, "info");
                    return true;
                  }
                } catch {
                  // Try next button
                }
              }
            } catch {
              // Iframe interaction failed
            }

            // If no button found, remove the container via JavaScript
            await page.evaluate((selector) => {
              const elements = document.querySelectorAll(selector);
              elements.forEach(el => {
                if (el && el.parentNode) {
                  el.parentNode.removeChild(el);
                }
              });
            }, containerSelector);
            await humanDelay(300, 500);
            logEvent(`Removed Medallia iframe container: ${containerSelector}`, "info");
            return true;
          }
        }
      } catch {
        // Continue to next selector
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Comprehensive popup dismissal - checks both main page and iframes.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<boolean>} - Returns true if any popup was dismissed
 */
export async function dismissAllPopups(page) {
  let dismissed = false;
  
  // First try the main page popup dismissal
  if (await dismissFeedbackPopup(page)) {
    dismissed = true;
  }
  
  // Then try iframe-based Medallia popups
  if (await dismissMedalliaIframePopup(page)) {
    dismissed = true;
  }
  
  return dismissed;
}

/**
 * Handles console and network errors logging for a page.
 * @param {import('@playwright/test').Page} page
 */
export function setupErrorLogging(page) {
  page.on("console", (msg) => {
    const text = msg.text();
    // Filter out CSP noise, analytics failures, and sandboxed script warnings
    const isNoise =
      text.includes("Content Security Policy") ||
      text.includes("Blocked script execution") ||
      text.includes("about:blank") ||
      text.includes("NewRelic") ||
      text.includes("AppMeasurement");

    // Additional console ignore patterns from config
    const consoleIgnores = automationConfig.logging?.ignoreConsoleErrors || [];
    const isConsoleIgnored = consoleIgnores.some((pattern) =>
      text.includes(pattern),
    );

    if (msg.type() === "error" && !isNoise && !isConsoleIgnored) {
      logEvent(`Console Error: ${text}`, "error");
    }
  });

  page.on("pageerror", (exception) => {
    const pageIgnores = automationConfig.logging?.ignorePageErrors || [];
    const isPageIgnored = pageIgnores.some(
      (pattern) => exception.message && exception.message.includes(pattern),
    );

    if (!isPageIgnored) {
      logEvent(`Page Error: ${exception.message}`, "error");
    }
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    const failureReason = request.failure()?.errorText || "";

    // If configured to suppress all request-failed logs, do nothing
    if (automationConfig.network?.suppressRequestFailedLogs) return;

    // If the URL matches any of the configured ignore patterns, skip logging
    const ignorePatterns = automationConfig.network?.ignoreFailedRequests || [];
    const isIgnoredUrl = ignorePatterns.some((pattern) =>
      url.includes(pattern),
    );
    if (isIgnoredUrl) return;

    // If the failure reason matches known noisy errors, skip logging
    const ignoreFailureErrors =
      automationConfig.logging?.ignoreRequestFailureErrors || [];
    const isIgnoredFailure = ignoreFailureErrors.some(
      (pattern) =>
        failureReason &&
        failureReason.toLowerCase().includes(pattern.toLowerCase()),
    );
    if (isIgnoredFailure) return;

    // Otherwise, log as before
    logEvent(`Request Failed: ${url} - ${failureReason}`, "error");
  });
}
