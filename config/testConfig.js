export const testConfig = {
  // New target portal.
  baseUrl: "https://rmus.samsungcsportal.com/RemoteControl#none",

  // Starter selectors for the RMUS login page.
  selectors: {
    usernameInput: 'input[name="id"], input[type="text"]',
    passwordInput: 'input[name="password"], input[type="password"]',
    loginButton: 'button[type="submit"], input[type="submit"], button:has-text("Log-In")',
    pinInput:
      'input[name*="pin" i], input[id*="pin" i], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
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
};
