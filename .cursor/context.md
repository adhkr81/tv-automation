# Samsung Survey QA Bot - Project Context

## Overview
A Playwright-based automation bot that validates survey components within interactive simulators on Samsung.com support pages. The bot automates testing of survey functionality across multiple simulators on a single page.

## Key Features
- **Multi-Simulator Support**: Iterates through all simulators on a single page
- **Iframe Handling**: Automatically detects and switches to simulator and survey iframes
- **Human-like Behavior**: Randomized delays and smooth scrolling to simulate realistic user interaction
- **Comprehensive Error Logging**: Captures console errors, page errors, and network failures
- **Debugging Tools**: Generates Playwright traces and videos for every test run

## Project Structure
- `config/testConfig.js`: Configuration for URLs, CSS selectors, and timing delays
- `lib/helpers.js`: Shared helper functions for human-like interaction and logging
- `tests/surveyValidation.spec.js`: Core Playwright test script
- `playwright.config.js`: Global Playwright settings (video, trace, browsers)

## Technology Stack
- **Node.js** (v16+)
- **Playwright**: Browser automation framework
- **npm**: Package management

## Configuration
The bot requires configuration in `config/testConfig.js` with:
- `baseUrl`: Target Samsung support page URL
- `selectors`: CSS selectors for:
  - Simulator containers
  - Simulator iframes
  - Survey triggers
  - Survey iframes
  - Survey options
  - Submit buttons

## Test Execution
- Run tests: `npx playwright test`
- View results: `npx playwright show-report`
- Test artifacts are stored in `test-results/` and `playwright-report/`

## Important Notes
- The bot handles nested iframes (simulator iframe → survey iframe)
- Includes realistic delays and scrolling to avoid detection
- Generates comprehensive debugging artifacts (traces, videos, screenshots)
