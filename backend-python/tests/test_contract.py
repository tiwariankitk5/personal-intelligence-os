"""Every previous Spring controller endpoint must have a FastAPI replacement."""
import re
from pathlib import Path
from types import SimpleNamespace

from pios.main import create_app


def normalize(path):
    return re.sub(r"\{[^}]+\}", "{id}", path)


def test_all_spring_routes_have_python_replacements():
    root = Path(__file__).resolve().parents[2] / "backend/src/main/java/com/pios"
    old = set()
    for path in root.rglob("*Controller.java"):
        text = path.read_text(encoding="utf-8")
        prefix = re.search(r'@RequestMapping\("([^"]+)"\)', text)
        if not prefix:
            continue
        for method, suffix in re.findall(r'@(Get|Post|Put|Patch|Delete)Mapping(?:\("([^"]*)"\))?', text):
            old.add((method.upper(), normalize(prefix[1] + suffix)))
    assert len(old) >= 50  # Detect accidental parser failure.
    app = create_app(SimpleNamespace(origins=["http://localhost:3100"]))
    current = {(method.upper(), normalize(path)) for path, methods in app.openapi()["paths"].items() for method in methods}
    assert old <= current, f"Unmigrated endpoints: {old - current}"
