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
const truthyValues = new Set(["1", "true", "yes", "y", "on"]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @returns {Promise<void>} */
async function closeBrowserWithTimeout(browser, timeoutMs = 45000) {
  await Promise.race([
    browser.close().catch(() => {}),
    delay(timeoutMs),
  ]);
}

function isEnabledEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") return fallback;
  return truthyValues.has(String(raw).trim().toLowerCase());
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
      const targetPath = path.join(runDir, `${topicId}.${extension}`);
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
      const targetPath = path.join(runDir, `${topicId}.png`);
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
  const normalizeActionsAndCaptureOverrides = (actions = []) => {
    const executableActions = [];
    const overrides = {
      skipCapture: null,
      reuseImage: null,
      skipLiveCapture: null,
      captureRetries: null,
      retryWaitMs: null,
      forceLiveCapture: null,
    };

    for (const action of actions) {
      if (action?.type !== "capture") {
        executableActions.push(action);
        continue;
      }

      const mode = String(action?.mode || "").toLowerCase();
      if (mode === "skip") {
        overrides.skipCapture = true;
        overrides.reuseImage = null;
        overrides.forceLiveCapture = false;
      } else if (mode === "reuse") {
        overrides.reuseImage = action?.reuseImage || action?.sourceStepId || "previous";
        overrides.skipLiveCapture = action?.skipLiveCapture ?? true;
        overrides.forceLiveCapture = false;
      } else if (["screen", "live", "now"].includes(mode)) {
        overrides.skipCapture = false;
        overrides.reuseImage = null;
        overrides.skipLiveCapture = false;
        overrides.forceLiveCapture = true;
      }

      if (typeof action?.captureRetries === "number") overrides.captureRetries = action.captureRetries;
      if (typeof action?.retryWaitMs === "number") overrides.retryWaitMs = action.retryWaitMs;
    }

    return { executableActions, overrides };
  };

  return (topicData?.steps || []).map((s) => {
    if (Array.isArray(s)) {
      const { executableActions, overrides } = normalizeActionsAndCaptureOverrides(s);
      return {
        actions: executableActions,
        captureRetries: overrides.captureRetries ?? (capture.retryAttempts ?? 4),
        retryWaitMs: overrides.retryWaitMs ?? (capture.retryWaitMs ?? 800),
        skipCapture: typeof overrides.skipCapture === "boolean" ? overrides.skipCapture : topicSkipCapture,
        reuseImage: overrides.reuseImage,
        skipLiveCapture: typeof overrides.skipLiveCapture === "boolean" ? overrides.skipLiveCapture : false,
        forceLiveCapture: typeof overrides.forceLiveCapture === "boolean" ? overrides.forceLiveCapture : false,
      };
    }
    const objectActions = Array.isArray(s.actions) ? s.actions : [];
    const { executableActions, overrides } = normalizeActionsAndCaptureOverrides(objectActions);
    return {
      actions: executableActions,
      captureRetries:
        typeof s.captureRetries === "number"
          ? s.captureRetries
          : (overrides.captureRetries ?? (capture.retryAttempts ?? 4)),
      retryWaitMs:
        typeof s.retryWaitMs === "number" ? s.retryWaitMs : (overrides.retryWaitMs ?? (capture.retryWaitMs ?? 800)),
      skipCapture:
        typeof s.skipCapture === "boolean"
          ? s.skipCapture
          : (typeof overrides.skipCapture === "boolean" ? overrides.skipCapture : topicSkipCapture),
      reuseImage: s.reuseImage ?? overrides.reuseImage,
      skipLiveCapture:
        typeof s.skipLiveCapture === "boolean"
          ? s.skipLiveCapture
          : (typeof overrides.skipLiveCapture === "boolean" ? overrides.skipLiveCapture : false),
      forceLiveCapture:
        typeof s.forceLiveCapture === "boolean"
          ? s.forceLiveCapture
          : (typeof overrides.forceLiveCapture === "boolean" ? overrides.forceLiveCapture : false),
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

function getNormalizedStepActionSignatures(actions) {
  const signatures = [];
  const defaultStepWaitMs = getDefaultStepWaitMs();
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    signatures.push(actionToSignature(action));
    if (action?.type === "remote") {
      const nextAction = actions[index + 1];
      const hasExplicitWait = nextAction?.type === "wait";
      if (!hasExplicitWait && defaultStepWaitMs > 0) {
        signatures.push(`wait:${defaultStepWaitMs}`);
      }
    }
  }
  return signatures;
}

function buildStepFingerprint(resetApplied, actionSignatures) {
  return `reset:${resetApplied ? "1" : "0"}|${actionSignatures.join("|")}`;
}

function buildReusePlan(topicEntries, startIndex, endExclusive) {
  const fingerprintToSourceStepId = new Map();
  const planByStepId = new Map();
  const topicStats = [];
  let totalSteps = 0;
  let captureEligibleSteps = 0;
  let reusableSteps = 0;

  for (let i = startIndex; i < endExclusive; i += 1) {
    const [topicId, topicData] = topicEntries[i];
    const stepGroups = toStepGroups(topicData);
    const resetApplied = Boolean(reset?.["0"] && shouldRunResetForTopic(i, startIndex));
    const prefixActionSignatures = [];
    let topicReusable = 0;
    let topicCaptureEligible = 0;
    for (let stepIndex = 0; stepIndex < stepGroups.length; stepIndex += 1) {
      const stepGroup = stepGroups[stepIndex];
      const stepId = `${topicId}-${stepIndex + 1}`;
      totalSteps += 1;
      const normalizedActionSignatures = getNormalizedStepActionSignatures(stepGroup.actions);
      prefixActionSignatures.push(...normalizedActionSignatures);
      if (stepGroup.skipCapture) {
        planByStepId.set(stepId, {
          decision: "skip-capture",
          sourceStepId: null,
          fingerprint: null,
        });
        continue;
      }

      captureEligibleSteps += 1;
      topicCaptureEligible += 1;
      const fingerprint = buildStepFingerprint(resetApplied, prefixActionSignatures);

      if (stepGroup.forceLiveCapture) {
        fingerprintToSourceStepId.set(fingerprint, stepId);
        planByStepId.set(stepId, {
          decision: "capture",
          sourceStepId: null,
          fingerprint,
          forceLiveCapture: true,
        });
        continue;
      }

      const sourceStepId = fingerprintToSourceStepId.get(fingerprint) || null;

      if (sourceStepId) {
        reusableSteps += 1;
        topicReusable += 1;
        planByStepId.set(stepId, {
          decision: "reuse",
          sourceStepId,
          fingerprint,
        });
      } else {
        fingerprintToSourceStepId.set(fingerprint, stepId);
        planByStepId.set(stepId, {
          decision: "capture",
          sourceStepId: null,
          fingerprint,
        });
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
    planByStepId,
  };
}

function getStepCapturePath(stepId) {
  const extensions = [".png", ".jpg", ".jpeg"];
  for (const extension of extensions) {
    const candidate = path.join(runDir, `${stepId}${extension}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function tryReuseCapture(sourceStepId, targetStepId) {
  const sourcePath = getStepCapturePath(sourceStepId);
  if (!sourcePath) {
    return { copied: false, reason: `source-not-found:${sourceStepId}` };
  }
  const extension = path.extname(sourcePath) || ".png";
  const targetPath = path.join(runDir, `${targetStepId}${extension}`);
  fs.copyFileSync(sourcePath, targetPath);
  return { copied: true, sourcePath, targetPath };
}

async function runStepActions(page, remoteController, stepId, stepGroup) {
  logLine(`STEP ${stepId}: started`);
  const defaultStepWaitMs = getDefaultStepWaitMs();
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
    }
  }
}

async function waitAfterReuse(page, stepId) {
  const settleMs = Math.max(0, Number(capture.reuseStepSettleMs ?? 0));
  if (!settleMs) return;
  await page.waitForTimeout(settleMs);
  logLine(`STEP ${stepId}: post-reuse settle wait ${settleMs}ms`);
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
    const promptText = `Press Enter to start from beginning, or type a topic number (${availableTopicIds}): `;
    const startAnswer = (await rl.question(promptText)).trim().toLowerCase();
    let runSingleTopic = false;
    if (startAnswer) {
      const matched = topicEntries.find(([id]) => id.toLowerCase() === startAnswer);
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
      startIndex = topicEntries.findIndex(([id]) => id === startTopicId);
      if (startIndex < 0) {
        throw new Error(`Default/start topic "${startTopicId}" not found. Available topics: ${availableTopicIds}`);
      }
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
    const reusePlanPath = path.join(runLogDir, "reuse-plan.json");
    fs.writeFileSync(
      reusePlanPath,
      JSON.stringify(
        {
          generatedAt: reusePlan.generatedAt,
          totals: reusePlan.totals,
          topicStats: reusePlan.topicStats,
          decisions: Object.fromEntries(reusePlan.planByStepId.entries()),
        },
        null,
        2,
      ),
      "utf8",
    );
    const { totals } = reusePlan;
    logLine(
      `REUSE PLAN: topics=${totals.topics}, steps=${totals.totalSteps}, captureEligible=${totals.captureEligibleSteps}, reusable=${totals.reusableSteps}, newCaptures=${totals.newCaptureSteps}`,
    );
    logLine(`REUSE PLAN FILE: ${path.relative(process.cwd(), reusePlanPath)}`);
    console.log(
      `Reuse plan ready: ${totals.reusableSteps}/${totals.captureEligibleSteps} capture-eligible steps will reuse existing captures.`,
    );
    console.log(`Reuse plan saved: ${reusePlanPath}`);

    let lastCapturedStepId = null;
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
      logSummaryLine(`TOPIC ${topicId}: started`);
      const stepGroups = toStepGroups(topicData);
      for (let stepIndex = 0; stepIndex < stepGroups.length; stepIndex += 1) {
        const stepGroup = stepGroups[stepIndex];
        const stepId = `${topicId}-${stepIndex + 1}`;
        await runStepActions(page, remoteController, stepId, stepGroup);

        if (stepGroup.reuseImage) {
          const requestedSource = String(stepGroup.reuseImage).trim();
          const sourceStepId =
            requestedSource.toLowerCase() === "previous" ? lastCapturedStepId : requestedSource;
          if (sourceStepId) {
            const reuseResult = tryReuseCapture(sourceStepId, stepId);
            if (reuseResult.copied) {
              const reuseMsg = `STEP ${stepId}: capture reused from ${sourceStepId} (${path.basename(reuseResult.sourcePath)} -> ${path.basename(reuseResult.targetPath)})`;
              logLine(reuseMsg);
              logSummaryLine(reuseMsg);
              lastCapturedStepId = stepId;
              await waitAfterReuse(page, stepId);
              continue;
            }
            logCaptureFailure(`STEP ${stepId}: manual reuse failed (${reuseResult.reason})`);
          } else {
            logCaptureFailure(`STEP ${stepId}: manual reuse failed (no-previous-capture)`);
          }

          if (stepGroup.skipLiveCapture) {
            logLine(`STEP ${stepId}: live capture skipped after manual reuse failure`);
            continue;
          }
        }

        if (stepGroup.skipCapture) {
          logLine(`STEP ${stepId}: capture skipped`);
        } else {
          const stepPlan = reusePlan.planByStepId.get(stepId);
          if (!stepGroup.forceLiveCapture && stepPlan?.decision === "reuse" && stepPlan.sourceStepId) {
            const reuseResult = tryReuseCapture(stepPlan.sourceStepId, stepId);
            if (reuseResult.copied) {
              const reuseMsg = `STEP ${stepId}: capture reused from ${stepPlan.sourceStepId} (${path.basename(reuseResult.sourcePath)} -> ${path.basename(reuseResult.targetPath)})`;
              logLine(reuseMsg);
              logSummaryLine(reuseMsg);
              lastCapturedStepId = stepId;
              await waitAfterReuse(page, stepId);
              continue;
            }
            logCaptureFailure(
              `STEP ${stepId}: reuse failed (${reuseResult.reason}), falling back to live capture`,
            );
          }

          let captureResult = { saved: false, reason: "not-attempted" };
          const maxAttempts = Math.max(1, stepGroup.captureRetries);
          let preferExistingPopupRetry = false;
          for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            logLine(
              `STEP ${stepId}: capture attempt ${attempt}/${maxAttempts} started`,
            );
            captureResult = await triggerRmCapture(page, context, remoteController, stepId, {
                reuseExistingPopup: preferExistingPopupRetry,
              }).catch((error) => ({
              saved: false,
              reason: error?.message || "capture-attempt-error",
            }));
            if (captureResult.saved) {
              logLine(`STEP ${stepId}: capture saved on attempt ${attempt}`);
              logSummaryLine(`STEP ${stepId}: capture saved`);
              lastCapturedStepId = stepId;
              break;
            }
            preferExistingPopupRetry = captureResult.reason === "popup-image-extraction-failed";
            logCaptureFailure(
              `STEP ${stepId}: capture failed attempt ${attempt} (${captureResult.reason})`,
              false,
            );
            if (attempt < maxAttempts) {
              await page.waitForTimeout(stepGroup.retryWaitMs);
            }
          }
          if (!captureResult.saved) {
            logCaptureFailure(`STEP ${stepId}: capture NOT saved (${captureResult.reason})`);
            await closeCapturePopups(context, page);
          }
        }
      }
      logLine(`TOPIC ${topicId}: finished`);

      // Continue automatically to the next topic unless a single topic was selected at prompt.
    }

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
    const keepBrowserOpenEnvName = capture.keepBrowserOpenEnv || "KEEP_BROWSER_OPEN";
    if (isEnabledEnv(keepBrowserOpenEnvName, false)) {
      await rl.question(
        `${keepBrowserOpenEnvName}: browser left open. Press Enter in this terminal to close Chromium and exit… `,
      );
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

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
