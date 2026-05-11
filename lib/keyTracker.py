"""run using this command: 
python .\lib\keyTracker.py"""
from __future__ import annotations
import os
import signal
import sys
import json
from collections import Counter, deque
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_FOLDER = PROJECT_ROOT / "key-tracker-js-output"
LOG_FILE = OUTPUT_FOLDER / f"key_presses_{datetime.now():%Y%m%d_%H%M%S_%f}.js"
DEFAULT_WAIT_MS = 500
ACTION_INDENT = "            "
STEP_BLOCK_INDENT = "          "
STEP_INDENT = "    "
STEPS_INDENT = "      "

KEY_NAMES = {
    "UP": "Up",
    "DOWN": "Down",
    "LEFT": "Left",
    "RIGHT": "Right",
    "HOME": "Home",
    "ENTER": "Enter",
}

SHORTCUT_KEYS = {
    "w": "WAIT",
    "f": "FINISH",
    "i": "SET_INTERVAL",
    "t": "NEXT_TOPIC",
    "p": "CAPTURE_REUSE_PREVIOUS",
    "r": "CAPTURE_REUSE_1_3",
    "q": "QUIT",
}

CAPTURE_REUSE_IMAGES = {
    "CAPTURE_REUSE_PREVIOUS": "previous",
    "CAPTURE_REUSE_1_3": "1-3",
}

Action = tuple[str, str | int]


class KeyReader:
    """Read single key presses on Windows and POSIX terminals."""

    def __init__(self) -> None:
        self.is_windows = os.name == "nt"

    @contextmanager
    def raw_mode(self):
        if self.is_windows:
            yield
            return

        import termios
        import tty

        fd = sys.stdin.fileno()
        original_settings = termios.tcgetattr(fd)
        try:
            tty.setcbreak(fd)
            yield
        finally:
            termios.tcsetattr(fd, termios.TCSADRAIN, original_settings)

    def read_key(self) -> str | None:
        if self.is_windows:
            return self._read_windows_key()

        return self._read_posix_key()

    def _read_windows_key(self) -> str | None:
        import msvcrt

        key = msvcrt.getwch()

        if key in ("\x00", "\xe0"):
            arrow = msvcrt.getwch()
            return {
                "H": "UP",
                "P": "DOWN",
                "K": "LEFT",
                "M": "RIGHT",
            }.get(arrow)

        if key == "\r":
            return "ENTER"
        if key in ("\b", "\x7f"):
            return "UNDO"
        if key == " ":
            return "HOME"

        return SHORTCUT_KEYS.get(key.lower())

    def _read_posix_key(self) -> str | None:
        key = sys.stdin.read(1)

        if key == "\x1b":
            sequence = key + sys.stdin.read(2)
            if sequence == "\x1b[A":
                return "UP"
            if sequence == "\x1b[B":
                return "DOWN"
            if sequence == "\x1b[D":
                return "LEFT"
            if sequence == "\x1b[C":
                return "RIGHT"
            return None

        if key in ("\n", "\r"):
            return "ENTER"
        if key in ("\b", "\x7f"):
            return "UNDO"
        if key == " ":
            return "HOME"

        return SHORTCUT_KEYS.get(key.lower())


def clear_screen() -> None:
    print("\033[2J\033[H", end="")


def prompt_topic() -> str:
    clear_screen()
    print("Topic")
    print("=====")
    return input("Enter topic #: ").strip()


def prompt_wait_interval() -> int:
    while True:
        answer = input("Set the interval: ").strip()
        try:
            interval = int(answer)
        except ValueError:
            interval = 0

        if interval > 0:
            return interval

        print("Interval must be a positive whole number.")


def initialize_log_file() -> None:
    OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)
    with LOG_FILE.open("w", encoding="utf-8") as log_file:
        log_file.write("export const keyPresses = {\n")


def log_file_display_path() -> str:
    try:
        return str(LOG_FILE.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(LOG_FILE)


def finalize_log_file() -> None:
    with LOG_FILE.open("a", encoding="utf-8") as log_file:
        log_file.write("};\n")
        log_file.write("\nexport default keyPresses;\n")


def start_topic(topic: str) -> None:
    with LOG_FILE.open("a", encoding="utf-8") as log_file:
        log_file.write(f"{STEP_INDENT}{json.dumps(topic)}: {{\n")
        log_file.write(f"{STEPS_INDENT}steps: [\n")


def start_step() -> None:
    with LOG_FILE.open("a", encoding="utf-8") as log_file:
        log_file.write(f"{STEP_BLOCK_INDENT}[\n")


def log_key_press(key: str) -> None:
    with LOG_FILE.open("a", encoding="utf-8") as log_file:
        log_file.write(f'{ACTION_INDENT}{{ type: "remote", key: "KEY_{key}" }},\n')


def log_wait(wait_ms: int) -> None:
    with LOG_FILE.open("a", encoding="utf-8") as log_file:
        log_file.write(f'{ACTION_INDENT}{{ type: "wait", ms: {wait_ms} }},\n')


def log_capture_reuse(reuse_image: str) -> None:
    with LOG_FILE.open("a", encoding="utf-8") as log_file:
        log_file.write(
            f'{ACTION_INDENT}{{ type: "capture", mode: "reuse", reuseImage: "{reuse_image}" }},\n'
        )


def finish_step() -> None:
    with LOG_FILE.open("a", encoding="utf-8") as log_file:
        log_file.write(f"{STEP_BLOCK_INDENT}],\n")


def finish_topic() -> None:
    with LOG_FILE.open("a", encoding="utf-8") as log_file:
        log_file.write(f"{STEPS_INDENT}],\n")
        log_file.write(f"{STEP_INDENT}}},\n")


def last_content_line_index(lines: list[str]) -> int:
    index = len(lines) - 1
    while index >= 0 and lines[index] == "":
        index -= 1
    return index


def write_log_lines(lines: list[str]) -> None:
    LOG_FILE.write_text("\n".join(lines), encoding="utf-8")


def remove_empty_open_step() -> bool:
    lines = LOG_FILE.read_text(encoding="utf-8").split("\n")
    index = last_content_line_index(lines)
    if index < 0 or lines[index] != f"{STEP_BLOCK_INDENT}[":
        return False

    del lines[index]
    write_log_lines(lines)
    return True


def remove_last_step_close() -> bool:
    lines = LOG_FILE.read_text(encoding="utf-8").split("\n")
    index = last_content_line_index(lines)
    if index < 0 or lines[index] != f"{STEP_BLOCK_INDENT}],":
        return False

    del lines[index]
    write_log_lines(lines)
    return True


def remove_last_action_line() -> bool:
    lines = LOG_FILE.read_text(encoding="utf-8").split("\n")

    for index in range(last_content_line_index(lines), -1, -1):
        if lines[index].startswith(ACTION_INDENT):
            del lines[index]
            write_log_lines(lines)
            return True

        if lines[index] == f"{STEP_BLOCK_INDENT}[":
            break

    return False


def find_last_remote_key(actions: list[Action]) -> str | None:
    for action_type, value in reversed(actions):
        if action_type == "remote":
            return str(value)

    return None


def recompute_counts(counts: Counter[str], actions: list[Action]) -> str | None:
    counts.clear()
    for action_type, value in actions:
        if action_type == "remote":
            counts[str(value)] += 1

    return find_last_remote_key(actions)


def describe_action(action: Action) -> str:
    action_type, value = action
    if action_type == "wait":
        return f"Wait {value} ms"
    if action_type == "capture":
        return f"Capture reuse {value}"

    return KEY_NAMES[str(value)]


def draw(
    counts: Counter[str],
    recent: deque[str],
    last_key: str | None,
    topic_open: bool,
    step_open: bool,
    current_topic: str | None,
    wait_ms: int,
) -> None:
    clear_screen()
    print("W to add a wait")
    print("F to finish current step.")
    print("I to set wait interval.")
    print("T to start the next topic.")
    print("P to capture previous image.")
    print('R to reuse images "1-3".')
    print("Backspace to undo the last action.")
    print("Q to end program.\n")
    print(f"Saving presses to: {log_file_display_path()}")
    print(f"Wait interval: {wait_ms} ms")
    if topic_open and step_open and current_topic:
        print(f"Current topic: {current_topic}\n")
    elif current_topic:
        print(f"Current topic: {current_topic} (ready)\n")
    else:
        print("Current topic: not started\n")

    for key in ("UP", "DOWN", "LEFT", "RIGHT", "HOME", "ENTER"):
        print(f"{KEY_NAMES[key]}: {counts[key]}")

    if last_key:
        print(f"\nLast key: {KEY_NAMES[last_key]}")
    else:
        print("\nLast key: none yet")

    if recent:
        print("\nKey Counter:")
        for event in recent:
            print(f"  {event}")


def main() -> int:
    original_sigint_handler = signal.getsignal(signal.SIGINT)
    signal.signal(signal.SIGINT, signal.SIG_IGN)

    reader = KeyReader()
    counts: Counter[str] = Counter()
    recent: deque[str] = deque(maxlen=3)
    last_key: str | None = None
    topic_open = False
    step_open = False
    current_topic: str | None = None
    current_step_actions: list[Action] = []
    finished_step_actions: list[list[Action]] = []
    wait_ms = DEFAULT_WAIT_MS

    def open_step_if_needed() -> None:
        nonlocal current_topic, current_step_actions, step_open, topic_open

        if step_open:
            return

        if current_topic is None:
            current_topic = prompt_topic()
        if not topic_open:
            start_topic(current_topic)
            topic_open = True
        start_step()
        current_step_actions = []
        step_open = True

    def redraw() -> None:
        draw(counts, recent, last_key, topic_open, step_open, current_topic, wait_ms)

    initialize_log_file()

    try:
        current_topic = prompt_topic()
        redraw()

        while True:
            with reader.raw_mode():
                key = reader.read_key()

            if key == "QUIT":
                break
            timestamp = datetime.now()

            if key == "SET_INTERVAL":
                wait_ms = prompt_wait_interval()
                recent.appendleft(f"{timestamp:%H:%M:%S} - Wait interval {wait_ms} ms")
                redraw()
                continue

            if key == "WAIT":
                open_step_if_needed()
                log_wait(wait_ms)
                current_step_actions.append(("wait", wait_ms))
                finished_step_actions.append(current_step_actions.copy())
                finish_step()
                current_step_actions = []
                step_open = False
                counts.clear()
                last_key = None
                recent.appendleft(
                    f"{timestamp:%H:%M:%S} - Wait {wait_ms} ms; finished step"
                )
                redraw()
                continue

            if key == "FINISH":
                if step_open:
                    if current_step_actions:
                        finished_step_actions.append(current_step_actions.copy())
                        finish_step()
                    else:
                        remove_empty_open_step()
                    current_step_actions = []
                    step_open = False
                    recent.appendleft(f"{timestamp:%H:%M:%S} - Finished step")
                    counts.clear()
                    last_key = None
                else:
                    recent.appendleft(f"{timestamp:%H:%M:%S} - No open step to finish")
                redraw()
                continue

            if key == "UNDO":
                if not step_open and topic_open and finished_step_actions:
                    if remove_last_step_close():
                        current_step_actions = finished_step_actions.pop()
                        last_key = recompute_counts(counts, current_step_actions)
                        step_open = True
                    else:
                        recent.appendleft(
                            f"{timestamp:%H:%M:%S} - Could not go back to step"
                        )
                        redraw()
                        continue

                if not step_open or not current_step_actions:
                    recent.appendleft(f"{timestamp:%H:%M:%S} - Nothing to undo")
                    redraw()
                    continue

                action = current_step_actions.pop()
                if not remove_last_action_line():
                    current_step_actions.append(action)
                    recent.appendleft(
                        f"{timestamp:%H:%M:%S} - Could not undo last action"
                    )
                    redraw()
                    continue

                if action[0] == "remote":
                    counts[str(action[1])] = max(0, counts[str(action[1])] - 1)

                if current_step_actions:
                    last_key = find_last_remote_key(current_step_actions)
                else:
                    remove_empty_open_step()
                    step_open = False
                    counts.clear()
                    last_key = None

                recent.appendleft(
                    f"{timestamp:%H:%M:%S} - Removed {describe_action(action)}"
                )
                redraw()
                continue

            if key == "NEXT_TOPIC":
                if step_open:
                    if current_step_actions:
                        finished_step_actions.append(current_step_actions.copy())
                        finish_step()
                    else:
                        remove_empty_open_step()
                    current_step_actions = []
                    step_open = False
                if topic_open:
                    finish_topic()
                    topic_open = False

                counts.clear()
                last_key = None
                finished_step_actions.clear()
                current_topic = prompt_topic()
                recent.appendleft(
                    f"{datetime.now():%H:%M:%S} - Ready for topic {current_topic}"
                )
                redraw()
                continue

            if key in CAPTURE_REUSE_IMAGES:
                reuse_image = CAPTURE_REUSE_IMAGES[key]
                open_step_if_needed()
                log_capture_reuse(reuse_image)
                current_step_actions.append(("capture", reuse_image))
                recent.appendleft(
                    f"{timestamp:%H:%M:%S} - Capture reuse {reuse_image}"
                )
                redraw()
                continue

            if key not in KEY_NAMES:
                continue

            counts[key] += 1
            last_key = key
            open_step_if_needed()
            log_key_press(key)
            current_step_actions.append(("remote", key))
            recent.appendleft(f"{timestamp:%H:%M:%S} - {KEY_NAMES[key]}")
            redraw()
    except KeyboardInterrupt:
        pass
    finally:
        signal.signal(signal.SIGINT, original_sigint_handler)
        if step_open:
            if current_step_actions:
                finish_step()
            else:
                remove_empty_open_step()
        if topic_open:
            finish_topic()
        finalize_log_file()

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
