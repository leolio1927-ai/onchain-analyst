"""Serve Terminal Alpha ke browser — kode TUI yang sama, tanpa rewrite.
Jalankan: uv run python webserve.py  →  buka http://localhost:8000"""
from textual_serve.server import Server

Server("uv run python app.py --ascii", host="127.0.0.1", port=8000).serve()
