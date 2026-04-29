export const topics = {
  "0": {
    steps: [
      {
        skipCapture: true,
        actions: [
          { type: "remote", key: "ENTER" },
          { type: "wait", ms: 500 },
        ],
      }
    ],
  },
  "1": {
    steps: [
      [
        { type: "remote", key: "?" },
        { type: "wait", ms: 500 },
        { type: "remote", key: "◀" },
        { type: "wait", ms: 700 },
      ],
      [
        { type: "remote", key: "▲" },
        { type: "wait", ms: 500 },
        { type: "remote", key: "ENTER" },
        { type: "wait", ms: 800 },
      ],
      [
        { type: "remote", key: "▼" },
        { type: "wait", ms: 500 },
        { type: "remote", key: "ENTER" },
        { type: "wait", ms: 800 },
      ],
    ],
  },
  "2": {
    steps: [
      [
        { type: "remote", key: "?" },
        { type: "wait", ms: 500 },
        { type: "remote", key: "▶" },
        { type: "wait", ms: 700 },
      ],
      [
        { type: "remote", key: "◀" },
        { type: "wait", ms: 500 },
        { type: "remote", key: "▲" },
        { type: "wait", ms: 700 },
      ],
      [
        { type: "remote", key: "▼" },
        { type: "wait", ms: 500 },
        { type: "remote", key: "ENTER" },
        { type: "wait", ms: 800 },
      ],
      [
        { type: "remote", key: "ENTER" },
        { type: "wait", ms: 900 },
      ],
    ],
  }
};

