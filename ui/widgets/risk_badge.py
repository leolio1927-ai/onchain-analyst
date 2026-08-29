"""Risk badge — color is for SEMANTICS only (design principle).
Labels come from heuristics.rug_check — a single source of truth."""
from rich.text import Text
from textual.reactive import reactive
from textual.widget import Widget

from heuristics.rug_check import LEVEL_LABELS
from ui.theme import BG, GREEN, MUTED, ORANGE, RED

_COLORS = {"low": GREEN, "medium": ORANGE, "high": RED, "nodata": MUTED}


class RiskBadge(Widget):
    DEFAULT_CSS = "RiskBadge { width: auto; height: 1; padding: 0 1; }"
    level: reactive[str] = reactive("nodata")
    score = reactive(None)

    def render(self) -> Text:
        label = LEVEL_LABELS.get(self.level, LEVEL_LABELS["nodata"])
        color = _COLORS.get(self.level, MUTED)
        num = f" {self.score:.0f}" if isinstance(self.score, (int, float)) else ""
        return Text(f" {label}{num} ", style=f"bold {BG} on {color}")
