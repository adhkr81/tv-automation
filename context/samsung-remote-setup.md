# Samsung Remote + RM Capture Setup (Current State)

This project currently runs with:

- **TV navigation/input** sent directly through `samsung-tv-remote`.
- **OSD capture** triggered from RMUS UI (`#btnGraphicCapture`), then saved from popup image/blob extraction.

## Current run entry points

From `package.json`:

```powershell
npm run capture       # runs scripts/run-topic-captures.mjs --topics=2026tv
npm run capture-2025  # runs scripts/run-topic-captures.mjs --topics=2025tv
```

You can also run any topics file manually:

```powershell
node scripts/run-topic-captures.mjs --topics=2025tv
node scripts/run-topic-captures.mjs --topics=2026tv
```

`--topics=<name>` loads `scripts/<name>.mjs`.

## Prerequisites

- Node.js installed
- Dependencies installed:

```powershell
npm install
```

- TV and PC on the same LAN
- TV IP address known
- RMUS credentials available in environment (`RMUS_USERNAME`, `RMUS_PASSWORD`)

## Environment setup (`.env`)

Create `.env` in project root:

```powershell
Copy-Item .env.example .env
```

Recommended values:

```dotenv
SAMSUNG_TV_IP=YOUR_TV_IP
SAMSUNG_REMOTE_NAME=TV Automation
RMUS_USERNAME=your_user
RMUS_PASSWORD=your_password

# Optional tuning
# SAMSUNG_TV_PORT=8002
# SAMSUNG_TV_TIMEOUT_MS=15000
# SAMSUNG_TV_KEYS_DELAY_MS=120
# RMUS_STORAGE_STATE_PATH=.cache/rmus-storage-state.json
# KEEP_BROWSER_OPEN=1
```

Notes:
- `SAMSUNG_TV_IP` is required.
- `USE_SAMSUNG_REMOTE` exists in `.env.example` but is currently not used by the runner (remote mode is always Samsung package mode).
- `SAMSUNG_TV_PORT` is typically `8002` (or `8001` on some models).

## How execution works now

1. Runner starts in Samsung remote mode and prints:
   - `Remote input mode: samsung-tv-remote package (RM UI capture button still used)`
2. Browser opens RMUS page and authenticates (includes PIN/OTP handling flow).
3. If session state file exists, runner asks:
   - `Reuse previous RMUS session? [Y/n]:`
4. After remote page is ready, storage state is saved for next runs.
5. Runner prompts for start topic and mode:
   - run one topic only, or
   - start from selected topic and continue.
6. Captures are saved under `captures/<mode>/` based on `capture.modeOutputSubdirs`.
7. Logs are written under `logs/run-<timestamp>/`:
   - `detailed.log`
   - `summarized.log`
   - `missed-captures.log`
   - `reuse-plan.json`

## Topics and key naming

Topics files must export:

- `topics` object
- `reset` object

Remote actions must use Samsung key names (`KEY_*`), for example:

- `KEY_HOME`
- `KEY_LEFT`
- `KEY_DOWN`
- `KEY_ENTER`

The active topic files in this repo are:

- `scripts/2025tv.mjs`
- `scripts/2026tv.mjs`

## Capture behavior updates

Current capture flow includes:

- Popup detection with fallback lookup if popup event is missed
- Blob/canvas/fetch extraction attempts per capture (`capture.popupExtractAttempts`)
- Optional preview screenshot fallback (disabled by default)
- Automatic step image reuse when navigation fingerprint matches (logged in summary and `reuse-plan.json`)
- Retry loop per step (`capture.retryAttempts`, `capture.retryWaitMs`)

Recent run evidence (`logs/run-2026-05-05T19-12/summarized.log`) confirms reuse is active (for example, topic 3 and 4 steps reused captures from topic 2).

## Quick troubleshooting

If TV does not react:

1. Verify `SAMSUNG_TV_IP`.
2. Confirm TV/PC are on same subnet.
3. Re-run and accept Samsung pairing prompt.
4. Try alternate port (`8001` or `8002`).
5. Increase `SAMSUNG_TV_KEYS_DELAY_MS` (for example `120` or `180`).

If navigation works but captures fail:

1. Check `logs/run-*/missed-captures.log`.
2. Check `logs/run-*/detailed.log` for popup extraction stage failures.
3. Confirm RMUS remote UI is fully loaded (`#btnGraphicCapture` visible).

## Windows env var alternatives

Persistent user-level setup:

```powershell
[Environment]::SetEnvironmentVariable("SAMSUNG_TV_IP","YOUR_TV_IP","User")
[Environment]::SetEnvironmentVariable("SAMSUNG_REMOTE_NAME","TV Automation","User")
[Environment]::SetEnvironmentVariable("RMUS_USERNAME","YOUR_USER","User")
[Environment]::SetEnvironmentVariable("RMUS_PASSWORD","YOUR_PASSWORD","User")
```

Temporary per-terminal setup:

```powershell
$env:SAMSUNG_TV_IP="YOUR_TV_IP"
$env:SAMSUNG_REMOTE_NAME="TV Automation Test"
$env:RMUS_USERNAME="YOUR_USER"
$env:RMUS_PASSWORD="YOUR_PASSWORD"
npm run capture
```

Reopen terminal after changing user-level env vars.
