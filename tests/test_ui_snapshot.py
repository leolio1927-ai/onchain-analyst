"""Regression visual: tampilan dashboard dikunci; refactor yang mengubah
layout secara tak sengaja akan gagal di sini."""
from pathlib import Path

APP_PATH = str(Path(__file__).parent.parent / "app.py")


def test_dashboard(snap_compare):
    assert snap_compare(APP_PATH, terminal_size=(120, 36))
