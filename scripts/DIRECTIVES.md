# Step Directives Reference (`scripts`)

This document describes the directives supported by `run-topic-captures.mjs` when reading a topics file in `scripts/` (for example `2026tv.mjs` or `2025tv.mjs`).

## Step Shapes

You can define each step in one of two ways:

1. **Array step (recommended, consistent style)**
   - A list of action/directive objects.
2. **Object step**
   - `{ actions: [...], ...options }`
   - Useful when you want explicit step-level options.

## Action/Directive Types (inside `actions` or array step)

### 1) Remote key

```js
{ type: "remote", key: "KEY_ENTER" }
```

- Sends the specified key via remote controller.

### 2) Wait

```js
{ type: "wait", ms: 700 }
```

- Waits for `ms` milliseconds.

### 3) Capture directive

```js
{ type: "capture", mode: "skip" }
{ type: "capture", mode: "reuse", reuseImage: "previous" }
{ type: "capture", mode: "reuse", reuseImage: "1-3" }
```

- `mode: "skip"`: skip capture for this step.
- `mode: "reuse"`: copy an existing saved image instead of live popup/blob capture.
  - `reuseImage: "previous"`: reuse the most recently saved capture in this run.
  - `reuseImage: "<topic>-<step>"`: reuse from a specific step ID (example: `"1-3"`).
- Optional for reuse:
  - `skipLiveCapture: true` (default for reuse): if reuse fails, do **not** attempt live capture.
  - `skipLiveCapture: false`: if reuse fails, fallback to live capture.

## Step-Level Options

These can be declared in object steps, and for array steps some can also be declared via `type: "capture"`:

```js
{
  actions: [...],
  captureRetries: 4,
  retryWaitMs: 800,
  skipCapture: false,
  reuseImage: "previous",
  skipLiveCapture: true
}
```

- `captureRetries`: max live capture attempts for this step.
- `retryWaitMs`: wait time between retry attempts.
- `skipCapture`: skip capture for this step.
- `reuseImage`: manual reuse source (`"previous"` or `"topic-step"`).
- `skipLiveCapture`: when reuse fails, skip live capture (`true`) or fallback (`false`).

## Priority / Behavior Notes

- Capture directives are parsed from step arrays and converted into step-level behavior.
- If `reuseImage` is set, reuse is attempted first.
- If reuse succeeds, step capture is completed without blob/popup capture.
- If reuse fails:
  - with `skipLiveCapture: true` -> live capture is skipped.
  - with `skipLiveCapture: false` -> live capture is attempted.

## Examples

### Skip capture in an array step

```js
[
  { type: "remote", key: "KEY_HOME" },
  { type: "wait", ms: 700 },
  { type: "capture", mode: "skip" }
]
```

### Reuse exact previous image in next step

```js
[
  { type: "capture", mode: "reuse", reuseImage: "previous" }
]
```

### Reuse a specific step image

```js
[
  { type: "capture", mode: "reuse", reuseImage: "2-4" }
]
```

## Backward Compatibility

- Topic-level `skipCapture` is still supported.
- Existing steps with only `remote`/`wait` continue to work as before.
