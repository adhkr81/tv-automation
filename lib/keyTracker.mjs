/**
 * Interactive remote key / wait / capture logger (ported from lib/keyTracker.py).
 *
 * Run from repo root:
 *   node .\lib\keyTracker.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const OUTPUT_FOLDER = path.join(PROJECT_ROOT, "key-tracker-js-output");

const DEFAULT_WAIT_MS = 500;
const ACTION_INDENT = "            ";
const STEP_BLOCK_INDENT = "          ";
const STEP_INDENT = "    ";
const STEPS_INDENT = "      ";

const KEY_NAMES = {
  UP: "Up",
  DOWN: "Down",
  LEFT: "Left",
  RIGHT: "Right",
  HOME: "Home",
  ENTER: "Enter",
};

const SHORTCUT_KEYS = {
  w: "WAIT",
  f: "FINISH",
  i: "SET_INTERVAL",
  t: "NEXT_TOPIC",
  p: "CAPTURE_REUSE_PREVIOUS",
  r: "CAPTURE_REUSE_1_3",
  q: "QUIT",
};

const CAPTURE_REUSE_IMAGES = {
  CAPTURE_REUSE_PREVIOUS: "previous",
  CAPTURE_REUSE_1_3: "1-3",
};

/** @typedef {[string, string | number]} Action */

let LOG_FILE = "";

function logStamp() {
  const d = new Date();
  const z2 = (n) => String(n).padStart(2, "0");
  const head = `${d.getFullYear()}${z2(d.getMonth() + 1)}${z2(d.getDate())}_${z2(d.getHours())}${z2(d.getMinutes())}${z2(d.getSeconds())}`;
  const tail = String(d.getMilliseconds() * 1000 + crypto.randomInt(1000)).padStart(6, "0");
  return `${head}_${tail}`;
}

function tryParseKey(buf) {
  if (buf.length === 0) return { needMore: true };

  const b0 = buf[0];

  if (b0 === 0x00 || b0 === 0xe0) {
    if (buf.length < 2) return { needMore: true };
    const arrows = { 0x48: "UP", 0x50: "DOWN", 0x4b: "LEFT", 0x4d: "RIGHT" };
    const k = arrows[buf[1]];
    if (!k) return { key: null, consume: 2 };
    return { key: k, consume: 2 };
  }

  if (b0 === 0x1b) {
    if (buf.length < 3) return { needMore: true };
    if (buf[1] === 0x5b) {
      const sub = { 0x41: "UP", 0x42: "DOWN", 0x44: "LEFT", 0x43: "RIGHT" }[buf[2]];
      if (sub) return { key: sub, consume: 3 };
    }
    return { key: null, consume: 3 };
  }

  if (b0 === 0x0d || b0 === 0x0a) return { key: "ENTER", consume: 1 };
  if (b0 === 0x08 || b0 === 0x7f) return { key: "UNDO", consume: 1 };
  if (b0 === 0x20) return { key: "HOME", consume: 1 };

  if (b0 < 0x80) {
    const ch = String.fromCharCode(b0);
    const shortcut = SHORTCUT_KEYS[ch.toLowerCase()];
    if (shortcut) return { key: shortcut, consume: 1 };
    return { key: null, consume: 1 };
  }

  let len = 1;
  if ((b0 & 0xe0) === 0xc0) len = 2;
  else if ((b0 & 0xf0) === 0xe0) len = 3;
  else if ((b0 & 0xf8) === 0xf0) len = 4;
  if (buf.length < len) return { needMore: true };
  return { key: null, consume: len };
}

class KeyReader {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  readKey() {
    return new Promise((resolve) => {
      const stdin = process.stdin;
      if (!stdin.isTTY) {
        resolve(null);
        return;
      }
      const prevRaw = stdin.isRaw;
      stdin.setRawMode(true);
      stdin.resume();

      const finish = (key) => {
        stdin.setRawMode(prevRaw);
        stdin.removeListener("data", onData);
        resolve(key);
      };

      const drain = () => {
        for (;;) {
          const r = tryParseKey(this.buffer);
          if (r.needMore) return;
          this.buffer = this.buffer.subarray(r.consume);
          finish(r.key);
          return;
        }
      };

      const onData = (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        drain();
      };

      const r0 = tryParseKey(this.buffer);
      if (!r0.needMore) {
        this.buffer = this.buffer.subarray(r0.consume);
        stdin.setRawMode(prevRaw);
        resolve(r0.key);
        return;
      }

      stdin.on("data", onData);
    });
  }
}

function clearScreen() {
  process.stdout.write("\u001b[2J\u001b[H");
}

async function promptTopic() {
  clearScreen();
  process.stdout.write("Topic\n=====\n");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question("Enter topic #: ")).trim();
  } finally {
    rl.close();
  }
}

async function promptWaitInterval() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const answer = (await rl.question("Set the interval: ")).trim();
      const interval = parseInt(answer, 10);
      if (interval > 0) return interval;
      process.stdout.write("Interval must be a positive whole number.\n");
    }
  } finally {
    rl.close();
  }
}

function initializeLogFile() {
  const name = `key_presses_${logStamp()}.js`;
  LOG_FILE = path.join(OUTPUT_FOLDER, name);
  fs.mkdirSync(OUTPUT_FOLDER, { recursive: true });
  fs.writeFileSync(LOG_FILE, "export const keyPresses = {\n", "utf8");
}

function logFileDisplayPath() {
  try {
    return path.relative(PROJECT_ROOT, LOG_FILE);
  } catch {
    return LOG_FILE;
  }
}

function finalizeLogFile() {
  fs.appendFileSync(LOG_FILE, "};\n\nexport default keyPresses;\n", "utf8");
}

function startTopic(topic) {
  fs.appendFileSync(
    LOG_FILE,
    `${STEP_INDENT}${JSON.stringify(topic)}: {\n${STEPS_INDENT}steps: [\n`,
    "utf8",
  );
}

function startStep() {
  fs.appendFileSync(LOG_FILE, `${STEP_BLOCK_INDENT}[\n`, "utf8");
}

function logKeyPress(key) {
  fs.appendFileSync(
    LOG_FILE,
    `${ACTION_INDENT}{ type: "remote", key: "KEY_${key}" },\n`,
    "utf8",
  );
}

function logWait(waitMs) {
  fs.appendFileSync(LOG_FILE, `${ACTION_INDENT}{ type: "wait", ms: ${waitMs} },\n`, "utf8");
}

function logCaptureReuse(reuseImage) {
  fs.appendFileSync(
    LOG_FILE,
    `${ACTION_INDENT}{ type: "capture", mode: "reuse", reuseImage: "${reuseImage}" },\n`,
    "utf8",
  );
}

function finishStep() {
  fs.appendFileSync(LOG_FILE, `${STEP_BLOCK_INDENT}],\n`, "utf8");
}

function finishTopic() {
  fs.appendFileSync(LOG_FILE, `${STEPS_INDENT}],\n${STEP_INDENT}}},\n`, "utf8");
}

function lastContentLineIndex(lines) {
  let index = lines.length - 1;
  while (index >= 0 && lines[index] === "") index -= 1;
  return index;
}

function writeLogLines(lines) {
  fs.writeFileSync(LOG_FILE, lines.join("\n"), "utf8");
}

function removeEmptyOpenStep() {
  const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n");
  const index = lastContentLineIndex(lines);
  if (index < 0 || lines[index] !== `${STEP_BLOCK_INDENT}[`) return false;
  lines.splice(index, 1);
  writeLogLines(lines);
  return true;
}

function removeLastStepClose() {
  const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n");
  const index = lastContentLineIndex(lines);
  if (index < 0 || lines[index] !== `${STEP_BLOCK_INDENT}],`) return false;
  lines.splice(index, 1);
  writeLogLines(lines);
  return true;
}

function removeLastActionLine() {
  const lines = fs.readFileSync(LOG_FILE, "utf8").split("\n");
  for (let index = lastContentLineIndex(lines); index >= 0; index -= 1) {
    if (lines[index].startsWith(ACTION_INDENT)) {
      lines.splice(index, 1);
      writeLogLines(lines);
      return true;
    }
    if (lines[index] === `${STEP_BLOCK_INDENT}[`) break;
  }
  return false;
}

function findLastRemoteKey(actions) {
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    const [actionType, value] = actions[i];
    if (actionType === "remote") return String(value);
  }
  return null;
}

function recomputeCounts(counts, actions) {
  for (const k of Object.keys(counts)) delete counts[k];
  for (const [actionType, value] of actions) {
    if (actionType === "remote") counts[String(value)] = (counts[String(value)] ?? 0) + 1;
  }
  return findLastRemoteKey(actions);
}

function describeAction(action) {
  const [actionType, value] = action;
  if (actionType === "wait") return `Wait ${value} ms`;
  if (actionType === "capture") return `Capture reuse ${value}`;
  return KEY_NAMES[String(value)];
}

function formatTime(d) {
  const z2 = (n) => String(n).padStart(2, "0");
  return `${z2(d.getHours())}:${z2(d.getMinutes())}:${z2(d.getSeconds())}`;
}

function draw(counts, recent, lastKey, topicOpen, stepOpen, currentTopic, waitMs) {
  clearScreen();
  process.stdout.write(
    [
      "W to add a wait",
      "F to finish current step.",
      "I to set wait interval.",
      "T to start the next topic.",
      "P to capture previous image.",
      'R to reuse images "1-3".',
      "Backspace to undo the last action.",
      "Q to end program.\n",
      `Saving presses to: ${logFileDisplayPath()}`,
      `Wait interval: ${waitMs} ms`,
    ].join("\n") + "\n",
  );
  if (topicOpen && stepOpen && currentTopic) {
    process.stdout.write(`Current topic: ${currentTopic}\n\n`);
  } else if (currentTopic) {
    process.stdout.write(`Current topic: ${currentTopic} (ready)\n\n`);
  } else {
    process.stdout.write("Current topic: not started\n\n");
  }

  for (const key of ["UP", "DOWN", "LEFT", "RIGHT", "HOME", "ENTER"]) {
    process.stdout.write(`${KEY_NAMES[key]}: ${counts[key] ?? 0}\n`);
  }

  if (lastKey) process.stdout.write(`\nLast key: ${KEY_NAMES[lastKey]}\n`);
  else process.stdout.write("\nLast key: none yet\n");

  if (recent.length) {
    process.stdout.write("\nKey Counter:\n");
    for (const event of recent) process.stdout.write(`  ${event}\n`);
  }
}

function suspendSigint() {
  const prev = [...process.listeners("SIGINT")];
  process.removeAllListeners("SIGINT");
  process.on("SIGINT", () => {});
  return () => {
    process.removeAllListeners("SIGINT");
    for (const l of prev) process.on("SIGINT", l);
  };
}

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write("keyTracker requires an interactive terminal (TTY).\n");
    process.exitCode = 1;
    return;
  }

  const restoreSigint = suspendSigint();
  const reader = new KeyReader();
  /** @type {Record<string, number>} */
  const counts = {};
  /** @type {string[]} */
  const recent = [];
  const RECENT_MAX = 3;

  function pushRecent(line) {
    recent.unshift(line);
    while (recent.length > RECENT_MAX) recent.pop();
  }

  let lastKey = null;
  let topicOpen = false;
  let stepOpen = false;
  let currentTopic = null;
  /** @type {Action[]} */
  let currentStepActions = [];
  /** @type {Action[][]} */
  const finishedStepActions = [];
  let waitMs = DEFAULT_WAIT_MS;

  async function openStepIfNeeded() {
    if (stepOpen) return;
    if (currentTopic === null) {
      currentTopic = await promptTopic();
    }
    if (!topicOpen) {
      startTopic(currentTopic);
      topicOpen = true;
    }
    startStep();
    currentStepActions = [];
    stepOpen = true;
  }

  function redraw() {
    draw(counts, recent, lastKey, topicOpen, stepOpen, currentTopic, waitMs);
  }

  initializeLogFile();

  try {
    currentTopic = await promptTopic();
    redraw();

    for (;;) {
      const key = await reader.readKey();

      if (key === "QUIT") break;
      const timestamp = new Date();

      if (key === "SET_INTERVAL") {
        waitMs = await promptWaitInterval();
        pushRecent(`${formatTime(timestamp)} - Wait interval ${waitMs} ms`);
        redraw();
        continue;
      }

      if (key === "WAIT") {
        await openStepIfNeeded();
        logWait(waitMs);
        currentStepActions.push(["wait", waitMs]);
        finishedStepActions.push([...currentStepActions]);
        finishStep();
        currentStepActions = [];
        stepOpen = false;
        for (const k of Object.keys(counts)) delete counts[k];
        lastKey = null;
        pushRecent(`${formatTime(timestamp)} - Wait ${waitMs} ms; finished step`);
        redraw();
        continue;
      }

      if (key === "FINISH") {
        if (stepOpen) {
          if (currentStepActions.length) {
            finishedStepActions.push([...currentStepActions]);
            finishStep();
          } else {
            removeEmptyOpenStep();
          }
          currentStepActions = [];
          stepOpen = false;
          pushRecent(`${formatTime(timestamp)} - Finished step`);
          for (const k of Object.keys(counts)) delete counts[k];
          lastKey = null;
        } else {
          pushRecent(`${formatTime(timestamp)} - No open step to finish`);
        }
        redraw();
        continue;
      }

      if (key === "UNDO") {
        if (!stepOpen && topicOpen && finishedStepActions.length) {
          if (removeLastStepClose()) {
            currentStepActions = finishedStepActions.pop();
            lastKey = recomputeCounts(counts, currentStepActions);
            stepOpen = true;
          } else {
            pushRecent(`${formatTime(timestamp)} - Could not go back to step`);
            redraw();
            continue;
          }
        }

        if (!stepOpen || !currentStepActions.length) {
          pushRecent(`${formatTime(timestamp)} - Nothing to undo`);
          redraw();
          continue;
        }

        const action = currentStepActions.pop();
        if (!removeLastActionLine()) {
          currentStepActions.push(action);
          pushRecent(`${formatTime(timestamp)} - Could not undo last action`);
          redraw();
          continue;
        }

        if (action[0] === "remote") {
          const vk = String(action[1]);
          counts[vk] = Math.max(0, (counts[vk] ?? 0) - 1);
        }

        if (currentStepActions.length) {
          lastKey = findLastRemoteKey(currentStepActions);
        } else {
          removeEmptyOpenStep();
          stepOpen = false;
          for (const k of Object.keys(counts)) delete counts[k];
          lastKey = null;
        }

        pushRecent(`${formatTime(timestamp)} - Removed ${describeAction(action)}`);
        redraw();
        continue;
      }

      if (key === "NEXT_TOPIC") {
        if (stepOpen) {
          if (currentStepActions.length) {
            finishedStepActions.push([...currentStepActions]);
            finishStep();
          } else {
            removeEmptyOpenStep();
          }
          currentStepActions = [];
          stepOpen = false;
        }
        if (topicOpen) {
          finishTopic();
          topicOpen = false;
        }

        for (const k of Object.keys(counts)) delete counts[k];
        lastKey = null;
        finishedStepActions.length = 0;
        currentTopic = await promptTopic();
        pushRecent(`${formatTime(new Date())} - Ready for topic ${currentTopic}`);
        redraw();
        continue;
      }

      if (key != null && Object.prototype.hasOwnProperty.call(CAPTURE_REUSE_IMAGES, key)) {
        const reuseImage = CAPTURE_REUSE_IMAGES[key];
        await openStepIfNeeded();
        logCaptureReuse(reuseImage);
        currentStepActions.push(["capture", reuseImage]);
        pushRecent(`${formatTime(timestamp)} - Capture reuse ${reuseImage}`);
        redraw();
        continue;
      }

      if (key == null || !Object.prototype.hasOwnProperty.call(KEY_NAMES, key)) continue;

      counts[key] = (counts[key] ?? 0) + 1;
      lastKey = key;
      await openStepIfNeeded();
      logKeyPress(key);
      currentStepActions.push(["remote", key]);
      pushRecent(`${formatTime(timestamp)} - ${KEY_NAMES[key]}`);
      redraw();
    }
  } catch {
    // mirror Python KeyboardInterrupt pass
  } finally {
    restoreSigint();
    if (stepOpen) {
      if (currentStepActions.length) finishStep();
      else removeEmptyOpenStep();
    }
    if (topicOpen) finishTopic();
    finalizeLogFile();
  }
}

await main();
