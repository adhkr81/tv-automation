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
    /** Extra settle wait after #btnGraphicCapture becomes visible before starting topics. */
    remoteReadySettleMs: 2000,
    startButtonPostClickMs: 1500,
    popupEventMs: 12000,
    popupFallbackLookupMs: 20000,
    popupDomReadyMs: 10000,
    popupInitialSettleMs: 2000,
    popupImageReadyMs: 25000,
    /** Wait for window.blobImg after preview looks ready (RM sometimes sets blob shortly after decode). */
    popupBlobImgWaitMs: 12000,
    /** Hard cap for popup script extraction (fetch/blob/base64). */
    popupEvaluateMs: 120000,
    /** Per-fetch timeout inside the capture popup (preview URL / imgUrl endpoint). */
    popupBlobFetchMs: 45000,
    /** Playwright screenshot fallback — off by default; enable only if blob path cannot work. */
    previewScreenshotMs: 30000,
    popupPostCloseMs: 5000,
    loadingVisibleMs: 6000,
    loadingHiddenMs: 45000,
    downloadMs: 8000,
    defaultStepWaitMs: 800,
  },

  capture: {
    outputDir: "captures",
    modeOutputSubdirs: {
      "2026tv": "2026tv",
      "2025tv": "2025tv",
    },
    // Reused captures skip popup/download time; this wait keeps step timing stable.
    reuseStepSettleMs: 1200,
    retryAttempts: 3,
    /** Per popup-open: in-page blob/canvas/fetch retries before giving up this invocation. */
    popupExtractAttempts: 6,
    /** Playwright #previewImg screenshot only when true (default: blob-only saves). */
    enablePreviewScreenshotFallback: false,
    retryWaitMs: 800,
    popupWaitMs: 1500,
    keepBrowserOpenEnv: "KEEP_BROWSER_OPEN",
    heartbeatKey: "KEY_RED",
    heartbeatIntervalMs: 8000,
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
    startedTopicDetailedTemplate: "detailed.log",
    startedTopicSummaryTemplate: "summarized.log",
    singleTopicDetailedTemplate: "capture-single-topic-{topicId}-detailed-{timestamp}.log",
    singleTopicSummaryTemplate: "capture-single-topic-{topicId}-{timestamp}.log",
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
