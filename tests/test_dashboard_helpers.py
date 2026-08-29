"""Audit P1 regression: a priceChange of -100% must not crash the app."""
from ui.dashboard import _est_points


def test_est_points_change_minus_100_tidak_crash():
    pts = _est_points(100.0, {"h24": -100, "h6": -50, "h1": 0, "m5": 10})
    assert pts[0] == 0.0      # zero denominator → clamped, no ZeroDivisionError
    assert pts[1] == 200.0    # down 50% → the 6h-ago price was 200
    assert pts[-1] == 100.0


def test_est_points_normal():
    pts = _est_points(110.0, {"h24": 10, "h6": 5, "h1": 2, "m5": 1})
    assert abs(pts[0] - 100.0) < 1e-9   # 110/1.1
    assert pts[-1] == 110.0
