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
const { timeouts = {}, capture = {}, runModes = {}, topicPolicy = {}, healthChecks = {}, featureFlags = {}, logNaming = {} } =
  automationConfig;

const outputRoot = path.join(process.cwd(), capture.outputDir || "captures");
const runDir = outputRoot;
const logsDir = path.join(process.cwd(), "logs");
const runStamp = new Date().toISOString().replace(/[:.]/g, "-");
let runLogPath = "";
const isSingleTopicRun = process.argv.includes("--single");

function applyLogTemplate(template, topicId) {
  return String(template || "")
    .replaceAll("{topicId}", String(topicId || "unknown"))
    .replaceAll("{timestamp}", runStamp);
}

function shouldRunResetForTopic(topicIndex, startIndex) {
  if (topicIndex === startIndex) return runModes.runResetBeforeFirstTopic !== false;
  return runModes.runResetBetweenTopics !== false;
}

function getAllowedTopicSet() {
  if (!Array.isArray(topicPolicy.allowTopicIds) || topicPolicy.allowTopicIds.length === 0) {
    return null;
  }
  return new Set(topicPolicy.allowTopicIds.map((id) => String(id).toLowerCase()));
}

function normalizeActionKeyName(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveSamsungKey(actionKey) {
  const normalized = normalizeActionKeyName(actionKey);
  if (!normalized) return null;
  return normalized.startsWith("KEY_") ? normalized : null;
}

function createSamsungRemoteController() {
  const ip = (process.env.SAMSUNG_TV_IP || "").trim();
  if (!ip) {
    throw new Error("SAMSUNG_TV_IP is required for samsung-tv-remote mode.");
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
          `Invalid key "${actionKey}". Use samsung-tv-remote key names (KEY_*).`,
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
  if (!runLogPath) return;
  const ts = new Date().toISOString();
  fs.appendFileSync(runLogPath, `[${ts}] ${message}\n`, "utf8");
}

async function ensureRemoteMapReady(page) {
  await loginAndWaitAuthenticated(page, {
    interactivePinConfirmation: true,
  });
  for (const requiredPart of healthChecks.requiredUrlIncludes || []) {
    if (!page.url().includes(requiredPart)) {
      throw new Error(`Health check failed: URL does not include "${requiredPart}". Current URL: ${page.url()}`);
    }
  }

  for (const selector of healthChecks.requiredSelectors || []) {
    await page.locator(selector).first().waitFor({
      state: "attached",
      timeout: timeouts.remoteMapReadyMs ?? 60000,
    });
  }

  await page.waitForTimeout(timeouts.initialPageSettleMs ?? 2000);

  // Optional Start click; do not fail if backend is temporarily limited.
  const startButton = page.locator(automationConfig.selectors.remoteStartButton);
  if (featureFlags.enableStartButtonClick !== false && (await startButton.isVisible().catch(() => false))) {
    const enabled = await startButton
      .evaluate((el) => !el.classList.contains("ui-state-disabled"))
      .catch(() => false);
    if (enabled) {
      await startButton.evaluate((el) => el.click());
      await page.waitForTimeout(timeouts.startButtonPostClickMs ?? 1500);
    }
  }

  const remoteMap = page.locator(automationConfig.selectors.remoteMap);
  await remoteMap.waitFor({ state: "attached", timeout: timeouts.remoteMapReadyMs ?? 60000 });
  await page
    .locator(automationConfig.selectors.remoteArea)
    .first()
    .waitFor({ state: "attached", timeout: timeouts.remoteMapReadyMs ?? 60000 });
}

async function pressRemoteKey(remoteController, keyName) {
  await remoteController.pressKey(keyName);
}

async function getCapturePopupPage(page, context) {
  // Wait for a newly opened popup from this click.
  const popup = await page.waitForEvent("popup", { timeout: timeouts.popupEventMs ?? 12000 }).catch(() => null);
  if (popup) return popup;
  if (featureFlags.enablePopupFallback === false) return null;

  // Fallback: some browsers may not surface popup event consistently,
  // and popup URLs can stay about:blank briefly before navigation.
  const deadline = Date.now() + (timeouts.popupFallbackLookupMs ?? 20000);
  while (Date.now() < deadline) {
    const capturePage = context.pages().find((p) => p !== page);
    if (capturePage) return capturePage;
    await page.waitForTimeout(250);
  }
  return null;
}

async function waitForLoadingCycleToFinish(page, options = {}) {
  const {
    onInactiveTick = null,
    inactiveIntervalMs = capture.heartbeatIntervalMs ?? 10000,
    visibleTimeoutMs = timeouts.loadingVisibleMs ?? 6000,
    hiddenTimeoutMs = timeouts.loadingHiddenMs ?? 45000,
  } = options;
  const loadingOverlays = page.locator(automationConfig.selectors.loadingOverlays);
  const firstOverlay = loadingOverlays.first();

  const becameVisible = await firstOverlay
    .waitFor({ state: "visible", timeout: visibleTimeoutMs })
    .then(() => true)
    .catch(() => false);

  if (!becameVisible) {
    return;
  }

  const startedAt = Date.now();
  let lastInactiveTickAt = 0;
  while (Date.now() - startedAt < hiddenTimeoutMs) {
    const isHidden = await firstOverlay
      .isHidden()
      .catch(() => true);
    if (isHidden) {
      return;
    }

    if (onInactiveTick && Date.now() - lastInactiveTickAt >= inactiveIntervalMs) {
      await onInactiveTick();
      lastInactiveTickAt = Date.now();
    }

    await page.waitForTimeout(250);
  }
}

async function triggerRmCapture(page, context, remoteController, topicId) {
  // Ensure previous capture popup is closed before triggering a new one.
  const oldCapturePopups = context
    .pages()
    .filter((p) => p !== page && p.url().includes("/RemoteControl/GraphicCaptureImage"));
  for (const oldPopup of oldCapturePopups) {
    await oldPopup.close().catch(() => {});
  }

  const captureButton = page.locator(automationConfig.selectors.captureButton).first();
  await captureButton.waitFor({ state: "visible", timeout: timeouts.popupImageReadyMs ?? 15000 });

  const popupPromise = getCapturePopupPage(page, context);
  const downloadPromise = context.waitForEvent("download", { timeout: timeouts.downloadMs ?? 8000 }).catch(() => null);

  await captureButton.evaluate((el) => el.click());

  // RM briefly enters loading state during Graphic Capture.
  await waitForLoadingCycleToFinish(page, {
    onInactiveTick:
      featureFlags.enableHeartbeatRedKey === false
        ? null
        : async () => {
            await remoteController.pressKey(capture.heartbeatKey || "KEY_RED");
            logLine(`STEP ${topicId}: heartbeat "${capture.heartbeatKey || "KEY_RED"}" sent while RM inactive`);
          },
    inactiveIntervalMs: capture.heartbeatIntervalMs ?? 10000,
  });

  let popup = await popupPromise;
  if (!popup) {
    // If loading just finished, popup might appear shortly after.
    await waitForLoadingCycleToFinish(page, {
      onInactiveTick:
        featureFlags.enableHeartbeatRedKey === false
          ? null
          : async () => {
              await remoteController.pressKey(capture.heartbeatKey || "KEY_RED");
              logLine(`STEP ${topicId}: heartbeat "${capture.heartbeatKey || "KEY_RED"}" sent while RM inactive`);
            },
      inactiveIntervalMs: capture.heartbeatIntervalMs ?? 10000,
    });
    popup = await getCapturePopupPage(page, context);
  }
  let saved = false;
  let reason = "unknown";
  if (popup) {
    await popup.waitForLoadState("domcontentloaded", { timeout: timeouts.popupDomReadyMs ?? 10000 }).catch(() => {});
    await popup.bringToFront().catch(() => {});
    await popup.waitForTimeout(timeouts.popupInitialSettleMs ?? 2000).catch(() => {});

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
        { timeout: timeouts.popupImageReadyMs ?? 15000 },
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
      await popup.waitForTimeout(capture.popupWaitMs ?? 1000).catch(() => {});
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
    const popupGoneDeadline = Date.now() + (timeouts.popupPostCloseMs ?? 5000);
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
        captureRetries: capture.retryAttempts ?? 3,
        retryWaitMs: capture.retryWaitMs ?? 800,
        skipCapture: topicSkipCapture,
      };
    }
    return {
      actions: Array.isArray(s.actions) ? s.actions : [],
      captureRetries: typeof s.captureRetries === "number" ? s.captureRetries : (capture.retryAttempts ?? 3),
      retryWaitMs: typeof s.retryWaitMs === "number" ? s.retryWaitMs : (capture.retryWaitMs ?? 800),
      skipCapture: typeof s.skipCapture === "boolean" ? s.skipCapture : topicSkipCapture,
    };
  });
}

async function runStepActions(page, remoteController, stepId, stepGroup) {
  logLine(`STEP ${stepId}: started`);
  for (const action of stepGroup.actions) {
    if (action.type === "remote") {
      await pressRemoteKey(remoteController, action.key);
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
  const preflightLogPath = path.join(
    logsDir,
    applyLogTemplate(logNaming.pendingTemplate || "capture-pending-{timestamp}.log", "pending"),
  );
  fs.writeFileSync(preflightLogPath, "", "utf8");
  runLogPath = preflightLogPath;
  const rl = readline.createInterface({ input, output });
  const remoteController = createSamsungRemoteController();
  console.log("Remote input mode: samsung-tv-remote package (RM UI capture button still used)");

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
    const allTopicEntries = Array.isArray(topics)
      ? topics.map((topic, idx) => [topic.id || String(idx + 1), topic])
      : Object.entries(topics);
    const allowedTopicSet = getAllowedTopicSet();
    const topicEntries = allowedTopicSet
      ? allTopicEntries.filter(([id]) => allowedTopicSet.has(String(id).toLowerCase()))
      : allTopicEntries;
    if (topicEntries.length === 0) {
      throw new Error("No topics are available after applying topicPolicy.allowTopicIds.");
    }
    const availableTopicIds = topicEntries.map(([id]) => id).join(", ");
    let startTopicId = String(topicPolicy.defaultStartTopic || "").trim();

    await ensureRemoteMapReady(page);
    const promptText = isSingleTopicRun
      ? `Type one topic number to run once (${availableTopicIds}): `
      : `Press Enter to start from beginning, or type a topic number (${availableTopicIds}): `;
    const startAnswer = (await rl.question(promptText)).trim().toLowerCase();
    if ((runModes.requireTopicInSingleMode ?? true) && isSingleTopicRun && !startAnswer) {
      throw new Error(`Single-topic mode requires a topic number. Available topics: ${availableTopicIds}`);
    }
    if (startAnswer || (isSingleTopicRun && (runModes.requireTopicInSingleMode ?? true))) {
      const matched = topicEntries.find(([id]) => id.toLowerCase() === startAnswer);
      if (!matched) {
        throw new Error(`Topic "${startAnswer}" not found. Available topics: ${availableTopicIds}`);
      }
      startTopicId = matched[0];
    }

    let startIndex = 0;
    if (startTopicId) {
      startIndex = topicEntries.findIndex(([id]) => id === startTopicId);
      if (startIndex < 0) {
        throw new Error(`Default/start topic "${startTopicId}" not found. Available topics: ${availableTopicIds}`);
      }
    }
    const firstTopicId = topicEntries[startIndex]?.[0] || "unknown";
    const templatedName = isSingleTopicRun
      ? applyLogTemplate(logNaming.singleTopicTemplate, firstTopicId)
      : applyLogTemplate(logNaming.startedTopicTemplate, firstTopicId);
    const finalLogFilename = templatedName || `capture-run-${runStamp}.log`;
    const finalRunLogPath = path.join(logsDir, finalLogFilename);
    if (runLogPath !== finalRunLogPath) {
      fs.renameSync(runLogPath, finalRunLogPath);
      runLogPath = finalRunLogPath;
    }

    const configuredMax = Number(topicPolicy.maxTopicsPerRun || 0);
    const maxTopics = configuredMax > 0 ? configuredMax : Number.POSITIVE_INFINITY;
    const runLimit = isSingleTopicRun ? 1 : maxTopics;
    const endExclusive = Math.min(startIndex + runLimit, topicEntries.length);
    for (let i = startIndex; i < endExclusive; i += 1) {
      const [topicId, topicData] = topicEntries[i];
      const resetTopic = reset?.["0"];
      if (resetTopic && shouldRunResetForTopic(i, startIndex)) {
        logLine(`RESET before topic ${topicId}: started`);
        const resetStepGroups = toStepGroups(resetTopic);
        for (let resetStepIndex = 0; resetStepIndex < resetStepGroups.length; resetStepIndex += 1) {
          const resetStepId = `reset-0-${resetStepIndex + 1}`;
          await runStepActions(page, remoteController, resetStepId, resetStepGroups[resetStepIndex]);
        }
        logLine(`RESET before topic ${topicId}: finished`);
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
            captureResult = await triggerRmCapture(page, context, remoteController, stepId);
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

      // Continue automatically to the next topic (except in --single mode).
    }

    console.log(`Capture run complete: ${runDir}`);
    if (isSingleTopicRun) {
      console.log("Selected single topic finished.");
    } else {
      console.log("All configured topics finished.");
    }
    logLine("FLOW finished");
    console.log(`Run log saved: ${runLogPath}`);
    const keepBrowserOpen = (process.env[capture.keepBrowserOpenEnv || "KEEP_BROWSER_OPEN"] || "0").toLowerCase();
    if (["1", "true", "yes", "y"].includes(keepBrowserOpen)) {
      await page.pause();
    }
  } finally {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    remoteController.disconnect();
    rl.close();
    await context.close();
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
