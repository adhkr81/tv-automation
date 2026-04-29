import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import dotenv from "dotenv";
import { chromium } from "playwright";
import samsungTvRemotePkg from "samsung-tv-remote";
import { automationConfig } from "../config/automationConfig.js";
import { loginAndWaitAuthenticated } from "../lib/loginFlow.js";
import { reset, topics } from "./topics.mjs";

dotenv.config();

const { SamsungTvRemote } = samsungTvRemotePkg;

const outputRoot = path.join(process.cwd(), "captures");
const runDir = outputRoot;
const logsDir = path.join(process.cwd(), "logs");
const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
const runLogPath = path.join(logsDir, `capture-run-${runStamp}.log`);

const RM_TO_SAMSUNG_KEY = {
  "?": "KEY_CONTENTS",
  "◀": "KEY_LEFT",
  "▶": "KEY_RIGHT",
  "▲": "KEY_UP",
  "▼": "KEY_DOWN",
  ENTER: "KEY_ENTER",
  RETURN: "KEY_RETURN",
  EXIT: "KEY_EXIT",
  MENU: "KEY_MENU",
  INFO: "KEY_INFO",
  TOOLS: "KEY_TOOLS",
  POWER: "KEY_POWER",
  INPUT: "KEY_SOURCE",
  MUTE: "KEY_MUTE",
  "VOL UP": "KEY_VOLUP",
  "VOL DOWN": "KEY_VOLDOWN",
  "TUNNING/CH UP": "KEY_CHUP",
  "TUNNING/CH DOWN": "KEY_CHDOWN",
  GUIDE: "KEY_GUIDE",
  HOME: "KEY_HOME",
  SEARCH: "KEY_SEARCH",
  CONTENTS: "KEY_CONTENTS",
  A: "KEY_RED",
  B: "KEY_GREEN",
  C: "KEY_YELLOW",
  D: "KEY_CYAN",
};

function normalizeActionKeyName(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveSamsungKey(actionKey) {
  const normalized = normalizeActionKeyName(actionKey);
  if (!normalized) return null;
  if (normalized.startsWith("KEY_")) return normalized;
  return RM_TO_SAMSUNG_KEY[normalized] || null;
}

function useSamsungRemoteDriver() {
  const flag = (process.env.USE_SAMSUNG_REMOTE || "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(flag);
}

function createSamsungRemoteController() {
  const ip = (process.env.SAMSUNG_TV_IP || "").trim();
  if (!ip) {
    throw new Error("USE_SAMSUNG_REMOTE is enabled, but SAMSUNG_TV_IP is missing.");
  }

  const portRaw = (process.env.SAMSUNG_TV_PORT || "").trim();
  const timeoutRaw = (process.env.SAMSUNG_TV_TIMEOUT_MS || "").trim();
  const keysDelayRaw = (process.env.SAMSUNG_TV_KEYS_DELAY_MS || "").trim();

  const options = {
    ip,
    name: (process.env.SAMSUNG_REMOTE_NAME || "TV Automation").trim(),
  };

  if (portRaw) options.port = Number(portRaw);
  if (timeoutRaw) options.timeout = Number(timeoutRaw);
  if (keysDelayRaw) options.keysDelay = Number(keysDelayRaw);

  const remote = new SamsungTvRemote(options);
  let hasSentKey = false;

  return {
    async pressKey(actionKey) {
      const samsungKey = resolveSamsungKey(actionKey);
      if (!samsungKey) {
        throw new Error(
          `No Samsung key mapping for "${actionKey}". Use KEY_* in topics or add a map entry.`,
        );
      }
      await remote.sendKey(samsungKey);
      hasSentKey = true;
    },
    disconnect() {
      if (hasSentKey) {
        remote.disconnect();
      }
    },
  };
}

function logLine(message) {
  const ts = new Date().toISOString();
  fs.appendFileSync(runLogPath, `[${ts}] ${message}\n`, "utf8");
}

async function ensureRemoteMapReady(page, rl) {
  await loginAndWaitAuthenticated(page, {
    interactivePinConfirmation: true,
    waitForUserConfirmation: async () => {
      await rl.question("After entering PIN and seeing Remote Control page, press Enter to start topics...");
    },
  });
  await page.waitForTimeout(2000);

  // Optional Start click; do not fail if backend is temporarily limited.
  const startButton = page.locator("#btnRemoteStart");
  if (await startButton.isVisible().catch(() => false)) {
    const enabled = await startButton
      .evaluate((el) => !el.classList.contains("ui-state-disabled"))
      .catch(() => false);
    if (enabled) {
      await startButton.evaluate((el) => el.click());
      await page.waitForTimeout(1500);
    }
  }

  const remoteMap = page.locator("map#remote_control_TV_US");
  await remoteMap.waitFor({ state: "attached", timeout: 60000 });
  await page.locator("map#remote_control_TV_US area").first().waitFor({ state: "attached", timeout: 60000 });
}

async function pressRemoteKey(page, remoteController, keyName) {
  if (remoteController) {
    await remoteController.pressKey(keyName);
    return;
  }

  const button = page.locator(`map#remote_control_TV_US area[alt="${keyName}"]`).first();
  await button.waitFor({ state: "attached", timeout: 15000 });
  await button.evaluate((el) => el.click());
}

async function getCapturePopupPage(page, context) {
  // Wait for a newly opened popup from this click.
  const popup = await page.waitForEvent("popup", { timeout: 12000 }).catch(() => null);
  if (popup) return popup;

  // Fallback: some browsers may not surface popup event consistently,
  // and popup URLs can stay about:blank briefly before navigation.
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const capturePage = context.pages().find((p) => p !== page);
    if (capturePage) return capturePage;
    await page.waitForTimeout(250);
  }
  return null;
}

async function waitForLoadingCycleToFinish(page) {
  const loadingOverlays = page.locator(
    ".rc_virtual .box_loading, .pop_rm .box_loading, .rc_keys .box_loading",
  );
  await loadingOverlays
    .first()
    .waitFor({ state: "visible", timeout: 6000 })
    .catch(() => {});
  await loadingOverlays
    .first()
    .waitFor({ state: "hidden", timeout: 45000 })
    .catch(() => {});
}

async function triggerRmCapture(page, context, topicId) {
  // Ensure previous capture popup is closed before triggering a new one.
  const oldCapturePopups = context
    .pages()
    .filter((p) => p !== page && p.url().includes("/RemoteControl/GraphicCaptureImage"));
  for (const oldPopup of oldCapturePopups) {
    await oldPopup.close().catch(() => {});
  }

  const captureButton = page.locator("#btnGraphicCapture").first();
  await captureButton.waitFor({ state: "visible", timeout: 15000 });

  const popupPromise = getCapturePopupPage(page, context);
  const downloadPromise = context.waitForEvent("download", { timeout: 8000 }).catch(() => null);

  await captureButton.evaluate((el) => el.click());

  // RM briefly enters loading state during Graphic Capture.
  await waitForLoadingCycleToFinish(page);

  let popup = await popupPromise;
  if (!popup) {
    // If loading just finished, popup might appear shortly after.
    await waitForLoadingCycleToFinish(page);
    popup = await getCapturePopupPage(page, context);
  }
  let saved = false;
  let reason = "unknown";
  if (popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    await popup.bringToFront().catch(() => {});
    await popup.waitForTimeout(2000).catch(() => {});

    // First capture can be slower; wait for either rendered preview or fetched blob.
    await popup
      .waitForFunction(
        () => {
          const img = document.querySelector("#previewImg");
          const hasRenderedImg =
            !!img && !!img.getAttribute("src") && img.complete && img.naturalWidth > 0;
          const hasBlobBuffer = !!window.blobImg;
          return hasRenderedImg || hasBlobBuffer;
        },
        { timeout: 15000 },
      )
      .catch(() => {});

    // Save capture directly from popup image source/blob (without clicking Export).
    let captureData = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      captureData = await popup
        .evaluate(async () => {
          const imgEl = document.querySelector("#previewImg");
          const directUrl = typeof window.imgUrl === "string" ? window.imgUrl : "";
          const renderedSource = imgEl?.getAttribute("src") || "";

          let blob = null;

          // Best source: page-level blob produced by popup script.
          if (window.blobImg instanceof Blob) {
            blob = window.blobImg;
          }

          // Fallback: rendered preview source if available.
          if (!blob && renderedSource) {
            const resFromPreview = await fetch(renderedSource).catch(() => null);
            if (resFromPreview?.ok) blob = await resFromPreview.blob();
          }

          // Final fallback: fetch popup's image endpoint directly.
          if (!blob && directUrl) {
            const url = `${directUrl}${directUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
            const resFromEndpoint = await fetch(url, { cache: "no-store" }).catch(() => null);
            if (resFromEndpoint?.ok) blob = await resFromEndpoint.blob();
          }

          if (!blob) return null;
          const mime = blob.type || "image/png";
          const buffer = await blob.arrayBuffer();
          let binary = "";
          const bytes = new Uint8Array(buffer);
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode(...chunk);
          }
          const base64 = btoa(binary);
          return { base64, mime };
        })
        .catch(() => null);

      if (captureData?.base64) break;
      await popup.waitForTimeout(1000).catch(() => {});
    }

    if (captureData?.base64) {
      const extension = captureData.mime.includes("jpeg") ? "jpg" : "png";
      const targetPath = path.join(runDir, `${topicId}.${extension}`);
      fs.writeFileSync(targetPath, Buffer.from(captureData.base64, "base64"));
      console.log(`RM OSD capture saved from popup: ${targetPath}`);
      saved = true;
      reason = "saved-from-popup";
    } else {
      console.log(`Popup opened for ${topicId}, but direct image extraction failed.`);
      reason = "popup-image-extraction-failed";
    }

    await popup.close().catch(() => {});
    // Explicitly wait until popup is gone before continuing next step.
    const popupGoneDeadline = Date.now() + 5000;
    while (Date.now() < popupGoneDeadline) {
      const stillOpen = context
        .pages()
        .some((p) => p !== page && p.url().includes("/RemoteControl/GraphicCaptureImage"));
      if (!stillOpen) break;
      await page.waitForTimeout(200);
    }
  } else {
    console.log(`No capture popup detected for topic: ${topicId}`);
    reason = "no-popup-detected";
  }

  const download = await downloadPromise;
  if (download) {
    const filename = `${topicId}-${download.suggestedFilename()}`;
    const targetPath = path.join(runDir, filename);
    await download.saveAs(targetPath);
    console.log(`RM capture downloaded: ${targetPath}`);
    saved = true;
    reason = "saved-from-download";
  }

  if (!saved) {
    console.log(`RM capture triggered for topic: ${topicId}`);
  }

  return { saved, reason };
}

function toStepGroups(topicData) {
  const topicSkipCapture = Boolean(topicData?.skipCapture);
  return (topicData?.steps || []).map((s) => {
    if (Array.isArray(s)) {
      return {
        actions: s,
        captureRetries: 3,
        retryWaitMs: 800,
        skipCapture: topicSkipCapture,
      };
    }
    return {
      actions: Array.isArray(s.actions) ? s.actions : [],
      captureRetries: typeof s.captureRetries === "number" ? s.captureRetries : 3,
      retryWaitMs: typeof s.retryWaitMs === "number" ? s.retryWaitMs : 800,
      skipCapture: typeof s.skipCapture === "boolean" ? s.skipCapture : topicSkipCapture,
    };
  });
}

async function runStepActions(page, remoteController, stepId, stepGroup) {
  logLine(`STEP ${stepId}: started`);
  for (const action of stepGroup.actions) {
    if (action.type === "remote") {
      await pressRemoteKey(page, remoteController, action.key);
      logLine(`STEP ${stepId}: remote "${action.key}"`);
    } else if (action.type === "wait") {
      await page.waitForTimeout(action.ms);
      logLine(`STEP ${stepId}: wait ${action.ms}ms`);
    }
  }
}

async function run() {
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(runLogPath, "", "utf8");
  const rl = readline.createInterface({ input, output });
  const remoteController = useSamsungRemoteDriver() ? createSamsungRemoteController() : null;
  console.log(
    remoteController
      ? "Remote input mode: samsung-tv-remote package (RM UI capture button still used)"
      : "Remote input mode: RM UI remote map",
  );

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();

  const handleInterrupt = async (signal) => {
    try {
      logLine(`FLOW interrupted by ${signal}`);
    } catch {}
    try {
      rl.close();
    } catch {}
    try {
      await context.close();
      await browser.close();
    } catch {}
    process.exit(130);
  };

  process.once("SIGINT", () => {
    void handleInterrupt("SIGINT");
  });
  process.once("SIGTERM", () => {
    void handleInterrupt("SIGTERM");
  });

  try {
    const topicEntries = Array.isArray(topics)
      ? topics.map((topic, idx) => [topic.id || String(idx + 1), topic])
      : Object.entries(topics);
    const availableTopicIds = topicEntries.map(([id]) => id).join(", ");
    let startTopicId = "";

    await ensureRemoteMapReady(page, rl);
    const startAnswer = (
      await rl.question(
        `Press Enter to start from beginning, or type a topic number (${availableTopicIds}): `,
      )
    )
      .trim()
      .toLowerCase();
    if (startAnswer) {
      const matched = topicEntries.find(([id]) => id.toLowerCase() === startAnswer);
      if (!matched) {
        throw new Error(`Topic "${startAnswer}" not found. Available topics: ${availableTopicIds}`);
      }
      startTopicId = matched[0];
    }

    let startIndex = 0;
    if (startTopicId) {
      startIndex = topicEntries.findIndex(([id]) => id === startTopicId);
    }

    for (let i = startIndex; i < topicEntries.length; i += 1) {
      const [topicId, topicData] = topicEntries[i];
      if (i > startIndex) {
        const resetTopic = reset?.["0"];
        if (resetTopic) {
          logLine(`RESET before topic ${topicId}: started`);
          const resetStepGroups = toStepGroups(resetTopic);
          for (let resetStepIndex = 0; resetStepIndex < resetStepGroups.length; resetStepIndex += 1) {
            const resetStepId = `reset-0-${resetStepIndex + 1}`;
            await runStepActions(page, remoteController, resetStepId, resetStepGroups[resetStepIndex]);
          }
          logLine(`RESET before topic ${topicId}: finished`);
        }
      }
      console.log(`Running topic: ${topicId}`);
      logLine(`TOPIC ${topicId}: started`);
      const stepGroups = toStepGroups(topicData);
      for (let stepIndex = 0; stepIndex < stepGroups.length; stepIndex += 1) {
        const stepGroup = stepGroups[stepIndex];
        const stepId = `${topicId}-${stepIndex + 1}`;
        await runStepActions(page, remoteController, stepId, stepGroup);

        if (stepGroup.skipCapture) {
          logLine(`STEP ${stepId}: capture skipped`);
        } else {
          let captureResult = { saved: false, reason: "not-attempted" };
          const maxAttempts = Math.max(1, stepGroup.captureRetries);
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            captureResult = await triggerRmCapture(page, context, stepId);
            if (captureResult.saved) {
              logLine(`STEP ${stepId}: capture saved on attempt ${attempt}`);
              break;
            }
            logLine(`STEP ${stepId}: capture failed attempt ${attempt} (${captureResult.reason})`);
            if (attempt < maxAttempts) {
              await page.waitForTimeout(stepGroup.retryWaitMs);
            }
          }
          if (!captureResult.saved) {
            logLine(`STEP ${stepId}: capture NOT saved (${captureResult.reason})`);
          }
        }
      }
      logLine(`TOPIC ${topicId}: finished`);

      // Continue automatically to the next topic.
    }

    console.log(`Capture run complete: ${runDir}`);
    console.log("All configured topics finished.");
    logLine("FLOW finished");
    console.log(`Run log saved: ${runLogPath}`);
    const keepBrowserOpen = (process.env.KEEP_BROWSER_OPEN || "0").toLowerCase();
    if (["1", "true", "yes", "y"].includes(keepBrowserOpen)) {
      await page.pause();
    }
  } finally {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    remoteController?.disconnect();
    rl.close();
    await context.close();
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
