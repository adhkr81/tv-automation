export const automationConfig = {
  baseUrl: "https://rmus.samsungcsportal.com/RemoteControl#none",

  selectors: {
    usernameInput: "#userId",
    passwordInput: "#userPW",
    loginButton: '#lbLogin, input[name="lbLogin"], input[type="submit"][value="LOGIN"]',
    pinInput:
      'input[name*="pin" i], input[id*="pin" i], input[autocomplete="one-time-code"], input[inputmode="numeric"]',
    remoteMap: "map#remote_control_TV_US",
    remoteArea: "map#remote_control_TV_US area",
    remoteStartButton: "#btnRemoteStart",
    captureButton: "#btnGraphicCapture",
    loadingOverlays:
      ".rc_virtual .box_loading, .pop_rm .box_loading, .rc_keys .box_loading",
  },

  security: {
    usernameEnv: "RMUS_USERNAME",
    passwordEnv: "RMUS_PASSWORD",
  },

  timeouts: {
    loginNavigationMs: 60000,
    initialPageSettleMs: 2000,
    loginSelectorVisibleMs: 10000,
    authMonitorTotalMs: 240000,
    authMustRunUntilMs: 30000,
    authStableNoAuthAfterMfaMs: 10000,
    authStableNoAuthWithoutMfaMs: 15000,
    remoteMapReadyMs: 60000,
    startButtonPostClickMs: 1500,
    popupEventMs: 12000,
    popupFallbackLookupMs: 20000,
    popupDomReadyMs: 10000,
    popupInitialSettleMs: 2000,
    popupImageReadyMs: 15000,
    popupPostCloseMs: 5000,
    loadingVisibleMs: 6000,
    loadingHiddenMs: 45000,
    downloadMs: 8000,
  },

  capture: {
    outputDir: "captures",
    retryAttempts: 3,
    retryWaitMs: 800,
    popupWaitMs: 1000,
    keepBrowserOpenEnv: "KEEP_BROWSER_OPEN",
    heartbeatKey: "KEY_RED",
    heartbeatIntervalMs: 10000,
  },

  runModes: {
    requireTopicInSingleMode: true,
    runResetBeforeFirstTopic: true,
    runResetBetweenTopics: true,
  },

  topicPolicy: {
    allowTopicIds: [],
    defaultStartTopic: "",
    maxTopicsPerRun: 0,
  },

  healthChecks: {
    requiredSelectors: [
      "#userId",
      "#userPW",
      "#lbLogin, input[name=\"lbLogin\"], input[type=\"submit\"][value=\"LOGIN\"]",
      "map#remote_control_TV_US",
    ],
    requiredUrlIncludes: ["/RemoteControl"],
  },

  featureFlags: {
    enableStartButtonClick: true,
    enableHeartbeatRedKey: true,
    enablePopupFallback: true,
  },

  logNaming: {
    startedTopicTemplate: "capture-started-topic-{topicId}-{timestamp}.log",
    singleTopicTemplate: "capture-single-topic-{topicId}-{timestamp}.log",
    pendingTemplate: "capture-pending-{timestamp}.log",
  },

  delays: {
    short: { min: 500, max: 1500 },
    medium: { min: 2000, max: 4000 },
    long: { min: 5000, max: 8000 },
  },

  logging: {
    ignoreConsoleErrors: ["ResizeObserver loop", "Non-Error promise rejection"],
    ignorePageErrors: [],
    ignoreRequestFailureErrors: ["net::ERR_ABORTED", "net::ERR_BLOCKED_BY_CLIENT"],
  },

  network: {
    suppressRequestFailedLogs: false,
    ignoreFailedRequests: ["medallia", "kampyle", "newrelic", "appmeasurement", "analytics", "doubleclick"],
  },
};
