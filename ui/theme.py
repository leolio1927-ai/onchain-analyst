"""Design tokens Terminal Alpha — SATU-satunya tempat warna didefinisikan."""
from textual.theme import Theme

AMBER   = "#ffb000"
BLUE    = "#5fa8ff"
BG      = "#0a0e14"
SURFACE = "#121926"
GREEN   = "#2ecc71"
ORANGE  = "#e67e22"
RED     = "#e74c3c"
MUTED   = "#8b98a9"
BORDER  = "#1e2a3d"

ALPHA_DARK = Theme(
    name="alpha-dark",
    primary=AMBER, secondary=BLUE, accent=BLUE,
    background=BG, surface=SURFACE, panel="#0f1520",
    success=GREEN, warning=ORANGE, error=RED,
    dark=True,
    variables={
        "border": BORDER, "text-muted": MUTED,
        "scrollbar": BORDER, "scrollbar-active": "#2c3e57", "scrollbar-hover": "#3a5070",
        "block-cursor-background": "#2b2413",
    },
)
