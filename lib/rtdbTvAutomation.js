import fs from "node:fs";
import path from "node:path";
import admin from "firebase-admin";
import { tvAutomationGroupHasNonEmptySteps } from "../../app/src/processData/tvAutomationSchema.js";

let databaseInstance = null;

/**
 * @returns {import("firebase-admin").database.Database}
 */
export function getRtdb() {
  if (databaseInstance) return databaseInstance;
  const databaseURL = (process.env.FIREBASE_DATABASE_URL || "").trim();
  if (!databaseURL) {
    throw new Error(
      "FIREBASE_DATABASE_URL is required when using --source=rtdb (same value as VITE_FIREBASE_DATABASE_URL in the app).",
    );
  }

  if (!admin.apps.length) {
    const credPath = (process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();
    /** @type {import("firebase-admin").AppOptions} */
    const options = { databaseURL };
    if (credPath) {
      const abs = path.isAbsolute(credPath) ? credPath : path.join(process.cwd(), credPath);
      if (!fs.existsSync(abs)) {
        throw new Error(`Service account file not found: ${abs}`);
      }
      const serviceAccount = JSON.parse(fs.readFileSync(abs, "utf8"));
      options.credential = admin.credential.cert(serviceAccount);
    } else {
      options.credential = admin.credential.applicationDefault();
    }
    admin.initializeApp(options);
  }

  databaseInstance = admin.database();
  return databaseInstance;
}

/**
 * @returns {string}
 */
export function resolveRtdbProjectPath() {
  const raw = (process.env.RTDB_PROJECT_PATH || "").trim().replace(/^\/+|\/+$/g, "");
  if (!raw) {
    throw new Error(
      "RTDB_PROJECT_PATH is required when using --source=rtdb (e.g. projects/my-company/my-simulator).",
    );
  }
  if (!raw.startsWith("projects/")) {
    throw new Error(`RTDB_PROJECT_PATH must start with "projects/" (got: ${raw})`);
  }
  return raw;
}

/**
 * @returns {Set<string> | null} lowercase group ids like `g_2`
 */
export function resolveRtdbTopicGroupFilter() {
  const raw = (process.env.RTDB_TOPIC_GROUPS || "").trim();
  if (!raw) return null;
  const ids = raw
    .split(/[,\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((id) => (id.startsWith("g_") ? id : `g_${id}`));
  return ids.length > 0 ? new Set(ids) : null;
}

/**
 * Map one `simulator/tvAutomation/g_*` node to the shape expected by run-topic-captures.mjs.
 * @param {string} groupKey e.g. `g_2`
 * @param {unknown} entry
 * @returns {object | null}
 */
export function mapRtdbGroupToRunnerTopic(groupKey, entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  if (!tvAutomationGroupHasNonEmptySteps(entry)) return null;
  const steps = /** @type {{ steps?: unknown }} */ (entry).steps;
  if (!Array.isArray(steps)) return null;

  const slug =
    typeof /** @type {{ slug?: string }} */ (entry).slug === "string"
      ? entry.slug.trim()
      : "";
  const topic =
    typeof /** @type {{ topic?: string }} */ (entry).topic === "string"
      ? entry.topic.trim()
      : "";
  const legacyTopicUrl =
    typeof /** @type {{ topicUrl?: string }} */ (entry).topicUrl === "string"
      ? entry.topicUrl.trim()
      : "";

  const prefix = groupKey.startsWith("g_") ? groupKey.slice(2) : groupKey;

  /** @type {Record<string, unknown>} */
  const out = {
    steps,
    imageGroupPrefix: prefix,
  };
  if (slug) {
    out.slug = slug;
    out.topicUrl = slug;
  } else if (legacyTopicUrl) {
    out.topicUrl = legacyTopicUrl;
  }
  if (topic) out.topic = topic;
  return out;
}

/**
 * @param {unknown} tvAutomation raw `simulator/tvAutomation` object from RTDB
 * @param {{ allowGroups?: Set<string> | null }} [opts]
 * @returns {Record<string, object>}
 */
export function mapTvAutomationRootToTopics(tvAutomation, opts = {}) {
  const { allowGroups = null } = opts;
  if (!tvAutomation || typeof tvAutomation !== "object" || Array.isArray(tvAutomation)) {
    return {};
  }

  /** @type {Record<string, object>} */
  const topics = {};
  const keys = Object.keys(tvAutomation).sort((a, b) => {
    const na = Number(a.replace(/^g_/, ""));
    const nb = Number(b.replace(/^g_/, ""));
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.localeCompare(b);
  });

  for (const groupKey of keys) {
    if (!groupKey.startsWith("g_")) continue;
    if (allowGroups && !allowGroups.has(groupKey.toLowerCase())) continue;
    const mapped = mapRtdbGroupToRunnerTopic(groupKey, tvAutomation[groupKey]);
    if (mapped) topics[groupKey] = mapped;
  }
  return topics;
}

/**
 * Fetch `simulator/tvAutomation` from RTDB and return runner `topics` object.
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchTvAutomationTopics() {
  const projectPath = resolveRtdbProjectPath();
  const allowGroups = resolveRtdbTopicGroupFilter();
  const db = getRtdb();
  const snap = await db.ref(`${projectPath}/simulator/tvAutomation`).get();
  if (!snap.exists()) {
    throw new Error(`No tvAutomation data at ${projectPath}/simulator/tvAutomation`);
  }
  const topics = mapTvAutomationRootToTopics(snap.val(), { allowGroups });
  const count = Object.keys(topics).length;
  if (count === 0) {
    const hint = allowGroups
      ? ` (filter RTDB_TOPIC_GROUPS=${[...allowGroups].join(",")})`
      : "";
    throw new Error(`No g_* topic groups found under tvAutomation${hint}`);
  }
  console.log(
    `RTDB: loaded ${count} topic group(s) from ${projectPath}/simulator/tvAutomation`,
  );
  return topics;
}

/**
 * @param {string} topicsFileName e.g. `2026tv.mjs`
 * @param {Record<string, unknown>} topics
 * @returns {string} absolute path written
 */
export function writeGeneratedTopicsModule(topicsFileName, topics) {
  const base = path.parse(topicsFileName).name;
  const outName = `${base}.topics.generated.mjs`;
  const outPath = path.join(process.cwd(), "scripts", outName);
  const body = `/** Auto-generated from RTDB — do not edit. Re-run with --write-topics to refresh. */\nexport const topics = ${JSON.stringify(topics, null, 2)};\n`;
  fs.writeFileSync(outPath, body, "utf8");
  console.log(`Wrote generated topics: scripts/${outName}`);
  return outPath;
}
