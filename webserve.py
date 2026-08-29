"""Serve Terminal Alpha in the browser — the same TUI codebase, no rewrite.
Run: uv run python webserve.py  →  open http://localhost:8000"""
from textual_serve.server import Server

Server("uv run python app.py --ascii", host="127.0.0.1", port=8000).serve()
