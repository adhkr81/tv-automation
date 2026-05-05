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
  export const topics = {
    "2": {
      steps: [
        [
            { type: "remote", key: "KEY_HOME" },
          ],
          [
            { type: "remote", key: "KEY_LEFT" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
          ],
          [
              { type: "remote", key: "KEY_ENTER" },
              { type: "wait", ms: 500 },
            ],
          [
            { type: "remote", key: "KEY_ENTER" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "wait", ms: 500 },
          ],
        [
          { type: "remote", key: "KEY_ENTER" },
        ],
        [
          { type: "remote", key: "KEY_DOWN" },
        ],
        [
          { type: "remote", key: "KEY_ENTER" },
        ],
        [
          { type: "remote", key: "KEY_ENTER" },
          { type: "wait", ms: 10000 },
        ],
      ],
    },
    "3": {
      steps: [
        [
            { type: "remote", key: "KEY_HOME" },
          ],
          [
            { type: "remote", key: "KEY_LEFT" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
          ],
          [
              { type: "remote", key: "KEY_ENTER" },
              { type: "wait", ms: 500 },
            ],
          [
            { type: "remote", key: "KEY_ENTER" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "wait", ms: 500 },
          ],
        [
          { type: "remote", key: "KEY_DOWN" },
        ],
        [
          { type: "remote", key: "KEY_ENTER" },
        ]
      ],
    },
    "4": {
      steps: [
        [
            { type: "remote", key: "KEY_HOME" },
          ],
          [
            { type: "remote", key: "KEY_LEFT" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
          ],
          [
              { type: "remote", key: "KEY_ENTER" },
              { type: "wait", ms: 500 },
            ],
          [
            { type: "remote", key: "KEY_ENTER" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "wait", ms: 500 },
          ],
        [
          { type: "remote", key: "KEY_DOWN" },
        ],
        [
          { type: "remote", key: "KEY_ENTER" },
        ]
      ],
    },
    "33": {
        steps: [
          [
            { type: "remote", key: "KEY_HOME" },
          ],
          [
            { type: "remote", key: "KEY_LEFT" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
          ],
          [
              { type: "remote", key: "KEY_ENTER" },
              { type: "wait", ms: 500 },
            ],
          [
            { type: "remote", key: "KEY_ENTER" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "wait", ms: 500 },
          ],
          [
              { type: "remote", key: "KEY_ENTER" },
              { type: "remote", key: "KEY_DOWN" },
              { type: "remote", key: "KEY_DOWN" },
              { type: "remote", key: "KEY_DOWN" },
              { type: "wait", ms: 500 },
            ],
          [
            { type: "remote", key: "KEY_ENTER" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
          ],
          [
              { type: "remote", key: "KEY_ENTER" },
              { type: "wait", ms: 500 },
            ],
            [
              { type: "remote", key: "KEY_ENTER" },
              { type: "wait", ms: 500 },
            ],
        ],
      },
  };
  