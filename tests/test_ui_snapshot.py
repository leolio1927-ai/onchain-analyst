"""Visual regression: the dashboard view is locked; a refactor that
accidentally changes the layout fails here."""
from pathlib import Path

APP_PATH = str(Path(__file__).parent.parent / "app.py")


def test_dashboard(snap_compare):
    assert snap_compare(APP_PATH, terminal_size=(120, 36))
