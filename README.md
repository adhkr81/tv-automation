# TV Automation

Playwright-based automation for the Samsung RMUS Remote Management portal. Navigates a connected TV via the on-screen remote, triggers graphic captures at explicit points in the topic steps, and saves the resulting screenshots locally.

## Target

- URL: `https://rmus.samsungcsportal.com/RemoteControl#none`

## Prerequisites

- Node.js v18+
- npm

## Setup

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Install the Chromium browser used by Playwright:
   ```powershell
   npx playwright install chromium
   ```
3. Copy the example env file and fill in your credentials:
   ```powershell
   copy .env.example .env
   ```
   Then edit `.env`:
   ```
   RMUS_USERNAME=your_username
   RMUS_PASSWORD=your_password
   ```

## Configuration

| File | Purpose |
|---|---|
| `config/automationConfig.js` | Base URL, CSS selectors, delays, logging/network filters |
| `scripts/2025tv.mjs` | Default topic definitions used by `npm run capture` |
| `scripts/2026tv.mjs` | Alternate topic definitions used by `npm run capture-2026` |

**Credentials** are read from environment variables (`RMUS_USERNAME`, `RMUS_PASSWORD`). Do not put them directly in `automationConfig.js`.

### Topic format (`scripts/<topics-file>.mjs`)

Each topics file exports `reset` and `topics`. The `reset` export is currently intentionally empty (`export const reset = {};`), so the runner no longer performs an initial reset sequence before the first topic.

Each topic is a keyed entry with optional metadata such as `topic`, `slug`, `topicUrl`, or `imageGroupPrefix`, plus an array of steps. A bare action array runs exactly the actions listed. Captures are only taken when a `capture` action appears inside the array:

```js
// No capture is taken here
"1": {
  slug: "example-topic",
  steps: [
    [
      { type: "remote", key: "KEY_ENTER" },
      { type: "wait", ms: 500 },
    ],
  ],
},

// Capture happens immediately where the capture action appears.
// Actions after it still run.
"2": {
  topic: "Example Capture Topic",
  slug: "example-capture-topic",
  steps: [
    [
      { type: "remote", key: "KEY_RETURN" },
      { type: "wait", ms: 700 },
      { type: "capture", mode: "screen", captureRetries: 5, retryWaitMs: 1000 },
      { type: "remote", key: "KEY_DOWN" },
    ],
  ],
},
```

Supported action types:

| type | fields | description |
|---|---|---|
| `remote` | `key` | Clicks the `<area alt="key">` on the remote control map |
| `wait` | `ms` | Waits the given number of milliseconds |
| `capture` | `mode`, `reuseImage` | Saves, skips, or reuses a screenshot at that point in the action list |

Capture `mode` values:

| mode | behavior |
|---|---|
| `screen` | Fresh RM graphic capture (default if `mode` is omitted) |
| `reuse` | Copies a previous saved capture, using `reuseImage` such as `"previous"` |
| `skip` | Skips capture at that point |

## Running

### Capture all 2025 topics

```powershell
npm run capture
```

### Capture all 2026 topics

```powershell
npm run capture-2026
```

This opens a headed Chromium window, navigates to the RMUS portal, and prompts you to:

1. Log in with your credentials (filled automatically)
2. Enter the PIN/OTP manually when the portal asks (randomized each session)
3. Press **Enter** in the terminal once you see the Remote Control page

The script then runs through every topic in the selected topics file, pressing the configured remote keys and saving screenshots only at explicit `capture` actions. With the current topic files, no initial `reset["0"]` sequence runs.

### Resume from a specific topic

When prompted, type the full topic ID instead of pressing Enter. For `g_` topic IDs, you can also type just the numeric suffix:

```
Press Enter to start from beginning, or type a topic number (g_54, g_55, g_56, g_1, g_2): 54
```

### Keep the browser open after a run

```powershell
$env:KEEP_BROWSER_OPEN="1"; npm run capture
```

## Output

| Path | Contents |
|---|---|
| `captures/2025tv/` | Screenshots from `npm run capture` |
| `captures/2026tv/` | Screenshots from `npm run capture-2026` |
| `logs/run-<timestamp>/` | Per-run logs, summaries, missed captures, and reuse plan |

Screenshots are named `<topicId>-<stepNumber>.(png|jpg)`. Later captures in the same step use `<topicId>-<stepNumber>-captureN`.

These output folders are gitignored.

## Project Structure

```
config/
  automationConfig.js   # URL, selectors, delays, logging/network config
lib/
  helpers.js            # humanDelay, smartScroll, logEvent, popup dismissal, error logging
  loginFlow.js          # loginAndWaitAuthenticated - handles login + MFA polling
scripts/
  2025tv.mjs            # Default topic definitions for npm run capture
  2026tv.mjs            # Topic definitions for npm run capture-2026
  run-topic-captures.mjs # Main runner script
playwright.config.js    # Playwright project config (chromium, storage state, etc.)
```
