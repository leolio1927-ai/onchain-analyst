"""Registry icon — SATU-satunya file yang boleh berisi glyph Nerd Font.
Ditulis sebagai escape \\uXXXX biar aman di-copy-paste.
Mode --ascii mengganti semua ke karakter standar (font apa pun)."""


class _Set:
    def __init__(self, **kw):
        self.__dict__.update(kw)


NERD = _Set(
    up="\uf062", down="\uf063", dot="\uf111", shield="\uf132", bolt="\uf0e7",
    search="\uf002", cpu="\uf2db", eye="\uf06e", link="\uf0c1", warn="\uf071",
    lock="\uf023", chart="\uf201", robot="\uf544", chevron="\uf054", db="\uf1c0",
)
ASCII = _Set(
    up="▲", down="▼", dot="●", shield="■", bolt="*",
    search="?", cpu="=", eye="o", link="+", warn="!",
    lock="#", chart="≡", robot="AI", chevron=">", db="■",
)
ACTIVE = NERD


def use_ascii(on: bool = True) -> None:
    global ACTIVE
    ACTIVE = ASCII if on else NERD
