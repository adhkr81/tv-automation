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
  "143": {
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
  },
  "200": {
    steps: [
      [
        { type: "remote", key: "?" },
        { type: "wait", ms: 500 },
        { type: "remote", key: "▼" },
        { type: "wait", ms: 700 },
      ],
      [
        { type: "remote", key: "▶" },
        { type: "wait", ms: 500 },
        { type: "remote", key: "ENTER" },
        { type: "wait", ms: 800 },
      ],
      [
        { type: "remote", key: "RETURN" },
        { type: "wait", ms: 700 },
      ],
    ],
  },
  "201": {
    steps: [
      [
        { type: "remote", key: "?" },
        { type: "wait", ms: 500 },
        { type: "remote", key: "▲" },
        { type: "wait", ms: 700 },
      ],
      [
        { type: "remote", key: "◀" },
        { type: "wait", ms: 500 },
        { type: "remote", key: "ENTER" },
        { type: "wait", ms: 800 },
      ],
      [
        { type: "remote", key: "EXIT" },
        { type: "wait", ms: 700 },
      ],
    ],
  },
};

