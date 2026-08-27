"""Regression visual: tampilan dashboard dikunci; refactor yang mengubah
layout secara tak sengaja akan gagal di sini."""
def test_dashboard(snap_compare):
    assert snap_compare("app.py", terminal_size=(120, 36))
