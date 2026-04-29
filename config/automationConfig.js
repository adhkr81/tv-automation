export const automationConfig = {
  // New target portal.
  baseUrl: "https://rmus.samsungcsportal.com/RemoteControl#none",

  // Starter selectors for the RMUS login page.
  selectors: {
    usernameInput: '#userId',
    passwordInput: '#userPW', 
    loginButton: '#lbLogin, input[name="lbLogin"], input[type="submit"][value="LOGIN"]',
    pinInput:
      'input[name*="pin" i], input[id*="pin" i], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
  },

  // Login credentials (username and password will be filled automatically, PIN entered manually)
  credentials: {
    username: "SEA_SNACC",
    password: "samsung1@@",
  },

  browser: {
    viewport: null,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },

  delays: {
    short: { min: 500, max: 1500 },
    medium: { min: 2000, max: 4000 },
    long: { min: 5000, max: 8000 },
  },

  logging: {
    // Console error substrings to suppress (matched against msg.text())
    ignoreConsoleErrors: [
      "ResizeObserver loop",
      "Non-Error promise rejection",
    ],
    // Page error substrings to suppress (matched against exception.message)
    ignorePageErrors: [],
    // requestfailed failure reason substrings to suppress
    ignoreRequestFailureErrors: [
      "net::ERR_ABORTED",
      "net::ERR_BLOCKED_BY_CLIENT",
    ],
  },

  network: {
    // Set to true to silence all requestfailed log entries
    suppressRequestFailedLogs: false,
    // URL substrings for requests whose failures should not be logged
    ignoreFailedRequests: [
      "medallia",
      "kampyle",
      "newrelic",
      "appmeasurement",
      "analytics",
      "doubleclick",
    ],
  },
};
