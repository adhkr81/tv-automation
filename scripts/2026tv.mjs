export const reset = {};


//DEFAULT WAIT BETWEEN KEYS IS 800MS, ADD SPECIFIC WAITS FOR EACH STEP IF NEEDED
export const topics = {
  "g_1": {
    "slug": "first-time-setup",
    "topic": "First time setup"
  },
  "g_2": {
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
          "ms": 200
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
          "ms": 200
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
        "ms": 1200
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
},

};
