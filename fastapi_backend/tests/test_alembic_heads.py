import re
from pathlib import Path


def _extract_revision_ids(text: str) -> tuple[set[str], set[str]]:
    revision_re = re.compile(r"\brevision\b\s*(?::\s*[^=]+)?=\s*['\"]([0-9a-f]{12})['\"]")
    down_revision_re = re.compile(r"\bdown_revision\b\s*(?::\s*[^=]+)?=\s*([^\n]+)")

    revisions = set(revision_re.findall(text))
    parents: set[str] = set()
    for m in down_revision_re.finditer(text):
        parents.update(re.findall(r"[0-9a-f]{12}", m.group(1)))
    return revisions, parents


def test_alembic_single_head():
    versions_dir = Path(__file__).resolve().parents[1] / "alembic_migrations" / "versions"
    revisions: set[str] = set()
    parents: set[str] = set()
    for path in versions_dir.glob("*.py"):
        text = path.read_text(encoding="utf-8")
        r, p = _extract_revision_ids(text)
        revisions.update(r)
        parents.update(p)
    heads = sorted(revisions - parents)
    assert len(heads) == 1, f"Expected exactly 1 alembic head, got {heads}"
