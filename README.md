# TV Automation Starter

This repository contains a Playwright starter automation for Samsung RMUS Remote Management.

## Target
- URL: `https://rmus.samsungcsportal.com/RemoteControl#none`
- Current baseline test validates that the login page loads and the main login controls are visible.

## Prerequisites
- Node.js (v16+)
- npm

## Setup
1. Open a terminal in the project folder.
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Install Playwright browser:
   ```powershell
   npx playwright install chromium
   ```

## Configuration
Update `config/automationConfig.js` to change environment URL, selectors, or credentials:

- `baseUrl`: target environment URL
- `selectors.usernameInput`
- `selectors.passwordInput`
- `selectors.loginButton`
- `credentials.username`: your login username
- `credentials.password`: your login password

## Run Automation
- Capture login session (one-time, headed):
  ```powershell
  npx playwright test automations/auth.setup.js --project=setup --headed
  ```
- Run all tests:
  ```powershell
  npx playwright test
  ```
- Run only the starter test:
  ```powershell
  npx playwright test automations/tv_automation.spec.js
  ```
- Run headed (show browser):
  ```powershell
  npx playwright test --headed
  ```
- Open HTML report:
  ```powershell
  npx playwright show-report
  ```

## Authentication (storageState)
- This project reuses authenticated session state from `playwright/.auth/user.json`.
- Username and password are filled automatically from `automationConfig.js`.
- PIN/OTP codes must be entered manually in the browser when prompted (since they are randomized).
- If your session expires, run setup again:
  ```powershell
  npx playwright test automations/auth.setup.js --project=setup --headed
  ```

## Project Structure
- `automations/`: Playwright test files.
- `config/`: Base URL and page selectors.
- `lib/`: Shared helper functions.
- `playwright.config.js`: Playwright global configuration (`testDir` is `./automations`).
