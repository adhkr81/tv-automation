# Step Directives Reference (`scripts`)

This document describes the directives supported by `run-topic-captures.mjs` when reading a topics file in `scripts/` (for example `2026tv.mjs` or `2025tv.mjs`).

## Topics file exports

Each topics module must export:

- **`topics`** — required object of topic definitions (see below).
- **`procedure`** — object of named procedure packs, **or** a legacy **`reset`** object (see [Backward Compatibility](#backward-compatibility)).

## Procedure packs (`export const procedure`)

Named packs live on `export const procedure`. Each key is a pack name (for example `reset`, `foo`). Each pack is a small navigation script with the same **`steps`** shape as a topic: an array of steps, where each step is either an action array or an `{ actions: [...], ... }` object (see [Step Shapes](#step-shapes)).

```js
export const procedure = {
  reset: {
    steps: [
      [{ type: "remote", key: "KEY_HOME" }, { type: "wait", ms: 800 }],
      // …more steps…
    ],
  },
};
```

### Running packs: inline `procedure` (default) vs automatic `procedure.reset`

**Default workflow:** put `{ type: "procedure", mode: "<name>" }` in topic steps wherever that pack should run (for example `mode: "reset"` to run `procedure.reset`). Sub-steps are logged as `…-proc-<mode>-1`, ….

**Optional automatic `procedure.reset`:** If `procedure.reset` exists (including after merging a legacy `reset["0"]` export), you can have the runner execute that pack **before** topics in the current slice, using synthetic step IDs `procedure-reset-1`, `procedure-reset-2`, … in logs. The pack may include `capture` directives like any other step; those participate in capture/reuse like normal.

Whether that **automatic** reset runs is controlled by `runModes` in `config/automationConfig.js` (defaults in this repo are **`false`** for both — no pre-topic reset unless you opt in):

- **`runResetBeforeFirstTopic`** — when `true`, the automatic reset runs before the **first** topic in the slice.
- **`runResetBetweenTopics`** — when `true`, the automatic reset runs before **every subsequent** topic.

Keep `procedure.reset` defined even when both flags are `false` so inline `{ type: "procedure", mode: "reset" }` and reuse fingerprint expansion still work.

### Nested `procedure` inside a pack

If a pack was **started by** an inline `{ type: "procedure", ... }` action, nested `procedure` actions inside that pack are **skipped** (avoids recursive expansion). The **automatic** pre-topic `procedure.reset` (when enabled via `runModes`) does **not** set that flag, so a `procedure` step inside the reset pack **will** run if you define one.

### Reuse fingerprints

When building reuse plans, step fingerprints are prefixed with `reset:0` or `reset:1` depending on whether **automatic** `procedure.reset` would run before that topic for the planned slice (inline `{ type: "procedure", mode: "reset" }` is folded into the action chain separately), so identical remote chains with vs without automatic reset do not collide incorrectly.

## Step Shapes

You can define each step in one of two ways:

1. **Array step (recommended, consistent style)**
   - A list of action/directive objects.
   - Captures are only taken where a `capture` directive appears.
2. **Object step**
   - `{ actions: [...], ...options }`
   - Useful when you want default retry/reuse options for capture directives inside `actions`.

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
{ type: "capture" }
{ type: "capture", mode: "screen" }
{ type: "capture", mode: "skip" }
{ type: "capture", mode: "reuse", reuseImage: "previous" }
{ type: "capture", mode: "reuse", reuseImage: "1-3" }
```

- Missing `mode`: same as `mode: "screen"` (fresh RM graphic capture at this point).
- `mode: "screen"`: fresh live RM screen capture at this point.
  - Use it as its own step when you want to capture the current screen between remote actions.
- `mode: "skip"`: explicitly skip capture at this point. This is mostly useful for generated files; plain remote/wait arrays do not capture by default.
- `mode: "reuse"`: copy an existing saved image instead of live popup/blob capture.
  - `reuseImage: "previous"`: reuse the most recently saved capture in this run.
  - `reuseImage: "<topic>-<step>"`: reuse from a specific step ID (example: `"1-3"`).
- Optional for reuse:
  - `skipLiveCapture: true` (default for reuse): if reuse fails, do **not** attempt live capture.
  - `skipLiveCapture: false`: if reuse fails, fallback to live capture.

### 4) Procedure directive

```js
{ type: "procedure", mode: "reset" }
{ type: "procedure", mode: "foo" }
```

- Runs the **`procedure[mode]`** pack at this point (same pack body as automatic pre-topic reset when that feature is enabled).
- Sub-steps are logged as `…-proc-<mode>-1`, … (derived from the current topic step).
- **`mode`** is required; if it is missing, the action is ignored.
- Pack lookup is case-insensitive on the `procedure` object keys.
- If no pack matches `mode`, the action is logged and skipped.

## Step-Level Options

These can be declared in object steps, and for array steps some can also be declared via `type: "capture"`:

```js
{
  actions: [...],
  captureRetries: 4,
  retryWaitMs: 800,
  reuseImage: "previous",
  skipLiveCapture: true
}
```

- `captureRetries`: default max live capture attempts for capture directives in this step.
- `retryWaitMs`: wait time between retry attempts.
- `reuseImage`: manual reuse source (`"previous"` or `"topic-step"`).
- `skipLiveCapture`: when reuse fails, skip live capture (`true`) or fallback (`false`).

## Priority / Behavior Notes

- There is no automatic capture at the end of a step.
- Capture directives run inline. Actions listed after a capture directive still run after that capture finishes.
- Only `screen`, `reuse`, and `skip` are supported. Any other `mode` string is treated as `screen`.
- If `reuseImage` is set, reuse is attempted first.
- If reuse succeeds, the capture point is completed without blob/popup capture.
- If reuse fails:
  - with `skipLiveCapture: true` -> live capture is skipped.
  - with `skipLiveCapture: false` -> live capture is attempted.
- If a step has more than one saving capture directive, the first uses `<topic>-<step>` and later captures use `<topic>-<step>-captureN`.
- Reuse-plan fingerprints include whether **automatic** `procedure.reset` runs before that topic (`reset:0` vs `reset:1`); changing those `runModes` flags or removing the reset pack can change reuse matching for the same topic steps. Inline `{ type: "procedure", mode: "reset" }` is part of the per-step action signature, not that prefix.

## Examples

### Capture the current screen in its own step

```js
[
  { type: "capture", mode: "screen" }
]
```

### Press Back/Return, capture, then continue

```js
[
  { type: "remote", key: "KEY_RETURN" },
  { type: "wait", ms: 700 },
  { type: "capture", mode: "screen" },
  { type: "remote", key: "KEY_DOWN" }
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

### Run the `reset` procedure pack when you need it

```js
[
  { type: "remote", key: "KEY_MENU" },
  { type: "procedure", mode: "reset" },
  { type: "capture", mode: "screen" }
]
```

## Backward Compatibility

- Topics files must export **`procedure`** or legacy **`reset`**. If only `reset` is exported, it must define **`reset["0"]`** as an object with `steps`; that object becomes **`procedure.reset`**. If both exist, **`procedure.reset`** wins and legacy `reset["0"]` is only used when `procedure.reset` is absent.
- Existing steps with only `remote`/`wait` still run, but they no longer capture automatically.
- Step-level retry/reuse options are still read by object steps and used as defaults for capture directives inside `actions`.
- Older topic files that used `mode: "auto"`, `"live"`, `"now"`, or `"capture"` should be updated to `screen`, `reuse`, or `skip`; unknown values are treated as `screen` (there is no fingerprint-based automatic file reuse anymore).

## Available Samsung Remote Buttons

Use these values in remote actions, for example:

```js
{ type: "remote", key: "KEY_ENTER" }
```

Source: `context/samsung-tv-remote.js` (`Keys` object).

```js
KEY_0
KEY_1
KEY_2
KEY_3
KEY_4
KEY_5
KEY_6
KEY_7
KEY_8
KEY_9
KEY_11
KEY_12
KEY_4_3
KEY_16_9
KEY_3SPEED
KEY_AD
KEY_ADDDEL
KEY_ALT_MHP
KEY_ANGLE
KEY_ANTENA
KEY_ANYNET
KEY_ANYVIEW
KEY_APP_LIST
KEY_ASPECT
KEY_AUTO_ARC_ANTENNA_AIR
KEY_AUTO_ARC_ANTENNA_CABLE
KEY_AUTO_ARC_ANTENNA_SATELLITE
KEY_AUTO_ARC_ANYNET_AUTO_START
KEY_AUTO_ARC_ANYNET_MODE_OK
KEY_AUTO_ARC_AUTOCOLOR_FAIL
KEY_AUTO_ARC_AUTOCOLOR_SUCCESS
KEY_AUTO_ARC_CAPTION_ENG
KEY_AUTO_ARC_CAPTION_KOR
KEY_AUTO_ARC_CAPTION_OFF
KEY_AUTO_ARC_CAPTION_ON
KEY_AUTO_ARC_C_FORCE_AGING
KEY_AUTO_ARC_JACK_IDENT
KEY_AUTO_ARC_LNA_OFF
KEY_AUTO_ARC_LNA_ON
KEY_AUTO_ARC_PIP_CH_CHANGE
KEY_AUTO_ARC_PIP_DOUBLE
KEY_AUTO_ARC_PIP_LARGE
KEY_AUTO_ARC_PIP_LEFT_BOTTOM
KEY_AUTO_ARC_PIP_LEFT_TOP
KEY_AUTO_ARC_PIP_RIGHT_BOTTOM
KEY_AUTO_ARC_PIP_RIGHT_TOP
KEY_AUTO_ARC_PIP_SMALL
KEY_AUTO_ARC_PIP_SOURCE_CHANGE
KEY_AUTO_ARC_PIP_WIDE
KEY_AUTO_ARC_RESET
KEY_AUTO_ARC_USBJACK_INSPECT
KEY_AUTO_FORMAT
KEY_AUTO_PROGRAM
KEY_AV1
KEY_AV2
KEY_AV3
KEY_BACK_MHP
KEY_BOOKMARK
KEY_CALLER_ID
KEY_CAPTION
KEY_CATV_MODE
KEY_CHDOWN
KEY_CHUP
KEY_CH_LIST
KEY_CLEAR
KEY_CLOCK_DISPLAY
KEY_COMPONENT1
KEY_COMPONENT2
KEY_CONTENTS
KEY_CONVERGENCE
KEY_CONVERT_AUDIO_MAINSUB
KEY_CUSTOM
KEY_CYAN
KEY_DEVICE_CONNECT
KEY_DISC_MENU
KEY_DMA
KEY_DNET
KEY_DNI
KEY_DNS
KEY_DOOR
KEY_DOWN
KEY_DSS_MODE
KEY_DTV
KEY_DTV_LINK
KEY_DTV_SIGNAL
KEY_DVD_MODE
KEY_DVI
KEY_DVR
KEY_DVR_MENU
KEY_DYNAMIC
KEY_ENTER
KEY_ENTERTAINMENT
KEY_ESAVING
KEY_EXT1
KEY_EXT2
KEY_EXT3
KEY_EXT4
KEY_EXT5
KEY_EXT6
KEY_EXT7
KEY_EXT8
KEY_EXT9
KEY_EXT10
KEY_EXT11
KEY_EXT12
KEY_EXT13
KEY_EXT14
KEY_EXT15
KEY_EXT16
KEY_EXT17
KEY_EXT18
KEY_EXT19
KEY_EXT20
KEY_EXT21
KEY_EXT22
KEY_EXT23
KEY_EXT24
KEY_EXT25
KEY_EXT26
KEY_EXT27
KEY_EXT28
KEY_EXT29
KEY_EXT30
KEY_EXT31
KEY_EXT32
KEY_EXT33
KEY_EXT34
KEY_EXT35
KEY_EXT36
KEY_EXT37
KEY_EXT38
KEY_EXT39
KEY_EXT40
KEY_EXT41
KEY_FACTORY
KEY_FAVCH
KEY_FF
KEY_FF_
KEY_FM_RADIO
KEY_GAME
KEY_GREEN
KEY_GUIDE
KEY_HDMI1
KEY_HDMI2
KEY_HDMI3
KEY_HDMI4
KEY_HDMI
KEY_HELP
KEY_HOME
KEY_ID_INPUT
KEY_ID_SETUP
KEY_INFO
KEY_INSTANT_REPLAY
KEY_LEFT
KEY_LINK
KEY_LIVE
KEY_MAGIC_BRIGHT
KEY_MAGIC_CHANNEL
KEY_MDC
KEY_MENU
KEY_MIC
KEY_MORE
KEY_MOVIE1
KEY_MS
KEY_MTS
KEY_MUTE
KEY_NINE_SEPERATE
KEY_OPEN
KEY_PANNEL_CHDOWN
KEY_PANNEL_CHUP
KEY_PANNEL_ENTER
KEY_PANNEL_MENU
KEY_PANNEL_POWER
KEY_PANNEL_SOURCE
KEY_PANNEL_VOLDOW
KEY_PANNEL_VOLUP
KEY_PANORAMA
KEY_PAUSE
KEY_PCMODE
KEY_PERPECT_FOCUS
KEY_PICTURE_SIZE
KEY_PIP_CHDOWN
KEY_PIP_CHUP
KEY_PIP_ONOFF
KEY_PIP_SCAN
KEY_PIP_SIZE
KEY_PIP_SWAP
KEY_PLAY
KEY_PLUS100
KEY_PMODE
KEY_POWER
KEY_POWEROFF
KEY_POWERON
KEY_PRECH
KEY_PRINT
KEY_PROGRAM
KEY_QUICK_REPLAY
KEY_REC
KEY_RED
KEY_REPEAT
KEY_RESERVED1
KEY_RETURN
KEY_REWIND
KEY_REWIND_
KEY_RIGHT
KEY_RSS
KEY_RSURF
KEY_SCALE
KEY_SEFFECT
KEY_SETUP_CLOCK_TIMER
KEY_SLEEP
KEY_SOURCE
KEY_SRS
KEY_STANDARD
KEY_STB_MODE
KEY_STILL_PICTURE
KEY_STOP
KEY_SUB_TITLE
KEY_SVIDEO1
KEY_SVIDEO2
KEY_SVIDEO3
KEY_TOOLS
KEY_TOPMENU
KEY_TTX_MIX
KEY_TTX_SUBFACE
KEY_TURBO
KEY_TV
KEY_TV_MODE
KEY_UP
KEY_VCHIP
KEY_VCR_MODE
KEY_VOLDOWN
KEY_VOLUP
KEY_WHEEL_LEFT
KEY_WHEEL_RIGHT
KEY_W_LINK
KEY_YELLOW
KEY_ZOOM1
KEY_ZOOM2
KEY_ZOOM_IN
KEY_ZOOM_MOVE
KEY_ZOOM_OUT
```
