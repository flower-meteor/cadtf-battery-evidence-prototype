from pathlib import Path

from streamlit.testing.v1 import AppTest


def test_all_ui_pages_render_without_exception() -> None:
    pages = [
        "Overview",
        "Fleet & Configuration",
        "Measurement & Estimate",
        "Evidence & Review",
        "Pilot Evaluation",
        "Dictionary & Export",
    ]
    app_path = Path(__file__).resolve().parents[1] / "app.py"
    app = AppTest.from_file(app_path, default_timeout=40).run()
    for page in pages:
        app.sidebar.radio[0].set_value(page).run()
        assert not app.exception, f"{page}: {app.exception}"
