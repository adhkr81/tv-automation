# Local Web Dashboard Plan (TV Automation)

This document describes a proposed simple UI for the RMUS topic capture system: a **local web dashboard** that controls runs, streams logs, and shows screenshots—without Electron or a heavy frontend build.

## Goals

- Start/stop capture runs from a browser instead of only the terminal
- See live log output while a run is in progress
- Browse screenshots as they appear under `captures/`
- Optionally resume from a chosen topic ID (already supported by the CLI via prompts)

## Stack

| Piece | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Node.js (already used) | No new runtime |
| Server | Small HTTP server in `scripts/server.mjs` | Spawns the existing runner as a child process |
| Frontend | Single static page (`ui/index.html`) + vanilla JS + CSS | No bundler, fast to ship |
| Live logs | Server-Sent Events (SSE) | One-way stream from server to browser is enough |
| Files | `fs.watch` on `captures/` | Push new thumbnails into the gallery when files land |

Optional later: swap vanilla JS for a tiny framework only if the UI grows.

## UI Layout (three panels)

### Left — Run control

- Dropdown populated from topic IDs (derived from `scripts/topics.mjs` or an API that reads it)
- **Start** / **Stop** (SIGINT on the child process, matching today’s graceful interrupt)
- Status: Idle | Running | Finished | Interrupted

### Center — Live log

- Append-only scroll region fed by SSE (same lines written to `logs/capture-run-*.log`)
- Simple highlighting by prefix: topic lines, step lines, capture success/failure

### Right — Screenshot gallery

- Grid of thumbnails from `captures/` sorted by newest first or grouped by topic prefix
- Click opens full-size image in a modal or new tab
- Badge or styling when a step logged “capture NOT saved”

## HTTP API Shape

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Serve `ui/index.html` (and static assets if split) |
| `GET` | `/api/topics` | Return topic IDs (and optional labels if added later) |
| `GET` | `/api/captures` | List files in `captures/` with names and mtimes |
| `GET` | `/api/log/stream` | SSE: push each log line as it is produced |
| `POST` | `/api/run/start` | Body: `{ startTopicId?: string }` — spawn capture runner |
| `POST` | `/api/run/stop` | Send SIGINT to child |
| `GET` | `/captures/:filename` | Serve image bytes with correct `Content-Type` |

Security note: bind only to `127.0.0.1` by default so the control plane is not exposed on the LAN without an explicit choice.

## Runner Integration

Today `scripts/run-topic-captures.mjs`:

- Uses readline for “resume from topic” and for **PIN confirmation** (“press Enter after PIN…”).

For the UI:

1. **Topic start**: pass start topic via env (e.g. `CAPTURE_START_TOPIC`) or CLI flag so the server does not need to fake stdin for that prompt.
2. **PIN confirmation**: replace blocking `rl.question(...)` with a Promise that resolves when the server receives `POST /api/run/confirm-pin` (or similar). The modal in the browser replaces the terminal prompt.

Estimated change size in the runner: small (env for topic + async wait for PIN confirmation).

## File Layout After Implementation

```
scripts/
  server.mjs              # HTTP + SSE + child process + optional fs.watch
  run-topic-captures.mjs    # Minor: env/topic + Promise-based PIN gate
  topics.mjs
ui/
  index.html                # Shell + panels + fetch/SSE client
```

## npm Script

```json
"ui": "node scripts/server.mjs"
```

Usage: `npm run ui` → open `http://localhost:<port>` (port configurable via env, default e.g. 3000).

## Non-goals (for v1)

- Multi-user or authentication (local-only loopback is enough)
- Editing `topics.mjs` from the UI (optional v2)
- Deploying to the public internet without TLS and auth

## Tradeoffs

| Benefit | Cost |
|---------|------|
| Familiar browser UX for logs + images | Runner must expose a clean programmatic contract (env + PIN Promise) |
| No new compile step | Vanilla HTML/CSS maintenance if UI grows large |

---

*Last updated: plan only; implementation not started.*
