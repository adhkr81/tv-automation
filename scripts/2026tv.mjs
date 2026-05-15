/**
 * Named navigation packs (`procedure.reset`, `procedure.foo`, …). Use inline
 * `{ type: "procedure", mode: "<name>" }` in topic steps where you want that pack to run.
 *
 * Optional: `runModes.runResetBeforeFirstTopic` / `runResetBetweenTopics` in automationConfig can still
 * auto-run `procedure.reset` before topics (off by default).
 *
 * Legacy: `export const reset = { "0": { steps: [...] } }` is merged into `procedure.reset` when missing.
 */
export const procedure = {
  reset: {
    steps: [
      [
        { type: "remote", key: "KEY_HOME" },
        { type: "wait", ms: 800 },
        { type: "remote", key: "KEY_LEFT" },
        { type: "wait", ms: 800 },
        { type: "remote", key: "KEY_LEFT" },
        { type: "wait", ms: 800 },
        { type: "remote", key: "KEY_LEFT" },
        { type: "wait", ms: 800 },
        { type: "remote", key: "KEY_DOWN" },
        { type: "wait", ms: 800 },
        { type: "remote", key: "KEY_DOWN" },
        { type: "wait", ms: 800 },
        { type: "remote", key: "KEY_DOWN" },
        { type: "wait", ms: 800 },
        { type: "remote", key: "KEY_ENTER" },
        { type: "wait", ms: 1200 },
        { type: "remote", key: "KEY_RIGHT" },
        { type: "wait", ms: 800 },
        { type: "remote", key: "KEY_ENTER" },
        { type: "wait", ms: 1200 },
        { type: "remote", key: "KEY_HOME" },
        { type: "wait", ms: 800 },
      ],
    ],
  },
};

//DEFAULT WAIT BETWEEN KEYS IS 800MS, ADD SPECIFIC WAITS FOR EACH STEP IF NEEDED
export const topics = {
"g_2": {
  "topicUrl": "sign-in-to-a-samsung-account",
  "steps": [
    [
      {
        "type": "remote",
        "key": "KEY_HOME"
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "wait",
        "ms": 6000
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "wait",
        "ms": 6500
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "wait",
        "ms": 5000
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "wait",
        "ms": 5000
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "capture",
        "mode": "reuse",
        "reuseImage": "previous"
      },
      {
        "type": "wait",
        "ms": 1000
      },
      {
        "type": "remote",
        "key": "KEY_RIGHT"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_ENTER"
      }
    ]
  ],
  "imageGroupPrefix": "2"
},
"g_3": {
  "topicUrl": "sign-out-of-a-samsung-account",
  "steps": [
    [
      {
        "type": "remote",
        "key": "KEY_HOME"
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "wait",
        "ms": 6000
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "remote",
        "key": "KEY_UP"
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "wait",
        "ms": 3000
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "wait",
        "ms": 2000
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "remote",
        "key": "KEY_DOWN"
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "remote",
        "key": "KEY_ENTER"
      },
      {
        "type": "remote",
        "key": "KEY_LEFT"
      },
      {
        "type": "capture",
        "mode": "screen"
      }
    ],
    [
      {
        "type": "capture",
        "mode": "reuse",
        "reuseImage": "2-5"
      },
      {
        "type": "remote",
        "key": "KEY_HOME"
      }
    ]
  ],
  "imageGroupPrefix": "3"
}

};
