import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import dotenv from "dotenv";
import { chromium } from "playwright";
import samsungTvRemotePkg from "samsung-tv-remote";
import { automationConfig } from "../config/automationConfig.js";
import { loginAndWaitAuthenticated } from "../lib/loginFlow.js";

dotenv.config();

const { SamsungTvRemote } = samsungTvRemotePkg;
const { timeouts = {}, capture = {}, runModes = {}, topicPolicy = {}, healthChecks = {}, featureFlags = {}, logNaming = {} } =
  automationConfig;

const capturesRootDir = path.join(process.cwd(), capture.outputDir || "captures");
/** Canonical reuse plan next to PNGs for a topic pack (e.g. captures/2026tv/reuse-plan.json). */
const REUSE_PLAN_FILENAME = "reuse-plan.json";
let runDir = capturesRootDir;
const logsDir = path.join(process.cwd(), "logs");
/** Minute-level stamp for run folder/log naming (no seconds or milliseconds). */
const runStamp = new Date().toISOString().slice(0, 16).replace(/:/g, "-");
const runLogDir = path.join(logsDir, `run-${runStamp}`);
let runLogPath = "";
let runSummaryLogPath = "";
let runFailuresLogPath = "";
let reset = {};
let topics = {};
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** File basename for captures: drop leading `g_` when present (e.g. `g_2-1` → `2-1`). */
function captureFileStem(id) {
  const s = String(id || "");
  return s.startsWith("g_") ? s.slice(2) : s;
}

/** @returns {Promise<void>} */
async function closeBrowserWithTimeout(browser, timeoutMs = 45000) {
  await Promise.race([
    browser.close().catch(() => {}),
    delay(timeoutMs),
  ]);
}

function resolveSessionStorageStatePath() {
  const configured = (process.env.RMUS_STORAGE_STATE_PATH || ".cache/rmus-storage-state.json").trim();
  return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
}

function resolveTopicsFileName() {
  const cliArg = process.argv.find((arg) => arg.startsWith("--topics="));
  const rawValue = (cliArg?.slice("--topics=".length) || process.env.TOPICS_FILE || "2026tv").trim();
  if (!rawValue) return "2026tv.mjs";
  return rawValue.endsWith(".mjs") ? rawValue : `${rawValue}.mjs`;
}

/** Optional JSON overlay: same shape as a saved `reuse-plan.json` (`decisions` object). */
function resolveReusePlanOverlayPath() {
  const cliArg = process.argv.find((arg) => arg.startsWith("--reuse-plan="));
  const fromCli = cliArg?.slice("--reuse-plan=".length)?.trim() ?? "";
  const fromEnv = (process.env.REUSE_PLAN_PATH || "").trim();
  const raw = fromCli || fromEnv;
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

function loadReusePlanDecisionsFromFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  if (!data || typeof data.decisions !== "object" || data.decisions === null) {
    throw new Error(`Reuse plan file "${filePath}" must contain a "decisions" object.`);
  }
  return data.decisions;
}

function mergeReusePlanDecisions(basePlanMap, overlayDecisions) {
  const merged = new Map(basePlanMap);
  for (const [k, v] of Object.entries(overlayDecisions)) {
    merged.set(k, v);
  }
  return merged;
}

function countPlanReuseEntries(planByCaptureId) {
  let n = 0;
  for (const v of planByCaptureId.values()) {
    if (v?.decision === "manual-reuse" || v?.decision === "fingerprint-reuse") n += 1;
  }
  return n;
}

function topicStatsForPlan(topicEntries, startIndex, endExclusive, planByCaptureId) {
  const out = [];
  for (let i = startIndex; i < endExclusive; i += 1) {
    const [topicId, topicData] = topicEntries[i];
    const stepGroups = toStepGroups(topicData);
    let captureEligible = 0;
    let reusable = 0;
    for (let stepIndex = 0; stepIndex < stepGroups.length; stepIndex += 1) {
      const stepId = `${topicId}-${stepIndex + 1}`;
      let savingCaptureOrdinal = 0;
      for (const act of stepGroups[stepIndex].actions) {
        if (act?.type !== "capture") continue;
        if (normalizeCaptureMode(act) === "skip") continue;
        savingCaptureOrdinal += 1;
        const captureId = getCaptureId(stepId, savingCaptureOrdinal);
        captureEligible += 1;
        const ent = planByCaptureId.get(captureId);
        if (ent?.decision === "manual-reuse" || ent?.decision === "fingerprint-reuse") reusable += 1;
      }
    }
    out.push({
      topicId,
      totalSteps: stepGroups.length,
      captureEligibleSteps: captureEligible,
      reusableSteps: reusable,
    });
  }
  return out;
}

function resolveRunDirForTopicsFile(topicsFileName) {
  const topicsBaseName = path.parse(topicsFileName).name;
  const modeOutputSubdirs = capture.modeOutputSubdirs || {};
  const mappedSubdir =
    modeOutputSubdirs[topicsFileName] ??
    modeOutputSubdirs[topicsBaseName] ??
    "";
  const normalizedSubdir = String(mappedSubdir || "").trim();
  if (!normalizedSubdir) return capturesRootDir;
  return path.join(capturesRootDir, normalizedSubdir);
}

async function loadTopicInstructions() {
  const topicsFileName = resolveTopicsFileName();
  const topicsFilePath = path.join(process.cwd(), "scripts", topicsFileName);
  if (!fs.existsSync(topicsFilePath)) {
    throw new Error(
      `Topics file not found: ${topicsFileName}. Expected path: ${topicsFilePath}`,
    );
  }

  const topicsModule = await import(`./${topicsFileName}`);
  const loadedTopics = topicsModule.topics;
  const loadedReset = topicsModule.reset;
  if (!loadedTopics || typeof loadedTopics !== "object") {
    throw new Error(`Topics file "${topicsFileName}" must export a "topics" object.`);
  }
  if (!loadedReset || typeof loadedReset !== "object") {
    throw new Error(`Topics file "${topicsFileName}" must export a "reset" object.`);
  }

  return { topicsFileName, loadedTopics, loadedReset };
}

function applyLogTemplate(template, topicId) {
  return String(template || "")
    .replaceAll("{topicId}", String(topicId || "unknown"))
    .replaceAll("{timestamp}", runStamp);
}

function formatTopicLabel(topicId, topicData) {
  const rawLabel = topicData?.slug || topicData?.topic || "";
  const label = String(rawLabel).trim();
  return label ? `${topicId}: ${label}` : String(topicId);
}

function getTopicSlug(topicData) {
  return String(topicData?.slug || "").trim();
}

function logTopicStarted(topicId, topicData) {
  const topicSlug = getTopicSlug(topicData);
  if (topicSlug) {
    logLine(`TOPIC SLUG: ${topicSlug}`);
    logSummaryLine(`TOPIC SLUG: ${topicSlug}`);
  }
  logLine(`TOPIC ${topicId}: started`);
  logSummaryLine(`TOPIC ${topicId}: started`);
}

function getPrefixedTopicNumber(topicId) {
  const match = String(topicId || "").trim().toLowerCase().match(/^[a-z]+_(\d+)$/);
  return match?.[1] || null;
}

function findTopicEntry(topicEntries, rawTopicId) {
  const requestedTopicId = String(rawTopicId || "").trim().toLowerCase();
  if (!requestedTopicId) return null;

  const exactMatch = topicEntries.find(([id]) => String(id).toLowerCase() === requestedTopicId);
  if (exactMatch) return exactMatch;
  if (!/^\d+$/.test(requestedTopicId)) return null;

  const aliasMatches = topicEntries.filter(([id]) => getPrefixedTopicNumber(id) === requestedTopicId);
  if (aliasMatches.length > 1) {
    const matchingTopicIds = aliasMatches.map(([id]) => id).join(", ");
    throw new Error(`Topic "${rawTopicId}" is ambiguous. Matching topics: ${matchingTopicIds}`);
  }

  return aliasMatches[0] || null;
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

function logSummaryLine(message) {
  if (!runSummaryLogPath) return;
  const ts = new Date().toISOString();
  fs.appendFileSync(runSummaryLogPath, `[${ts}] ${message}\n`, "utf8");
}

function logFailuresLine(message) {
  if (!runFailuresLogPath) return;
  const ts = new Date().toISOString();
  fs.appendFileSync(runFailuresLogPath, `[${ts}] ${message}\n`, "utf8");
}

/** @param {boolean} [alsoSummary] When false, only the detailed log is written (e.g. retry attempts). */
function logCaptureFailure(message, alsoSummary = true) {
  const line = `***** ${message} *****`;
  logLine(line);
  logFailuresLine(line);
  if (alsoSummary) logSummaryLine(line);
}

async function waitForUrlIncludes(page, requiredPart, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (page.url().includes(requiredPart)) {
      return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

async function ensureRemoteMapReady(page, rl) {
  await loginAndWaitAuthenticated(page, {
    interactivePinConfirmation: true,
  });
  for (const requiredPart of healthChecks.requiredUrlIncludes || []) {
    const matched = await waitForUrlIncludes(page, requiredPart, timeouts.remoteMapReadyMs ?? 60000);
    if (!matched) {
      throw new Error(`Health check failed: URL does not include "${requiredPart}". Current URL: ${page.url()}`);
    }
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

  // Wait for #btnGraphicCapture to be visible — the definitive sign the remote session is active
  // and the UI is fully unlocked. map#remote_control_TV_US exists in static HTML even on the
  // login page, so DOM attachment alone is not a reliable readiness signal.
  // The long timeout also gives the user time to enter a PIN/OTP if a fresh login was needed.
  const readyTimeoutMs = timeouts.remoteMapReadyMs ?? 60000;
  const captureReady = await page
    .locator(automationConfig.selectors.captureButton)
    .waitFor({ state: "visible", timeout: readyTimeoutMs })
    .then(() => true)
    .catch(() => false);

  if (captureReady) {
    // Short buffer after the button appears to let the backend channel fully stabilise.
    const settleMs = timeouts.remoteReadySettleMs ?? 2000;
    console.log(`Remote Control UI is ready. Waiting ${settleMs}ms for backend to stabilise…`);
    await page.waitForTimeout(settleMs);
  } else {
    // Capture button never appeared — PIN still needed or session problem.
    // Fall back to a manual gate so the user can complete login before topics begin.
    console.log(
      `Remote Control UI not ready after ${readyTimeoutMs / 1000}s. Complete login / enter PIN in the browser.`,
    );
    await rl.question("Press Enter once the Remote Control page is fully loaded and enabled… ");
  }
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

    // Some RM overlays remain attached and can report as visible even when effectively inactive.
    // Treat those as finished to avoid stalling capture flow.
    const isEffectivelyInactive = await firstOverlay
      .evaluate((el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const opacity = Number.parseFloat(style.opacity || "1");
        const hiddenByStyle =
          style.display === "none" ||
          style.visibility === "hidden" ||
          opacity <= 0 ||
          rect.width === 0 ||
          rect.height === 0;
        const hiddenByClass = el.classList.contains("hidden") || el.classList.contains("hide");
        return hiddenByStyle || hiddenByClass;
      })
      .catch(() => true);
    if (isEffectivelyInactive) {
      return;
    }

    if (onInactiveTick && Date.now() - lastInactiveTickAt >= inactiveIntervalMs) {
      await onInactiveTick();
      lastInactiveTickAt = Date.now();
    }

    await page.waitForTimeout(250);
  }
}

async function closeCapturePopups(context, page) {
  const oldCapturePopups = context
    .pages()
    .filter((p) => p !== page && p.url().includes("/RemoteControl/GraphicCaptureImage"));
  for (const oldPopup of oldCapturePopups) {
    await oldPopup.close().catch(() => {});
  }
}

async function logCapturePopupDiagnostics(popup, stepId) {
  const diag = await popup
    .evaluate(() => {
      const img = document.querySelector("#previewImg");
      const src = img?.getAttribute("src") || "";
      const bi = window.blobImg;
      const iu = typeof window.imgUrl === "string" ? window.imgUrl : "";
      let canvasErr = "";
      if (img?.complete && img.naturalWidth > 0) {
        try {
          const cnv = document.createElement("canvas");
          cnv.width = img.naturalWidth;
          cnv.height = img.naturalHeight;
          const ctx = cnv.getContext("2d");
          if (!ctx) canvasErr = "no-2d-context";
          else {
            ctx.drawImage(img, 0, 0);
            cnv.toDataURL("image/png");
          }
        } catch (e) {
          canvasErr = String(e?.message || e);
        }
      }
      return {
        pathname: typeof location !== "undefined" ? location.pathname : "",
        hasPreviewImg: !!img,
        previewSrcScheme: src.length ? `${src.slice(0, 24)}…` : "",
        previewSrcLength: src.length,
        imgComplete: !!img?.complete,
        naturalWidth: img?.naturalWidth ?? 0,
        naturalHeight: img?.naturalHeight ?? 0,
        blobImgKind:
          bi == null ? "absent" : bi instanceof Blob ? "Blob" : Object.prototype.toString.call(bi),
        blobImgSize: bi instanceof Blob ? bi.size : null,
        hasImgUrl: iu.length > 0,
        imgUrlLength: iu.length,
        canvasProbeError: canvasErr || null,
      };
    })
    .catch((e) => ({ diagEvaluateError: String(e?.message || e) }));

  logLine(`STEP ${stepId}: capture popup diagnostics ${JSON.stringify(diag)}`);
}

async function triggerRmCapture(page, context, remoteController, topicId, options = {}) {
  const { reuseExistingPopup = false } = options;
  if (!reuseExistingPopup) {
    // Ensure previous capture popup is closed before triggering a new one.
    await closeCapturePopups(context, page);
  }

  const captureButton = page.locator(automationConfig.selectors.captureButton).first();
  await captureButton.waitFor({ state: "visible", timeout: timeouts.popupImageReadyMs ?? 15000 });

  let downloadPromise = Promise.resolve(null);
  let popup = context
    .pages()
    .find((p) => p !== page && p.url().includes("/RemoteControl/GraphicCaptureImage"));

  if (!reuseExistingPopup || !popup) {
    const popupPromise = getCapturePopupPage(page, context);
    downloadPromise = context.waitForEvent("download", { timeout: timeouts.downloadMs ?? 8000 }).catch(() => null);
    await captureButton.evaluate((el) => el.click());
    // Prioritize popup acquisition first; extraction should start as soon as popup is available.
    popup = await popupPromise;
    if (!popup) {
      // If popup was not detected yet, wait for RM loading cycle and retry popup lookup.
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
    const popupEvaluateMs = timeouts.popupEvaluateMs ?? 120000;
    const popupBlobFetchMs = timeouts.popupBlobFetchMs ?? 45000;
    const popupBlobImgWaitMs = timeouts.popupBlobImgWaitMs ?? 12000;
    const popupExtractAttempts = Math.max(1, capture.popupExtractAttempts ?? 8);
    const enablePreviewScreenshotFallback = capture.enablePreviewScreenshotFallback === true;
    let captureData = null;
    let previewScreenshotBuf = null;
    let lastExtractFailure = /** @type {{ ok: false; stage: string; detail?: string } | null} */ (null);
    for (let attempt = 1; attempt <= popupExtractAttempts; attempt += 1) {
      /** Playwright Page.evaluate only accepts (fn, arg); timeout must not be passed as a 3rd argument. */
      const extractEvaluatePromise = popup.evaluate(
          async ({ fetchMs, blobImgWaitMs }) => {
            async function timedFetch(url, init = {}) {
              try {
                const ms = fetchMs;
                if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
                  return await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
                }
                const ac = new AbortController();
                const timer = setTimeout(() => ac.abort(), ms);
                try {
                  return await fetch(url, { ...init, signal: ac.signal });
                } finally {
                  clearTimeout(timer);
                }
              } catch {
                return null;
              }
            }

            /** @returns {{ ok: true; base64: string; mime: string } | { ok: false; stage: string; detail?: string }} */
            async function blobToPayload(blob, stage) {
              const mime = blob.type || "image/png";
              let readerErr = "";
              try {
                const dataUrl = await new Promise((resolve, reject) => {
                  const fr = new FileReader();
                  fr.onload = () => resolve(fr.result);
                  fr.onerror = () => reject(fr.error || new Error("FileReader failed"));
                  fr.readAsDataURL(blob);
                });
                const str = String(dataUrl);
                const comma = str.indexOf(",");
                if (comma >= 0) return { ok: true, base64: str.slice(comma + 1), mime };
                readerErr = "dataUrl-no-comma";
              } catch (e) {
                readerErr = String(e?.message || e);
              }
              try {
                const buffer = await blob.arrayBuffer();
                let binary = "";
                const bytes = new Uint8Array(buffer);
                const sliceLen = 8192;
                for (let i = 0; i < bytes.length; i += sliceLen) {
                  const part = bytes.subarray(i, Math.min(i + sliceLen, bytes.length));
                  binary += String.fromCharCode.apply(null, part);
                }
                return { ok: true, base64: btoa(binary), mime };
              } catch (e2) {
                return {
                  ok: false,
                  stage,
                  detail: `FileReader:${readerErr};binary:${String(e2?.message || e2)}`,
                };
              }
            }

            async function waitForBlobImg(maxWaitMs) {
              const step = 250;
              const deadline = Date.now() + maxWaitMs;
              while (Date.now() < deadline) {
                if (window.blobImg instanceof Blob) return window.blobImg;
                await new Promise((r) => setTimeout(r, step));
              }
              return window.blobImg instanceof Blob ? window.blobImg : null;
            }

            function payloadFromPreviewCanvas(imgEl) {
              if (!imgEl?.complete || imgEl.naturalWidth <= 0) return null;
              try {
                const cnv = document.createElement("canvas");
                cnv.width = imgEl.naturalWidth;
                cnv.height = imgEl.naturalHeight;
                const ctx = cnv.getContext("2d");
                if (!ctx) return null;
                ctx.drawImage(imgEl, 0, 0);
                const dataUrl = cnv.toDataURL("image/png");
                const comma = dataUrl.indexOf(",");
                if (comma < 0) return null;
                return { base64: dataUrl.slice(comma + 1), mime: "image/png" };
              } catch {
                return null;
              }
            }

            const imgEl = document.querySelector("#previewImg");
            const directUrl = typeof window.imgUrl === "string" ? window.imgUrl : "";
            const renderedSource = imgEl?.getAttribute("src") || "";

            let blobReadFail = /** @type {{ ok: false; stage: string; detail?: string } | null} */ (null);

            const rmBlob =
              (await waitForBlobImg(blobImgWaitMs)) ||
              (window.blobImg instanceof Blob ? window.blobImg : null);
            if (rmBlob) {
              const br = await blobToPayload(rmBlob, "window.blobImg-read");
              if (br.ok) return br;
              blobReadFail = br;
            }

            const fromCanvas = payloadFromPreviewCanvas(imgEl);
            if (fromCanvas) return { ok: true, base64: fromCanvas.base64, mime: fromCanvas.mime };

            const hints = [];
            if (!imgEl) hints.push("no-#previewImg");
            else {
              if (!imgEl.complete) hints.push("img-incomplete");
              if (imgEl.naturalWidth <= 0) hints.push("img-natural-dims-zero");
              if (renderedSource && !fromCanvas && imgEl.complete && imgEl.naturalWidth > 0) {
                hints.push("canvas-failed-or-tainted");
              }
            }
            if (!rmBlob) hints.push(`no-window.blobImg-after-${blobImgWaitMs}ms`);

            let blob = null;

            if (renderedSource) {
              const resFromPreview = await timedFetch(renderedSource);
              if (resFromPreview?.ok) {
                blob = await resFromPreview.blob().catch(() => null);
                if (!blob?.size) hints.push("preview-fetch-blob-empty");
              } else {
                hints.push(`preview-fetch:${resFromPreview?.status ?? "null-or-aborted"}`);
              }
            } else hints.push("no-preview-src-attr");

            if (!blob && directUrl) {
              const url = `${directUrl}${directUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;
              const resFromEndpoint = await timedFetch(url, { cache: "no-store" });
              if (resFromEndpoint?.ok) {
                blob = await resFromEndpoint.blob().catch(() => null);
                if (!blob?.size) hints.push("imgUrl-fetch-blob-empty");
              } else {
                hints.push(`imgUrl-fetch:${resFromEndpoint?.status ?? "null-or-aborted"}`);
              }
            } else if (!blob && !directUrl) hints.push("no-window.imgUrl");

            if (!blob) {
              const blobFailHint = blobReadFail
                ? `${blobReadFail.stage}${blobReadFail.detail ? `(${blobReadFail.detail})` : ""}`
                : "";
              const detail = [blobFailHint, hints.filter(Boolean).join("; ")].filter(Boolean).join(" | ");
              return {
                ok: false,
                stage: "no-image-bytes",
                detail: detail || undefined,
              };
            }

            const fr = await blobToPayload(blob, "fetched-blob-read");
            if (fr.ok) return fr;
            return fr;
          },
          { fetchMs: popupBlobFetchMs, blobImgWaitMs: popupBlobImgWaitMs },
      );

      let extractResult;
      try {
        extractResult = await Promise.race([
          extractEvaluatePromise,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`evaluate-timeout-after-${popupEvaluateMs}ms`)),
              popupEvaluateMs,
            ),
          ),
        ]);
      } catch (e) {
        extractResult = {
          ok: false,
          stage: "evaluate-exception",
          detail: String(e?.message || e || "unknown"),
        };
      }

      if (extractResult?.ok === true) {
        captureData = { base64: extractResult.base64, mime: extractResult.mime };
        break;
      }

      lastExtractFailure =
        extractResult && extractResult.ok === false
          ? extractResult
          : { ok: false, stage: "evaluate-null", detail: "non-object-result" };

      logLine(
        `STEP ${topicId}: extract attempt ${attempt}/${popupExtractAttempts} → ${lastExtractFailure.stage}` +
          (lastExtractFailure.detail ? `: ${lastExtractFailure.detail}` : ""),
      );

      if (enablePreviewScreenshotFallback) {
        try {
          const previewLoc = popup.locator("#previewImg").first();
          await previewLoc.waitFor({ state: "visible", timeout: timeouts.popupImageReadyMs ?? 15000 });
          previewScreenshotBuf = await previewLoc.screenshot({
            type: "png",
            timeout: timeouts.previewScreenshotMs ?? 30000,
          });
          if (previewScreenshotBuf && previewScreenshotBuf.length > 50) break;
        } catch {
          previewScreenshotBuf = null;
        }
      }

      await popup.waitForTimeout(capture.popupWaitMs ?? 1500).catch(() => {});
    }

    if (captureData?.base64) {
      const extension = captureData.mime.includes("jpeg") ? "jpg" : "png";
      const targetPath = path.join(runDir, `${captureFileStem(topicId)}.${extension}`);
      fs.writeFileSync(targetPath, Buffer.from(captureData.base64, "base64"));
      console.log(`RM OSD capture saved from popup: ${targetPath}`);
      saved = true;
      reason = "saved-from-popup";
      await popup.close().catch(() => {});
      const popupGoneDeadline = Date.now() + (timeouts.popupPostCloseMs ?? 5000);
      while (Date.now() < popupGoneDeadline) {
        const stillOpen = context
          .pages()
          .some((p) => p !== page && p.url().includes("/RemoteControl/GraphicCaptureImage"));
        if (!stillOpen) break;
        await page.waitForTimeout(200);
      }
    } else if (previewScreenshotBuf && previewScreenshotBuf.length > 50) {
      const targetPath = path.join(runDir, `${captureFileStem(topicId)}.png`);
      fs.writeFileSync(targetPath, previewScreenshotBuf);
      console.log(`RM OSD capture saved from preview screenshot: ${targetPath}`);
      saved = true;
      reason = "saved-from-preview-screenshot";
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
      console.log(`Popup opened for ${topicId}, but direct image extraction failed.`);
      reason = "popup-image-extraction-failed";
      if (lastExtractFailure) {
        logLine(
          `STEP ${topicId}: extract exhausted (${popupExtractAttempts} attempts) → ${lastExtractFailure.stage}` +
            (lastExtractFailure.detail ? `: ${lastExtractFailure.detail}` : ""),
        );
      }
      await logCapturePopupDiagnostics(popup, topicId);
      // Keep popup open so the next retry can use reuseExistingPopup without clicking Capture again.
    }
  } else {
    console.log(`No capture popup detected for topic: ${topicId}`);
    reason = "no-popup-detected";
  }

  const download = await downloadPromise;
  if (download) {
    const filename = `${captureFileStem(topicId)}-${download.suggestedFilename()}`;
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

function normalizeCaptureMode(action = {}) {
  const raw = action?.mode;
  const mode = raw == null || String(raw).trim() === "" ? "screen" : String(raw).trim().toLowerCase();
  if (mode === "reuse") return "reuse";
  if (mode === "skip") return "skip";
  if (mode === "screen") return "screen";
  return "screen";
}

function normalizeCaptureAction(action = {}, defaults = {}) {
  const hasMode = action?.mode != null && String(action.mode).trim() !== "";
  const mode =
    defaults.forceLiveCapture && !hasMode
      ? "screen"
      : normalizeCaptureMode(action);
  return {
    ...action,
    type: "capture",
    mode,
    reuseImage: action?.reuseImage ?? action?.sourceStepId ?? defaults.reuseImage ?? null,
    skipLiveCapture:
      typeof action?.skipLiveCapture === "boolean"
        ? action.skipLiveCapture
        : (typeof defaults.skipLiveCapture === "boolean" ? defaults.skipLiveCapture : mode === "reuse"),
    captureRetries:
      typeof action?.captureRetries === "number"
        ? action.captureRetries
        : defaults.captureRetries,
    retryWaitMs:
      typeof action?.retryWaitMs === "number"
        ? action.retryWaitMs
        : defaults.retryWaitMs,
  };
}

function normalizeStepActions(actions = [], defaults = {}) {
  return actions
    .filter(Boolean)
    .map((action) => (action?.type === "capture" ? normalizeCaptureAction(action, defaults) : action));
}

function toStepGroups(topicData) {
  const baseDefaults = {
    captureRetries: capture.retryAttempts ?? 4,
    retryWaitMs: capture.retryWaitMs ?? 800,
    reuseImage: null,
    skipLiveCapture: null,
    forceLiveCapture: false,
  };

  return (topicData?.steps || []).map((s) => {
    if (Array.isArray(s)) {
      return {
        actions: normalizeStepActions(s, baseDefaults),
      };
    }

    const objectActions = Array.isArray(s.actions) ? s.actions : [];
    const stepDefaults = {
      captureRetries:
        typeof s.captureRetries === "number"
          ? s.captureRetries
          : baseDefaults.captureRetries,
      retryWaitMs:
        typeof s.retryWaitMs === "number" ? s.retryWaitMs : baseDefaults.retryWaitMs,
      reuseImage: s.reuseImage ?? null,
      skipLiveCapture:
        typeof s.skipLiveCapture === "boolean" ? s.skipLiveCapture : null,
      forceLiveCapture:
        typeof s.forceLiveCapture === "boolean" ? s.forceLiveCapture : false,
    };
    return {
      actions: normalizeStepActions(objectActions, stepDefaults),
    };
  });
}

function actionToSignature(action) {
  const type = String(action?.type || "unknown");
  if (type === "remote") return `remote:${String(action?.key || "")}`;
  if (type === "wait") return `wait:${Number(action?.ms || 0)}`;
  return `${type}:${JSON.stringify(action ?? {})}`;
}

function getDefaultStepWaitMs() {
  return Math.max(0, Number(timeouts.defaultStepWaitMs ?? 800));
}

function appendNormalizedActionSignatures(signatures, actions, index) {
  const defaultStepWaitMs = getDefaultStepWaitMs();
  const action = actions[index];
  if (action?.type === "remote" || action?.type === "wait") {
    signatures.push(actionToSignature(action));
    if (action?.type === "remote") {
      const nextAction = actions[index + 1];
      const hasExplicitWait = nextAction?.type === "wait";
      if (!hasExplicitWait && defaultStepWaitMs > 0) {
        signatures.push(`wait:${defaultStepWaitMs}`);
      }
    }
  }
}

function getCaptureId(stepId, captureOrdinal) {
  return captureOrdinal <= 1 ? stepId : `${stepId}-capture${captureOrdinal}`;
}

function buildStepFingerprint(resetApplied, actionSignatures) {
  return `reset:${resetApplied ? "1" : "0"}|${actionSignatures.join("|")}`;
}

function buildReusePlan(topicEntries, startIndex, endExclusive) {
  const fingerprintToSourceStepId = new Map();
  const planByCaptureId = new Map();
  const topicStats = [];
  let totalSteps = 0;
  let captureEligibleSteps = 0;
  let reusableSteps = 0;

  for (let i = startIndex; i < endExclusive; i += 1) {
    const [topicId, topicData] = topicEntries[i];
    const stepGroups = toStepGroups(topicData);
    const resetApplied = Boolean(reset?.["0"] && shouldRunResetForTopic(i, startIndex));
    /**
     * Remote/wait signatures from topic start: for each entry in `steps`, only actions from index 0
     * of that step's array, in order, through the current step up to each capture (then capture-slot markers).
     * Slot markers use a per-topic 1-based index so two topics with identical remote chains get identical fingerprints.
     * Matches require the same whole chain since steps[0], not an isolated identical step later.
     */
    const prefixActionSignatures = [];
    /** 1-based index of saving captures in this topic only (for fingerprint anchors — avoids g_2-1 vs g_3-1 skewing later keys). */
    let topicFingerprintCaptureSeq = 0;
    let topicReusable = 0;
    let topicCaptureEligible = 0;
    for (let stepIndex = 0; stepIndex < stepGroups.length; stepIndex += 1) {
      const stepGroup = stepGroups[stepIndex];
      const stepId = `${topicId}-${stepIndex + 1}`;
      totalSteps += 1;
      let savingCaptureOrdinal = 0;

      for (let actionIndex = 0; actionIndex < stepGroup.actions.length; actionIndex += 1) {
        const action = stepGroup.actions[actionIndex];
        if (action?.type !== "capture") {
          appendNormalizedActionSignatures(prefixActionSignatures, stepGroup.actions, actionIndex);
          continue;
        }

        const mode = normalizeCaptureMode(action);
        if (mode === "skip") continue;

        savingCaptureOrdinal += 1;
        const captureId = getCaptureId(stepId, savingCaptureOrdinal);
        captureEligibleSteps += 1;
        topicCaptureEligible += 1;
        const fingerprint = buildStepFingerprint(resetApplied, prefixActionSignatures);

        if (mode === "reuse") {
          reusableSteps += 1;
          topicReusable += 1;
          planByCaptureId.set(captureId, {
            decision: "manual-reuse",
            sourceStepId: action.reuseImage || "previous",
            fingerprint,
          });
          fingerprintToSourceStepId.set(fingerprint, captureId);
          topicFingerprintCaptureSeq += 1;
          prefixActionSignatures.push(`__capture_anchor:${topicFingerprintCaptureSeq}__`);
          continue;
        }

        if (fingerprintToSourceStepId.has(fingerprint)) {
          const sourceId = fingerprintToSourceStepId.get(fingerprint);
          reusableSteps += 1;
          topicReusable += 1;
          planByCaptureId.set(captureId, {
            decision: "fingerprint-reuse",
            sourceStepId: sourceId,
            fingerprint,
          });
        } else {
          planByCaptureId.set(captureId, {
            decision: "capture",
            sourceStepId: null,
            fingerprint,
            forceLiveCapture: true,
          });
          fingerprintToSourceStepId.set(fingerprint, captureId);
        }
        topicFingerprintCaptureSeq += 1;
        prefixActionSignatures.push(`__capture_anchor:${topicFingerprintCaptureSeq}__`);
      }
    }
    topicStats.push({
      topicId,
      totalSteps: stepGroups.length,
      captureEligibleSteps: topicCaptureEligible,
      reusableSteps: topicReusable,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      topics: endExclusive - startIndex,
      totalSteps,
      captureEligibleSteps,
      reusableSteps,
      newCaptureSteps: captureEligibleSteps - reusableSteps,
    },
    topicStats,
    planByCaptureId,
  };
}

function getStepCapturePath(stepId) {
  const extensions = [".png", ".jpg", ".jpeg"];
  const raw = String(stepId || "");
  const stems = [];
  const stem = captureFileStem(stepId);
  stems.push(stem);
  if (raw !== stem) stems.push(raw);
  for (const base of stems) {
    for (const extension of extensions) {
      const candidate = path.join(runDir, `${base}${extension}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function tryReuseCapture(sourceStepId, targetStepId) {
  const sourcePath = getStepCapturePath(sourceStepId);
  if (!sourcePath) {
    return { copied: false, reason: `source-not-found:${sourceStepId}` };
  }
  const extension = path.extname(sourcePath) || ".png";
  const targetPath = path.join(runDir, `${captureFileStem(targetStepId)}${extension}`);
  fs.copyFileSync(sourcePath, targetPath);
  return { copied: true, sourcePath, targetPath };
}

async function runCaptureAction(page, context, remoteController, captureId, action, captureState, planByCaptureIdForRun = null) {
  const mode = normalizeCaptureMode(action);
  if (mode === "skip") {
    logLine(`STEP ${captureId}: capture skipped`);
    return;
  }

  const planEntry = planByCaptureIdForRun?.get?.(captureId) ?? null;
  /** Topic `mode: "reuse"` wins over reuse-plan `decision: "capture"` or plan file-reuse sources. */
  const topicDeclaresReuse = mode === "reuse";
  const forceLiveFromPlan = planEntry?.decision === "capture" && !topicDeclaresReuse;
  /** Plan said file reuse but copy did not succeed — still take live capture even if topic `mode: "reuse"` defaults to skipLiveCapture. */
  let planReuseFileMissingTryLive = false;

  if (topicDeclaresReuse && planEntry) {
    logLine(
      `STEP ${captureId}: topic mode "reuse" overrides reuse-plan (plan decision: ${planEntry.decision ?? "?"})`,
    );
  }

  if (
    !topicDeclaresReuse &&
    planEntry &&
    (planEntry.decision === "manual-reuse" || planEntry.decision === "fingerprint-reuse")
  ) {
    const requestedSource = String(planEntry.sourceStepId ?? "previous").trim();
    const sourceStepId =
      requestedSource.toLowerCase() === "previous" ? captureState.lastCapturedStepId : requestedSource;
    if (sourceStepId) {
      const reuseResult = tryReuseCapture(sourceStepId, captureId);
      if (reuseResult.copied) {
        const tag =
          planEntry.decision === "fingerprint-reuse" ? "fingerprint-reuse (plan)" : "manual-reuse (plan)";
        const reuseMsg = `STEP ${captureId}: capture reused from ${sourceStepId} (${path.basename(reuseResult.sourcePath)} -> ${path.basename(reuseResult.targetPath)}) [${tag}]`;
        logLine(reuseMsg);
        logSummaryLine(reuseMsg);
        console.log(`RM OSD capture reused [${tag}]: ${reuseResult.targetPath} (from ${reuseResult.sourcePath})`);
        captureState.lastCapturedStepId = captureId;
        await waitAfterReuse(page, captureId);
        return;
      }
      planReuseFileMissingTryLive = true;
      logCaptureFailure(
        `STEP ${captureId}: plan reuse failed (${reuseResult.reason}); attempting live capture`,
        false,
      );
      logLine(`STEP ${captureId}: reuse-plan source file not found for ${sourceStepId} — falling back to RM popup capture`);
      console.log(`STEP ${captureId}: reuse-plan file missing (${reuseResult.reason}) — live RM capture`);
    } else {
      planReuseFileMissingTryLive = true;
      logCaptureFailure(`STEP ${captureId}: plan reuse failed (no-previous-capture); attempting live capture`, false);
      logLine(`STEP ${captureId}: reuse-plan had no usable source — falling back to RM popup capture`);
      console.log(`STEP ${captureId}: reuse-plan had no previous capture — live RM capture`);
    }
  }

  if (mode === "reuse" && !forceLiveFromPlan) {
    const requestedSource = String(action.reuseImage || action.sourceStepId || "previous").trim();
    const sourceStepId =
      requestedSource.toLowerCase() === "previous" ? captureState.lastCapturedStepId : requestedSource;
    if (sourceStepId) {
      const reuseResult = tryReuseCapture(sourceStepId, captureId);
      if (reuseResult.copied) {
        const reuseMsg = `STEP ${captureId}: capture reused from ${sourceStepId} (${path.basename(reuseResult.sourcePath)} -> ${path.basename(reuseResult.targetPath)})`;
        logLine(reuseMsg);
        logSummaryLine(reuseMsg);
        console.log(`RM OSD capture reused [topic action]: ${reuseResult.targetPath} (from ${reuseResult.sourcePath})`);
        captureState.lastCapturedStepId = captureId;
        await waitAfterReuse(page, captureId);
        return;
      }
      logCaptureFailure(`STEP ${captureId}: manual reuse failed (${reuseResult.reason})`);
    } else {
      logCaptureFailure(`STEP ${captureId}: manual reuse failed (no-previous-capture)`);
    }

    if (action.skipLiveCapture !== false && !planReuseFileMissingTryLive) {
      logLine(`STEP ${captureId}: live capture skipped after manual reuse failure`);
      return;
    }
  }

  let captureResult = { saved: false, reason: "not-attempted" };
  const maxAttempts = Math.max(1, action.captureRetries ?? (capture.retryAttempts ?? 4));
  const retryWaitMs = Math.max(0, action.retryWaitMs ?? (capture.retryWaitMs ?? 800));
  let preferExistingPopupRetry = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    logLine(
      `STEP ${captureId}: capture attempt ${attempt}/${maxAttempts} started`,
    );
    captureResult = await triggerRmCapture(page, context, remoteController, captureId, {
      reuseExistingPopup: preferExistingPopupRetry,
    }).catch((error) => ({
      saved: false,
      reason: error?.message || "capture-attempt-error",
    }));
    if (captureResult.saved) {
      logLine(`STEP ${captureId}: capture saved on attempt ${attempt}`);
      logSummaryLine(`STEP ${captureId}: capture saved`);
      captureState.lastCapturedStepId = captureId;
      break;
    }
    preferExistingPopupRetry = captureResult.reason === "popup-image-extraction-failed";
    logCaptureFailure(
      `STEP ${captureId}: capture failed attempt ${attempt} (${captureResult.reason})`,
      false,
    );
    if (attempt < maxAttempts) {
      await page.waitForTimeout(retryWaitMs);
    }
  }
  if (!captureResult.saved) {
    logCaptureFailure(`STEP ${captureId}: capture NOT saved (${captureResult.reason})`);
    await closeCapturePopups(context, page);
  }
}

async function runStepActions(page, context, remoteController, stepId, stepGroup, options = {}) {
  logLine(`STEP ${stepId}: started`);
  const defaultStepWaitMs = getDefaultStepWaitMs();
  let savingCaptureOrdinal = 0;
  for (let index = 0; index < stepGroup.actions.length; index += 1) {
    const action = stepGroup.actions[index];
    if (action.type === "remote") {
      await pressRemoteKey(remoteController, action.key);
      logLine(`STEP ${stepId}: remote "${action.key}"`);
      const nextAction = stepGroup.actions[index + 1];
      const hasExplicitWait = nextAction?.type === "wait";
      if (!hasExplicitWait && defaultStepWaitMs > 0) {
        await page.waitForTimeout(defaultStepWaitMs);
        logLine(`STEP ${stepId}: default wait ${defaultStepWaitMs}ms`);
      }
    } else if (action.type === "wait") {
      await page.waitForTimeout(action.ms);
      logLine(`STEP ${stepId}: wait ${action.ms}ms`);
    } else if (action.type === "capture") {
      const mode = normalizeCaptureMode(action);
      const captureId =
        mode === "skip"
          ? stepId
          : getCaptureId(stepId, ++savingCaptureOrdinal);
      await runCaptureAction(
        page,
        context,
        remoteController,
        captureId,
        action,
        options.captureState || { lastCapturedStepId: null },
        options.planByCaptureIdForRun ?? null,
      );
    }
  }
}

async function waitAfterReuse(page, stepId) {
  const pauseMs = Math.max(0, Number(capture.reusePauseAfterReuseMs ?? 0));
  if (!pauseMs) return;
  await page.waitForTimeout(pauseMs);
  logLine(`STEP ${stepId}: pause after file reuse ${pauseMs}ms`);
}

function writeReusePlanJsonFile(
  outPath,
  { generatedAt, reusePlanOverlayPath, totalsMerged, topicStatsMerged, planByCaptureId },
) {
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt,
        ...(reusePlanOverlayPath
          ? { reusePlanOverlay: path.relative(process.cwd(), reusePlanOverlayPath) }
          : {}),
        totals: totalsMerged,
        topicStats: topicStatsMerged,
        decisions: Object.fromEntries(planByCaptureId.entries()),
      },
      null,
      2,
    ),
    "utf8",
  );
}

function planOnlyMode() {
  return process.argv.includes("--write-reuse-plan-only");
}

/** Build a full reuse plan from topic definitions and write it under the capture output dir (no browser). */
async function writeReusePlanToCaptureDir() {
  const { topicsFileName, loadedTopics, loadedReset } = await loadTopicInstructions();
  topics = loadedTopics;
  reset = loadedReset;
  const runDirTarget = resolveRunDirForTopicsFile(topicsFileName);
  fs.mkdirSync(runDirTarget, { recursive: true });

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

  const startIndex = 0;
  const endExclusive = topicEntries.length;
  const reusePlan = buildReusePlan(topicEntries, startIndex, endExclusive);
  let planByCaptureId = reusePlan.planByCaptureId;
  const reusePlanOverlayPath = resolveReusePlanOverlayPath();
  if (reusePlanOverlayPath) {
    if (!fs.existsSync(reusePlanOverlayPath)) {
      throw new Error(`Reuse plan overlay not found: ${reusePlanOverlayPath}`);
    }
    console.log(`Applying reuse-plan overlay: ${path.relative(process.cwd(), reusePlanOverlayPath)}`);
    const overlayDecisions = loadReusePlanDecisionsFromFile(reusePlanOverlayPath);
    planByCaptureId = mergeReusePlanDecisions(planByCaptureId, overlayDecisions);
  }

  const reusableMerged = countPlanReuseEntries(planByCaptureId);
  const totalsMerged = {
    ...reusePlan.totals,
    reusableSteps: reusableMerged,
    newCaptureSteps: reusePlan.totals.captureEligibleSteps - reusableMerged,
  };
  const topicStatsMerged = topicStatsForPlan(topicEntries, startIndex, endExclusive, planByCaptureId);

  const outPath = path.join(runDirTarget, REUSE_PLAN_FILENAME);
  writeReusePlanJsonFile(outPath, {
    generatedAt: reusePlan.generatedAt,
    reusePlanOverlayPath,
    totalsMerged,
    topicStatsMerged,
    planByCaptureId,
  });
  console.log(`Instructions file: scripts/${topicsFileName}`);
  console.log(`Wrote reuse plan: ${outPath}`);
  console.log(
    `${reusableMerged}/${totalsMerged.captureEligibleSteps} capture points marked reusable (plan-driven).`,
  );
}

async function run() {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(runLogDir, { recursive: true });
  const preflightLogPath = path.join(
    runLogDir,
    applyLogTemplate(logNaming.pendingTemplate || "pending-capture-{timestamp}.log", "pending"),
  );
  fs.writeFileSync(preflightLogPath, "", "utf8");
  runLogPath = preflightLogPath;
  const rl = readline.createInterface({ input, output });
  const remoteController = createSamsungRemoteController();
  console.log("Remote input mode: samsung-tv-remote package (RM UI capture button still used)");
  const storageStatePath = resolveSessionStorageStatePath();

  const sessionFileExists = fs.existsSync(storageStatePath);
  let shouldReuseSession = false;
  if (sessionFileExists) {
    const answer = (await rl.question("Reuse previous RMUS session? [Y/n]: ")).trim().toLowerCase();
    shouldReuseSession = answer === "" || answer === "y" || answer === "yes";
  }

  const browser = await chromium.launch({ headless: false });
  const contextOptions = { viewport: null };
  if (shouldReuseSession) {
    contextOptions.storageState = storageStatePath;
    console.log(`Loading saved session from: ${storageStatePath}`);
  }
  const context = await browser.newContext(contextOptions);
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
    const { topicsFileName, loadedTopics, loadedReset } = await loadTopicInstructions();
    topics = loadedTopics;
    reset = loadedReset;
    runDir = resolveRunDirForTopicsFile(topicsFileName);
    fs.mkdirSync(runDir, { recursive: true });
    console.log(`Instructions file: scripts/${topicsFileName}`);
    console.log(`Capture output dir: ${runDir}`);
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

    await ensureRemoteMapReady(page, rl);
    // Always save session after the remote control is ready so the next run can reuse it.
    // Saved here (post-PIN) so the stored cookies are always fully authenticated.
    fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
    await context.storageState({ path: storageStatePath });
    logLine(`SESSION STATE: saved to ${storageStatePath}`);
    console.log(`Session state saved: ${storageStatePath}`);
    const cliReusePlanOverlayPath = resolveReusePlanOverlayPath();
    let captureFolderReusePlanPath = null;
    if (!cliReusePlanOverlayPath) {
      const defaultReusePath = path.join(runDir, REUSE_PLAN_FILENAME);
      if (fs.existsSync(defaultReusePath)) {
        const rel = path.relative(process.cwd(), defaultReusePath);
        const ans = (
          await rl.question(`Found reuse plan in capture folder (${rel}). Apply it for this run? [Y/n]: `)
        )
          .trim()
          .toLowerCase();
        if (ans === "" || ans === "y" || ans === "yes") {
          captureFolderReusePlanPath = defaultReusePath;
        }
      }
    }
    const promptText = `Press Enter to start from beginning, or type a topic number (${availableTopicIds}): `;
    const startAnswer = (await rl.question(promptText)).trim().toLowerCase();
    let runSingleTopic = false;
    if (startAnswer) {
      const matched = findTopicEntry(topicEntries, startAnswer);
      if (!matched) {
        throw new Error(`Topic "${startAnswer}" not found. Available topics: ${availableTopicIds}`);
      }
      startTopicId = matched[0];
      const modeAnswer = (
        await rl.question(
          `Choose run mode for topic ${startTopicId}:\n1. only this topic\n2. start from topic ${startTopicId}\nSelect option (1/2, default 2): `,
        )
      )
        .trim()
        .toLowerCase();
      if (modeAnswer && modeAnswer !== "1" && modeAnswer !== "2") {
        throw new Error(`Invalid run mode "${modeAnswer}". Choose 1 (only this topic) or 2 (start from topic).`);
      }
      runSingleTopic = modeAnswer === "1";
    }

    let startIndex = 0;
    if (startTopicId) {
      const matchedStartTopic = findTopicEntry(topicEntries, startTopicId);
      if (!matchedStartTopic) {
        throw new Error(`Default/start topic "${startTopicId}" not found. Available topics: ${availableTopicIds}`);
      }
      startTopicId = matchedStartTopic[0];
      startIndex = topicEntries.findIndex(([id]) => id === startTopicId);
    }
    const firstTopicId = topicEntries[startIndex]?.[0] || "unknown";
    const detailedTemplate = runSingleTopic
      ? logNaming.singleTopicDetailedTemplate || ""
      : logNaming.startedTopicDetailedTemplate || "";
    const summaryTemplate = runSingleTopic
      ? logNaming.singleTopicSummaryTemplate || ""
      : logNaming.startedTopicSummaryTemplate || "";
    const failuresTemplate = runSingleTopic
      ? logNaming.singleTopicMissedCapturesTemplate || ""
      : logNaming.startedTopicMissedCapturesTemplate || "";
    const detailedFilename = applyLogTemplate(detailedTemplate, firstTopicId) || "detailed.log";
    const summaryFilename = applyLogTemplate(summaryTemplate, firstTopicId) || "summary.log";
    const failuresFilename = applyLogTemplate(failuresTemplate, firstTopicId) || "missed-captures.log";
    const finalDetailedPath = path.join(runLogDir, detailedFilename);
    const finalSummaryPath = path.join(runLogDir, summaryFilename);
    const finalFailuresPath = path.join(runLogDir, failuresFilename);
    if (runLogPath !== finalDetailedPath) {
      fs.renameSync(runLogPath, finalDetailedPath);
      runLogPath = finalDetailedPath;
    }
    fs.writeFileSync(finalSummaryPath, "", "utf8");
    runSummaryLogPath = finalSummaryPath;
    fs.writeFileSync(finalFailuresPath, "", "utf8");
    runFailuresLogPath = finalFailuresPath;

    const configuredMax = Number(topicPolicy.maxTopicsPerRun || 0);
    const maxTopics = configuredMax > 0 ? configuredMax : Number.POSITIVE_INFINITY;
    const runLimit = runSingleTopic ? 1 : maxTopics;
    const endExclusive = Math.min(startIndex + runLimit, topicEntries.length);
    const reusePlan = buildReusePlan(topicEntries, startIndex, endExclusive);
    let planByCaptureId = reusePlan.planByCaptureId;
    const reusePlanOverlayPath = cliReusePlanOverlayPath || captureFolderReusePlanPath;
    if (reusePlanOverlayPath) {
      if (!fs.existsSync(reusePlanOverlayPath)) {
        throw new Error(`Reuse plan overlay not found: ${reusePlanOverlayPath}`);
      }
      console.log(`Applying reuse-plan overlay: ${path.relative(process.cwd(), reusePlanOverlayPath)}`);
      const overlayDecisions = loadReusePlanDecisionsFromFile(reusePlanOverlayPath);
      planByCaptureId = mergeReusePlanDecisions(planByCaptureId, overlayDecisions);
    }

    const reusableMerged = countPlanReuseEntries(planByCaptureId);
    const totalsMerged = {
      ...reusePlan.totals,
      reusableSteps: reusableMerged,
      newCaptureSteps: reusePlan.totals.captureEligibleSteps - reusableMerged,
    };
    const topicStatsMerged = topicStatsForPlan(topicEntries, startIndex, endExclusive, planByCaptureId);

    const reusePlanPath = path.join(runLogDir, REUSE_PLAN_FILENAME);
    writeReusePlanJsonFile(reusePlanPath, {
      generatedAt: reusePlan.generatedAt,
      reusePlanOverlayPath,
      totalsMerged,
      topicStatsMerged,
      planByCaptureId,
    });
    logLine(
      `REUSE PLAN: topics=${totalsMerged.topics}, steps=${totalsMerged.totalSteps}, capturePoints=${totalsMerged.captureEligibleSteps}, reusable=${totalsMerged.reusableSteps}, newCaptures=${totalsMerged.newCaptureSteps}`,
    );
    logLine(`REUSE PLAN FILE: ${path.relative(process.cwd(), reusePlanPath)}`);
    console.log(
      `Reuse plan ready: ${totalsMerged.reusableSteps}/${totalsMerged.captureEligibleSteps} capture points will reuse (plan-driven).`,
    );
    console.log(`Reuse plan saved: ${reusePlanPath}`);

    const captureState = { lastCapturedStepId: null };

    async function runTopicSlice(sliceStart, sliceEndExclusive, slicePlan, captureStateForSlice) {
      for (let i = sliceStart; i < sliceEndExclusive; i += 1) {
        const [topicId, topicData] = topicEntries[i];
        const resetTopic = reset?.["0"];
        if (resetTopic && shouldRunResetForTopic(i, sliceStart)) {
          logLine(`RESET before topic ${topicId}: started`);
          const resetStepGroups = toStepGroups(resetTopic);
          for (let resetStepIndex = 0; resetStepIndex < resetStepGroups.length; resetStepIndex += 1) {
            const resetStepId = `reset-0-${resetStepIndex + 1}`;
            await runStepActions(page, context, remoteController, resetStepId, resetStepGroups[resetStepIndex], {
              captureState: captureStateForSlice,
              planByCaptureIdForRun: slicePlan,
            });
          }
          logLine(`RESET before topic ${topicId}: finished`);
        }
        console.log(`Running topic: ${formatTopicLabel(topicId, topicData)}`);
        logTopicStarted(topicId, topicData);
        const stepGroups = toStepGroups(topicData);
        for (let stepIndex = 0; stepIndex < stepGroups.length; stepIndex += 1) {
          const stepGroup = stepGroups[stepIndex];
          const stepId = `${topicId}-${stepIndex + 1}`;
          await runStepActions(page, context, remoteController, stepId, stepGroup, {
            captureState: captureStateForSlice,
            planByCaptureIdForRun: slicePlan,
          });
        }
        logLine(`TOPIC ${topicId}: finished`);
      }
    }

    await runTopicSlice(startIndex, endExclusive, planByCaptureId, captureState);

    console.log(`Capture run complete: ${runDir}`);
    if (runSingleTopic) {
      console.log("Selected single topic finished.");
    } else {
      console.log("All configured topics finished.");
    }
    logLine("FLOW finished");
    console.log(`Detailed run log: ${runLogPath}`);
    if (runSummaryLogPath) console.log(`Summary run log: ${runSummaryLogPath}`);
    if (runFailuresLogPath) console.log(`Missed-captures run log: ${runFailuresLogPath}`);
    console.log(`Run logs folder: ${runLogDir}`);

    const exitTokens = new Set(["exit", "q", "quit", "bye"]);
    for (;;) {
      const followUp = (
        await rl.question(
          `Another topic? Type a topic id (${availableTopicIds}), or exit / q to close the browser and quit: `,
        )
      )
        .trim()
        .toLowerCase();
      if (exitTokens.has(followUp)) {
        logLine("FLOW exit requested by user (browser will close)");
        break;
      }
      if (!followUp) {
        console.log("Type a topic id to run again, or exit / q to quit.");
        continue;
      }
      const matchedFollowUp = findTopicEntry(topicEntries, followUp);
      if (!matchedFollowUp) {
        console.log(`Topic "${followUp}" not found. Available: ${availableTopicIds}`);
        continue;
      }
      const [followTopicId] = matchedFollowUp;
      const followIndex = topicEntries.findIndex(([id]) => id === followTopicId);
      logLine(`INTERACTIVE follow-up: running topic ${followTopicId}`);
      const sliceReuse = buildReusePlan(topicEntries, followIndex, followIndex + 1);
      let slicePlan = sliceReuse.planByCaptureId;
      if (reusePlanOverlayPath) {
        const overlayDecisionsFollow = loadReusePlanDecisionsFromFile(reusePlanOverlayPath);
        slicePlan = mergeReusePlanDecisions(slicePlan, overlayDecisionsFollow);
      }
      const followCaptureState = { lastCapturedStepId: null };
      await runTopicSlice(followIndex, followIndex + 1, slicePlan, followCaptureState);
      console.log(`Topic finished: ${followTopicId}`);
    }
  } finally {
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    remoteController.disconnect();
    rl.close();
    await context.close().catch(() => {});
    await closeBrowserWithTimeout(browser, 45000);
  }
}

if (planOnlyMode()) {
  writeReusePlanToCaptureDir()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
