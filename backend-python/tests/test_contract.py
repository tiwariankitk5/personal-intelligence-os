"""Keep the API contract independently of its implementation language."""
import json
import re
from pathlib import Path
from types import SimpleNamespace

from pios.main import create_app


def normalize(path):
    return re.sub(r"\{[^}]+\}", "{id}", path)


def test_all_existing_routes_have_python_replacements():
    old = {tuple(route) for route in json.loads(Path(__file__).with_name("api-contract.json").read_text())}
    assert len(old) >= 50  # Detect accidental parser failure.
    app = create_app(SimpleNamespace(origins=["http://localhost:3100"]))
    current = {(method.upper(), normalize(path)) for path, methods in app.openapi()["paths"].items() for method in methods}
    assert old <= current, f"Unmigrated endpoints: {old - current}"
