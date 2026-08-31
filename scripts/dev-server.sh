#!/usr/bin/env bash
# PROMPT-V4 M3 — founder dev-server restart. The tolerant parser
# (webapp/envfile.py) exports every well-formed .env line and SKIPS broken
# ones (a bare '=' line used to crash naive `source .env`).
# Values never appear in logs beyond this one-time export into the shell.
set -euo pipefail
cd "$(dirname "$0")/.."

while IFS= read -r line; do
  case "$line" in export\ *) eval "$line" ;; esac
done < <(uv run python -m webapp.envfile .env)

exec uv run python -m webapp.server --host 127.0.0.1 --port 8000
