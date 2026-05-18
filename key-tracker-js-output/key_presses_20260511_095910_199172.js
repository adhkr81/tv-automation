export const keyPresses = {
    "23": {
      steps: [
          [
            { type: "remote", key: "KEY_UP" },
            { type: "remote", key: "KEY_UP" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_RIGHT" },
          ],
          [
            { type: "remote", key: "KEY_LEFT" },
            { type: "remote", key: "KEY_LEFT" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_RIGHT" },
          ],
      ],
    }},
    "56": {
      steps: [
          [
            { type: "remote", key: "KEY_LEFT" },
            { type: "remote", key: "KEY_LEFT" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
          ],
          [
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_DOWN" },
            { type: "remote", key: "KEY_RIGHT" },
          ],
          [
            { type: "capture", mode: "reuse", reuseImage: "1-3" },
            { type: "capture", mode: "reuse", reuseImage: "1-3" },
            { type: "wait", ms: 500 },
          ],
      ],
    }},
};

export default keyPresses;
