"""Stat card: small label on top, large number, ±% delta."""
from rich.text import Text
from textual.reactive import reactive
from textual.widget import Widget

from ui.theme import AMBER, GREEN, MUTED, RED


class StatCard(Widget):
    DEFAULT_CSS = (
        "StatCard { width: 1fr; height: auto; padding: 1 2; "
        "border: round $border; background: $surface; }"
    )
    label = reactive("")
    value = reactive("—")
    delta = reactive(0.0)

    def __init__(self, label: str = "", **kw) -> None:
        super().__init__(**kw)
        self.label = label

    def set(self, value: str, delta: float) -> None:
        self.value = value
        self.delta = delta

    def render(self) -> Text:
        if self.delta > 0:
            arrow, color = "▲", GREEN
        elif self.delta < 0:
            arrow, color = "▼", RED
        else:
            arrow, color = "•", MUTED
        t = Text()
        t.append(self.label.upper(), style=f"bold {MUTED}")
        t.append("\n")
        t.append(self.value, style=f"bold {AMBER}")
        t.append(f"  {arrow} {self.delta:+.2f}%", style=color)
        return t
