"""Terminal Alpha — entry point. Jalankan: uv run python app.py [--ascii]"""
import argparse

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from textual.app import App

from ui.dashboard import Dashboard
from ui.icons import use_ascii
from ui.theme import ALPHA_DARK


class TerminalAlpha(App):
    TITLE = "Terminal Alpha — AI Memecoin Scanner"
    CSS_PATH = "ui/styles.tcss"
    BINDINGS = (("q", "quit", "Quit"), ("ctrl+q", "quit", "Quit"))

    def on_mount(self) -> None:
        self.register_theme(ALPHA_DARK)
        self.theme = "alpha-dark"
        self.push_screen(Dashboard())


app = TerminalAlpha()  # dipakai pytest-textual-snapshot

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--ascii", action="store_true",
                        help="glyph standar (tanpa Nerd Font)")
    args = parser.parse_args()
    if args.ascii:
        use_ascii()
    app.run()
