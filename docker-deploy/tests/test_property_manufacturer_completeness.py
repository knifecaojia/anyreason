# Feature: docker-deploy, Property 5: 厂商种子数据完整性
# Validates: Requirements 6.1, 6.2
"""
Property 5: 厂商种子数据完整性

For any manufacturer entry in the predefined MANUFACTURER_LIST, after running
the Model Seeder, a corresponding AIManufacturer record shall exist with matching
code, name, category, default_base_url, and enabled=true.

Since the actual seed functions require a running database, these tests verify
the STRUCTURAL correctness of the seed_models.py script:
  - MANUFACTURER_LIST contains all expected manufacturers
  - Each entry has all required fields (code, name, category, default_base_url)
  - The seed_manufacturers logic sets enabled=True for every manufacturer
  - The (code, category) uniqueness constraint is respected
"""

import ast
import re
from pathlib import Path

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DOCKER_DEPLOY_DIR = Path(__file__).resolve().parent.parent
SEED_MODELS_PATH = DOCKER_DEPLOY_DIR / "init-db" / "seed_models.py"

# Required fields for each manufacturer entry
REQUIRED_MANUFACTURER_FIELDS = ["code", "name", "category", "default_base_url"]

# Expected manufacturers per requirements 6.1
EXPECTED_MANUFACTURERS = [
    {"code": "deepseek", "name": "DeepSeek", "default_base_url": "https://api.deepseek.com"},
    {"code": "doubao", "name": "Doubao", "default_base_url": "https://ark.cn-beijing.volces.com/api/v3"},
    {"code": "zhipu", "name": "Zhipu AI", "default_base_url": "https://open.bigmodel.cn/api/paas/v4"},
    {"code": "qwen", "name": "Qwen", "default_base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1"},
    {"code": "openai", "name": "OpenAI"},
    {"code": "gemini", "name": "Google Gemini"},
    {"code": "anthropic", "name": "Anthropic"},
    {"code": "xai", "name": "xAI"},
    {"code": "other", "name": "Other"},
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_file_safe(path: Path) -> str:
    """Read file content, returning empty string on errors."""
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return ""


def _eval_list_of_dicts(list_node: ast.List) -> list[dict]:
    """Safely evaluate a list of dict literals from AST."""
    result = []
    for elt in list_node.elts:
        if isinstance(elt, ast.Dict):
            d = {}
            for key, val in zip(elt.keys, elt.values):
                if isinstance(key, ast.Constant):
                    k = key.value
                    if isinstance(val, ast.Constant):
                        d[k] = val.value
                    elif isinstance(val, ast.NameConstant):
                        d[k] = val.value
                    else:
                        d[k] = None
            result.append(d)
    return result


def load_manufacturer_list() -> list[dict]:
    """Load MANUFACTURER_LIST from seed_models.py by parsing the AST."""
    content = read_file_safe(SEED_MODELS_PATH)
    if not content:
        return []

    try:
        tree = ast.parse(content)
    except SyntaxError:
        return []

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "MANUFACTURER_LIST":
                    if isinstance(node.value, ast.List):
                        return _eval_list_of_dicts(node.value)
    return []


def extract_seed_function_body(content: str) -> str:
    """Extract the body of the seed_models async function."""
    pattern = r"async def seed_models\b.*?(?=\nasync def |\nclass |\nif __name__|\Z)"
    match = re.search(pattern, content, re.DOTALL)
    return match.group(0) if match else ""


# ---------------------------------------------------------------------------
# Load seed data at module level
# ---------------------------------------------------------------------------

_MANUFACTURERS = load_manufacturer_list()


# ---------------------------------------------------------------------------
# Structural tests: MANUFACTURER_LIST completeness
# ---------------------------------------------------------------------------

class TestManufacturerListStructure:
    """Verify MANUFACTURER_LIST has all required manufacturers with correct fields."""

    def test_manufacturer_list_loaded(self):
        """MANUFACTURER_LIST must be parseable from seed_models.py."""
        assert len(_MANUFACTURERS) > 0, (
            "Failed to parse MANUFACTURER_LIST from seed_models.py"
        )

    def test_manufacturer_count_matches_expected(self):
        """MANUFACTURER_LIST must contain all expected manufacturers."""
        assert len(_MANUFACTURERS) >= len(EXPECTED_MANUFACTURERS), (
            f"MANUFACTURER_LIST has {len(_MANUFACTURERS)} entries, "
            f"expected at least {len(EXPECTED_MANUFACTURERS)}"
        )

    def test_all_expected_manufacturers_present(self):
        """Every expected manufacturer code must appear in MANUFACTURER_LIST."""
        codes = {m.get("code") for m in _MANUFACTURERS}
        for expected in EXPECTED_MANUFACTURERS:
            assert expected["code"] in codes, (
                f"Expected manufacturer '{expected['code']}' not found in MANUFACTURER_LIST"
            )

    def test_all_entries_have_required_fields(self):
        """Every manufacturer entry must have code, name, category, default_base_url."""
        for i, m in enumerate(_MANUFACTURERS):
            for field in REQUIRED_MANUFACTURER_FIELDS:
                assert field in m, (
                    f"Manufacturer entry {i} (code={m.get('code', '?')}) "
                    f"missing required field '{field}'"
                )

    def test_all_entries_have_text_category(self):
        """Every manufacturer must have category='text' per requirement 6.2."""
        for m in _MANUFACTURERS:
            assert m.get("category") == "text", (
                f"Manufacturer '{m.get('code')}' has category='{m.get('category')}', "
                f"expected 'text'"
            )


class TestSeedManufacturersFunction:
    """Verify seed_models function sets enabled=True for manufacturers."""

    def test_seed_function_sets_enabled_true(self):
        """seed_models must set enabled=True when creating AIManufacturer records."""
        content = read_file_safe(SEED_MODELS_PATH)
        func_body = extract_seed_function_body(content)
        assert func_body, "seed_models function not found in seed_models.py"
        assert "enabled=True" in func_body, (
            "seed_models does not set enabled=True for manufacturers"
        )

    def test_seed_function_uses_check_before_insert(self):
        """seed_models must check existing manufacturers before inserting."""
        content = read_file_safe(SEED_MODELS_PATH)
        func_body = extract_seed_function_body(content)
        assert func_body, "seed_models function not found"
        assert "existing_manu_map" in func_body or "existing_manus" in func_body, (
            "seed_models does not track existing manufacturers for dedup"
        )
        assert "continue" in func_body, (
            "seed_models does not skip existing manufacturer records"
        )


# ---------------------------------------------------------------------------
# Property tests: manufacturer field completeness
# ---------------------------------------------------------------------------

@given(idx=st.integers(min_value=0, max_value=max(len(_MANUFACTURERS) - 1, 0)))
@settings(max_examples=max(len(_MANUFACTURERS), 1))
def test_manufacturer_entry_has_all_required_fields(idx: int):
    """
    **Validates: Requirements 6.1, 6.2**

    For any manufacturer entry in MANUFACTURER_LIST, it must have all required
    fields: code, name, category, and default_base_url.
    """
    assume(len(_MANUFACTURERS) > 0)
    assume(idx < len(_MANUFACTURERS))
    entry = _MANUFACTURERS[idx]
    for field in REQUIRED_MANUFACTURER_FIELDS:
        assert field in entry, (
            f"Manufacturer at index {idx} (code={entry.get('code', '?')}) "
            f"missing field '{field}'"
        )
    # category must be 'text'
    assert entry.get("category") == "text", (
        f"Manufacturer '{entry.get('code')}' has category='{entry.get('category')}', "
        f"expected 'text'"
    )


@given(idx=st.integers(min_value=0, max_value=max(len(EXPECTED_MANUFACTURERS) - 1, 0)))
@settings(max_examples=len(EXPECTED_MANUFACTURERS))
def test_expected_manufacturer_fields_match(idx: int):
    """
    **Validates: Requirements 6.1, 6.2**

    For any expected manufacturer, verify the corresponding entry in
    MANUFACTURER_LIST has matching code, name, and default_base_url fields.
    """
    assume(len(_MANUFACTURERS) > 0)
    assume(idx < len(EXPECTED_MANUFACTURERS))
    expected = EXPECTED_MANUFACTURERS[idx]

    # Find matching entry by code
    matches = [m for m in _MANUFACTURERS if m.get("code") == expected["code"]]
    assert len(matches) >= 1, (
        f"Expected manufacturer '{expected['code']}' not found in MANUFACTURER_LIST"
    )
    actual = matches[0]

    # Verify name matches
    assert actual.get("name") == expected["name"], (
        f"Manufacturer '{expected['code']}' name mismatch: "
        f"expected '{expected['name']}', got '{actual.get('name')}'"
    )

    # Verify default_base_url matches (if specified in expected)
    if "default_base_url" in expected:
        assert actual.get("default_base_url") == expected["default_base_url"], (
            f"Manufacturer '{expected['code']}' default_base_url mismatch: "
            f"expected '{expected['default_base_url']}', "
            f"got '{actual.get('default_base_url')}'"
        )
