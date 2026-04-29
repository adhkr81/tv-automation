# Samsung Remote + RM Capture Setup

This guide explains how to run this project with:

- **TV navigation/input** sent via the `samsung-tv-remote` package.
- **OSD capture** still triggered from the RM website UI (`#btnGraphicCapture`).

## Prerequisites

- Node.js installed
- Dependencies installed in this repo:

```powershell
npm install
```

- TV and PC on the same local network
- TV IP address available

## How the flow works

When enabled, the runner uses:

- `samsung-tv-remote` for all `type: "remote"` actions from `scripts/topics.mjs`
- RM UI only for login/session state and capture button clicks

The capture pipeline itself remains unchanged.

## 1) Environment setup via `.env` (recommended)

Create a `.env` file in the project root (same level as `package.json`).

You can copy from `.env.example`:

```powershell
Copy-Item .env.example .env
```

Then edit `.env`:

```dotenv
USE_SAMSUNG_REMOTE=1
SAMSUNG_TV_IP=YOUR_TV_IP
SAMSUNG_REMOTE_NAME=TV Automation
# Optional:
# SAMSUNG_TV_PORT=8002
# SAMSUNG_TV_TIMEOUT_MS=5000
# SAMSUNG_TV_KEYS_DELAY_MS=60
```

Notes:
- `SAMSUNG_TV_PORT` is often `8002` (secure) or `8001` on some models.
- Increase `SAMSUNG_TV_KEYS_DELAY_MS` if key presses are occasionally dropped.

## 2) Confirm topics use package key names

`scripts/topics.mjs` should use `KEY_*` actions (already updated), for example:

- `KEY_CONTENTS`
- `KEY_LEFT`
- `KEY_DOWN`
- `KEY_ENTER`

## 3) Run capture

```powershell
npm run capture:topics
```

Expected startup message:

- `Remote input mode: samsung-tv-remote package (RM UI capture button still used)`

## 4) Verify TV remote connection

Connection is considered good if:

- TV asks to allow a new remote/client (first run), and you approve it
- TV reacts to initial key actions from topic steps
- run continues and captures are saved under `captures/`

## Quick troubleshooting

If TV does not react:

1. Verify `SAMSUNG_TV_IP` is correct.
2. Ensure TV and PC are on the same subnet.
3. Re-run and accept the TV pairing prompt.
4. Try changing port:
   - `SAMSUNG_TV_PORT=8001`
   - or `SAMSUNG_TV_PORT=8002`
5. Increase delay:
   - `SAMSUNG_TV_KEYS_DELAY_MS=120`

If capture works but navigation does not, the issue is remote connectivity (not RM capture).

## Alternative: Windows user-level env vars

If you prefer global values on your machine, set them once:

```powershell
[Environment]::SetEnvironmentVariable("USE_SAMSUNG_REMOTE","1","User")
[Environment]::SetEnvironmentVariable("SAMSUNG_TV_IP","YOUR_TV_IP","User")
[Environment]::SetEnvironmentVariable("SAMSUNG_REMOTE_NAME","TV Automation","User")
```

Optional:

```powershell
[Environment]::SetEnvironmentVariable("SAMSUNG_TV_PORT","8002","User")
[Environment]::SetEnvironmentVariable("SAMSUNG_TV_TIMEOUT_MS","5000","User")
[Environment]::SetEnvironmentVariable("SAMSUNG_TV_KEYS_DELAY_MS","60","User")
```

Close and reopen terminal after changing user-level env vars.

## Temporary override for a single terminal session

If you do not want persistent user env vars, set them per session:

```powershell
$env:USE_SAMSUNG_REMOTE="1"
$env:SAMSUNG_TV_IP="YOUR_TV_IP"
$env:SAMSUNG_REMOTE_NAME="TV Automation Test"
npm run capture:topics
```

These values disappear when that terminal is closed.
