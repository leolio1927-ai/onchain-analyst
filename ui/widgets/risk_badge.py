"""Badge risiko — warna HANYA untuk semantik, sesuai prinsip desain."""
from rich.text import Text
from textual.reactive import reactive
from textual.widget import Widget

from ui.theme import BG, GREEN, MUTED, ORANGE, RED

LEVELS = {
    "low":    ("RENDAH", GREEN),
    "medium": ("WASPADA", ORANGE),
    "high":   ("BAHAYA", RED),
    "nodata": ("DATA KURANG", MUTED),
}


class RiskBadge(Widget):
    DEFAULT_CSS = "RiskBadge { width: auto; height: 1; padding: 0 1; }"
    level: reactive[str] = reactive("nodata")

    def render(self) -> Text:
        label, color = LEVELS.get(self.level, LEVELS["nodata"])
        return Text(f" {label} ", style=f"bold {BG} on {color}")
