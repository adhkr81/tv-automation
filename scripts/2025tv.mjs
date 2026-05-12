export const reset = {
    "0": {
      steps: [
        [
          { type: "remote", key: "KEY_HOME" },
          { type: "wait", ms: 700 },
          { type: "remote", key: "KEY_ENTER" },
          { type: "wait", ms: 700 },
          { type: "remote", key: "KEY_HOME" },
          { type: "wait", ms: 700 },
          { type: "capture", mode: "skip" },
        ]
      ],
    },
  }
  
  
  //DEFAULT WAIT BETWEEN KEYS IS 800MS, ADD SPECIFIC WAITS FOR EACH STEP IF NEEDED
  export const topics = 
  {
  "g_54": {
    "slug": "voice-guide",
    "steps": [
      [
        {
          "key": "KEY_UP",
          "type": "remote"
        },
        {
          "key": "KEY_UP",
          "type": "remote"
        },
        {
          "key": "KEY_DOWN",
          "type": "remote"
        },
        {
          "ms": 500,
          "type": "wait"
        }
      ],
      [
        {
          "key": "KEY_RIGHT",
          "type": "remote"
        },
        {
          "key": "KEY_RIGHT",
          "type": "remote"
        },
        {
          "key": "KEY_DOWN",
          "type": "remote"
        }
      ]
    ],
    "topic": "Voice Guide"
  },
  "g_55": {
    "slug": "audio-description-settings",
    "steps": [
      [
        {
          "key": "KEY_DOWN",
          "type": "remote"
        },
        {
          "key": "KEY_DOWN",
          "type": "remote"
        },
        {
          "key": "KEY_LEFT",
          "type": "remote"
        },
        {
          "ms": 500,
          "type": "wait"
        }
      ],
      [
        {
          "mode": "reuse",
          "reuseImage": "previous",
          "type": "capture"
        }
      ]
    ],
    "topic": "Audio Description Settings"
  }
}

  