"""Tolerant .env reader (PROMPT-V4 M3, 2026-08-31).

The founder's .env carries a broken bare '=' on line 2 (probe 2026-08-31);
a naive `source .env` executes it as a command and strict parsers choke.
This parser names what it can and SKIPS what it cannot — the server never
crashes on a malformed line, and no value is ever logged or echoed beyond
the explicit shell-export mode used by scripts/dev-server.sh.

Run as `python -m webapp.envfile [path]` to print one single-quoted
`export KEY='value'` line per valid entry (shell-safe quoting).
"""
from __future__ import annotations

import sys
from pathlib import Path


def parse(text: str) -> tuple[dict[str, str], list[int]]:
    """(env, skipped_line_numbers). Tolerates blanks, comments, 'export '
    prefixes, surrounding quotes and any line that cannot name a variable."""
    env: dict[str, str] = {}
    skipped: list[int] = []
    for lineno, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export "):].strip()
        if "=" not in line:
            skipped.append(lineno)
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        # a bare '=' (empty key) or a key with spaces cannot name a variable
        if not key or any(ch.isspace() for ch in key):
            skipped.append(lineno)
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        env[key] = value
    return env, skipped


def parse_file(path: str | Path) -> tuple[dict[str, str], list[int]]:
    p = Path(path)
    if not p.exists():
        return {}, []
    return parse(p.read_text(encoding="utf-8"))


def _shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else ".env"
    entries, skipped = parse_file(target)
    for name, value in entries.items():
        print(f"export {name}={_shell_quote(value)}")
    if skipped:
        print(f"# webapp.envfile: skipped {len(skipped)} malformed line(s): "
              f"{skipped}", file=sys.stderr)
