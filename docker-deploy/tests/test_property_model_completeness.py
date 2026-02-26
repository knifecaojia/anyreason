# Feature: docker-deploy, Property 6: 模型种子数据完整性
# Validates: Requirements 7.1, 7.2, 7.3
"""
Property 6: 模型种子数据完整性

For any model entry in the predefined MODEL_LIST, after running the Model Seeder,
a corresponding AIModel record shall exist with correct code, name, response_format,
supports_image, supports_think, supports_tool fields, linked to the correct
manufacturer, and a corresponding AIModelConfig record shall also exist.

Since the actual seed functions require a running database, these tests verify
the STRUCTURAL correctness of the seed_models.py script:
  - MODEL_LIST contains models for all expected manufacturers
  - Each entry has all required fields
  - The seed function creates both AIModel and AIModelConfig records
  - The (manufacturer_id, code) uniqueness constraint is respected
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

# Required fields for each model entry in MODEL_LIST
REQUIRED_MODEL_FIELDS = [
    "manufacturer_code",
    "code",
    "name",
    "responseFormat",
    "image",
    "think",
    "tool",
    "category",
]

# Expected manufacturer codes that must have at least one model (Req 7.1)
EXPECTED_MANUFACTURER_CODES = [
    "deepseek",
    "doubao",
    "zhipu",
    "qwen",
    "openai",
    "gemini",
    "anthropic",
    "xai",
]

# Expected models per manufacturer (representative samples from Req 7.1)
EXPECTED_MODELS = {
    "deepseek": ["deepseek-chat", "deepseek-reasoner"],
    "doubao": ["doubao-seed-1-8-251228"],
    "zhipu": ["glm-4.7"],
    "qwen": ["qwen-max", "qwen-vl-max"],
    "openai": ["gpt-4o", "gpt-4o-mini"],
    "gemini": ["gemini-2.5-pro", "gemini-2.5-flash"],
    "anthropic": ["claude-sonnet-4-5", "claude-opus-4-5"],
    "xai": ["grok-3", "grok-4"],
}

VALID_RESPONSE_FORMATS = {"schema", "object"}


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


def load_model_list() -> list[dict]:
    """Load MODEL_LIST from seed_models.py by parsing the AST."""
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
                if isinstance(target, ast.Name) and target.id == "MODEL_LIST":
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

_MODELS = load_model_list()


# ---------------------------------------------------------------------------
# Structural tests: MODEL_LIST completeness
# ---------------------------------------------------------------------------

class TestModelListStructure:
    """Verify MODEL_LIST has all required models with correct fields."""

    def test_model_list_loaded(self):
        """MODEL_LIST must be parseable from seed_models.py."""
        assert len(_MODELS) > 0, (
            "Failed to parse MODEL_LIST from seed_models.py"
        )

    def test_all_expected_manufacturers_have_models(self):
        """Every expected manufacturer must have at least one model in MODEL_LIST."""
        manu_codes = {m.get("manufacturer_code") for m in _MODELS}
        for code in EXPECTED_MANUFACTURER_CODES:
            assert code in manu_codes, (
                f"Expected manufacturer '{code}' has no models in MODEL_LIST"
            )

    def test_expected_model_codes_present(self):
        """Representative model codes from each manufacturer must be present."""
        model_codes_by_manu: dict[str, set[str]] = {}
        for m in _MODELS:
            mc = m.get("manufacturer_code", "")
            model_codes_by_manu.setdefault(mc, set()).add(m.get("code", ""))

        for manu_code, expected_codes in EXPECTED_MODELS.items():
            actual_codes = model_codes_by_manu.get(manu_code, set())
            for code in expected_codes:
                assert code in actual_codes, (
                    f"Expected model '{code}' for manufacturer '{manu_code}' "
                    f"not found in MODEL_LIST"
                )

    def test_all_entries_have_required_fields(self):
        """Every model entry must have all required fields."""
        for i, m in enumerate(_MODELS):
            for field in REQUIRED_MODEL_FIELDS:
                assert field in m, (
                    f"Model entry {i} (code={m.get('code', '?')}) "
                    f"missing required field '{field}'"
                )

    def test_all_entries_have_text_category(self):
        """Every model must have category='text'."""
        for m in _MODELS:
            assert m.get("category") == "text", (
                f"Model '{m.get('code')}' has category='{m.get('category')}', "
                f"expected 'text'"
            )

    def test_all_entries_have_valid_response_format(self):
        """Every model must have a valid responseFormat ('schema' or 'object')."""
        for m in _MODELS:
            assert m.get("responseFormat") in VALID_RESPONSE_FORMATS, (
                f"Model '{m.get('code')}' has responseFormat='{m.get('responseFormat')}', "
                f"expected one of {VALID_RESPONSE_FORMATS}"
            )

    def test_boolean_fields_are_booleans(self):
        """image, think, tool fields must be boolean values."""
        for m in _MODELS:
            for field in ("image", "think", "tool"):
                assert isinstance(m.get(field), bool), (
                    f"Model '{m.get('code')}' field '{field}' is "
                    f"{type(m.get(field)).__name__}, expected bool"
                )

    def test_no_duplicate_model_codes_per_manufacturer(self):
        """No duplicate (manufacturer_code, code) pairs in MODEL_LIST."""
        seen: set[tuple[str, str]] = set()
        for m in _MODELS:
            key = (m.get("manufacturer_code", ""), m.get("code", ""))
            assert key not in seen, (
                f"Duplicate model entry: manufacturer='{key[0]}', code='{key[1]}'"
            )
            seen.add(key)


class TestSeedModelsFunction:
    """Verify seed_models function creates both AIModel and AIModelConfig records."""

    def test_seed_function_creates_ai_model(self):
        """seed_models must create AIModel records."""
        content = read_file_safe(SEED_MODELS_PATH)
        func_body = extract_seed_function_body(content)
        assert func_body, "seed_models function not found in seed_models.py"
        assert "AIModel(" in func_body, (
            "seed_models does not create AIModel records"
        )

    def test_seed_function_creates_ai_model_config(self):
        """seed_models must create AIModelConfig records."""
        content = read_file_safe(SEED_MODELS_PATH)
        func_body = extract_seed_function_body(content)
        assert func_body, "seed_models function not found in seed_models.py"
        assert "AIModelConfig(" in func_body, (
            "seed_models does not create AIModelConfig records"
        )

    def test_seed_function_links_model_to_manufacturer(self):
        """seed_models must set manufacturer_id when creating AIModel."""
        content = read_file_safe(SEED_MODELS_PATH)
        func_body = extract_seed_function_body(content)
        assert func_body, "seed_models function not found"
        assert "manufacturer_id=" in func_body, (
            "seed_models does not link AIModel to manufacturer via manufacturer_id"
        )

    def test_seed_function_checks_existing_models(self):
        """seed_models must check existing models before inserting."""
        content = read_file_safe(SEED_MODELS_PATH)
        func_body = extract_seed_function_body(content)
        assert func_body, "seed_models function not found"
        assert "existing_model_map" in func_body or "existing_models" in func_body, (
            "seed_models does not track existing models for dedup"
        )

    def test_seed_function_checks_existing_configs(self):
        """seed_models must check existing configs before inserting."""
        content = read_file_safe(SEED_MODELS_PATH)
        func_body = extract_seed_function_body(content)
        assert func_body, "seed_models function not found"
        assert "existing_config_map" in func_body or "existing_configs" in func_body, (
            "seed_models does not track existing configs for dedup"
        )

    def test_seed_function_sets_model_fields(self):
        """seed_models must set all required AIModel fields."""
        content = read_file_safe(SEED_MODELS_PATH)
        func_body = extract_seed_function_body(content)
        assert func_body, "seed_models function not found"
        required_assignments = [
            "response_format=",
            "supports_image=",
            "supports_think=",
            "supports_tool=",
        ]
        for assignment in required_assignments:
            assert assignment in func_body, (
                f"seed_models does not set '{assignment.rstrip('=')}' on AIModel"
            )


# ---------------------------------------------------------------------------
# Property tests: model field completeness
# ---------------------------------------------------------------------------

@given(idx=st.integers(min_value=0, max_value=max(len(_MODELS) - 1, 0)))
@settings(max_examples=max(len(_MODELS), 1))
def test_model_entry_has_all_required_fields(idx: int):
    """
    **Validates: Requirements 7.1, 7.2**

    For any model entry in MODEL_LIST, it must have all required fields:
    manufacturer_code, code, name, responseFormat, image, think, tool, category.
    """
    assume(len(_MODELS) > 0)
    assume(idx < len(_MODELS))
    entry = _MODELS[idx]
    for field in REQUIRED_MODEL_FIELDS:
        assert field in entry, (
            f"Model at index {idx} (code={entry.get('code', '?')}) "
            f"missing field '{field}'"
        )
    # responseFormat must be valid
    assert entry.get("responseFormat") in VALID_RESPONSE_FORMATS, (
        f"Model '{entry.get('code')}' has invalid responseFormat "
        f"'{entry.get('responseFormat')}'"
    )
    # Boolean fields must be booleans
    for bf in ("image", "think", "tool"):
        assert isinstance(entry.get(bf), bool), (
            f"Model '{entry.get('code')}' field '{bf}' is not a boolean"
        )


@given(idx=st.integers(min_value=0, max_value=max(len(EXPECTED_MANUFACTURER_CODES) - 1, 0)))
@settings(max_examples=len(EXPECTED_MANUFACTURER_CODES))
def test_manufacturer_has_models_in_list(idx: int):
    """
    **Validates: Requirements 7.1**

    For any expected manufacturer, there must be at least one model entry
    in MODEL_LIST with a matching manufacturer_code.
    """
    assume(len(_MODELS) > 0)
    assume(idx < len(EXPECTED_MANUFACTURER_CODES))
    manu_code = EXPECTED_MANUFACTURER_CODES[idx]
    matching = [m for m in _MODELS if m.get("manufacturer_code") == manu_code]
    assert len(matching) >= 1, (
        f"No models found for manufacturer '{manu_code}' in MODEL_LIST"
    )


@given(idx=st.integers(min_value=0, max_value=max(len(_MODELS) - 1, 0)))
@settings(max_examples=max(len(_MODELS), 1))
def test_model_manufacturer_code_is_known(idx: int):
    """
    **Validates: Requirements 7.1, 7.3**

    For any model entry in MODEL_LIST, its manufacturer_code must reference
    a known manufacturer so that the seed function can link AIModel to
    AIManufacturer and create a valid AIModelConfig.
    """
    assume(len(_MODELS) > 0)
    assume(idx < len(_MODELS))
    entry = _MODELS[idx]
    # All manufacturer codes used in MODEL_LIST should be known
    all_known_codes = set(EXPECTED_MANUFACTURER_CODES) | {"other"}
    assert entry.get("manufacturer_code") in all_known_codes, (
        f"Model '{entry.get('code')}' references unknown manufacturer "
        f"'{entry.get('manufacturer_code')}'"
    )
