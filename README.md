# TV Automation

Playwright-based automation for the Samsung RMUS Remote Management portal. Navigates a connected TV via the on-screen remote, triggers graphic captures for each configured topic step, and saves the resulting screenshots locally.

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
| `scripts/topics.mjs` | Topic definitions — which remote key sequences to run and capture |

**Credentials** are read from environment variables (`RMUS_USERNAME`, `RMUS_PASSWORD`). Do not put them directly in `automationConfig.js`.

### Topic format (`scripts/topics.mjs`)

Each topic is a keyed entry with an array of steps. Each step is either a bare action array (capture after every step) or an object that gives you more control:

```js
// Shorthand — capture is taken after this step automatically
"1": {
  steps: [
    [
      { type: "remote", key: "ENTER" },
      { type: "wait", ms: 500 },
    ],
  ],
},

// Object form — disable capture or configure retries
"2": {
  steps: [
    {
      skipCapture: true,         // no screenshot for this step
      captureRetries: 5,         // override default retry count
      retryWaitMs: 1000,
      actions: [
        { type: "remote", key: "EXIT" },
        { type: "wait", ms: 700 },
      ],
    },
  ],
},
```

Supported action types:

| type | fields | description |
|---|---|---|
| `remote` | `key` | Clicks the `<area alt="key">` on the remote control map |
| `wait` | `ms` | Waits the given number of milliseconds |

## Running

### Capture all topics

```powershell
npm run capture:topics
```

This opens a headed Chromium window, navigates to the RMUS portal, and prompts you to:

1. Log in with your credentials (filled automatically)
2. Enter the PIN/OTP manually when the portal asks (randomised each session)
3. Press **Enter** in the terminal once you see the Remote Control page

The script then runs through every topic in `scripts/topics.mjs`, pressing the configured remote keys and saving a screenshot after each step.

### Resume from a specific topic

When prompted, type the topic number instead of pressing Enter:

```
Press Enter to start from beginning, or type a topic number (0, 1, 143, 200, 201): 143
```

### Keep the browser open after a run

```powershell
$env:KEEP_BROWSER_OPEN="1"; npm run capture:topics
```

## Output

| Path | Contents |
|---|---|
| `captures/` | Screenshots named `<topicId>-<stepNumber>.(png\|jpg)` |
| `logs/` | Per-run log file: `capture-run-<timestamp>.log` |

Both folders are gitignored.

## Project Structure

```
config/
  automationConfig.js   # URL, selectors, delays, logging/network config
lib/
  helpers.js            # humanDelay, smartScroll, logEvent, popup dismissal, error logging
  loginFlow.js          # loginAndWaitAuthenticated — handles login + MFA polling
scripts/
  topics.mjs            # Topic definitions (remote sequences + capture options)
  run-topic-captures.mjs # Main runner script
playwright.config.js    # Playwright project config (chromium, storage state, etc.)
```
