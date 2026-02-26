# Feature: docker-deploy, Property 3: 种子数据幂等性
# Validates: Requirements 4.5, 5.4, 6.3, 7.4
"""
Property 3: 种子数据幂等性

For any seed operation (roles, permissions, manufacturers, models, model configs,
model bindings), running the operation N times (N >= 1) shall produce the same
database state as running it exactly once — no duplicate records, no errors.

Since the actual seed functions require a running database, these tests verify
the STRUCTURAL correctness of the "check before insert" pattern used in:
  - fastapi_backend/app/database.py (roles, permissions, admin)
  - fastapi_backend/seed_models.py (manufacturers, models, configs, bindings)

We also verify that the seed data lists themselves have no internal duplicates
(which would cause idempotency issues even with correct check-before-insert).
"""

import ast
import re
import sys
from pathlib import Path
from collections import Counter

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DOCKER_DEPLOY_DIR = Path(__file__).resolve().parent.parent
DATABASE_PY_PATH = DOCKER_DEPLOY_DIR.parent / "fastapi_backend" / "app" / "database.py"
SEED_MODELS_PATH = DOCKER_DEPLOY_DIR.parent / "fastapi_backend" / "seed_models.py"

# Seed function names and their expected "check before insert" patterns
SEED_FUNCTIONS = {
    "ensure_builtin_roles": {
        "file": DATABASE_PY_PATH,
        "check_patterns": ["existing", "not in names", "select(Role)"],
        "description": "内置角色初始化",
    },
    "ensure_builtin_permissions": {
        "file": DATABASE_PY_PATH,
        "check_patterns": ["existing", "continue", "select(Permission)"],
        "description": "内置权限初始化",
    },
    "ensure_default_admin": {
        "file": DATABASE_PY_PATH,
        "check_patterns": ["existing", "is not None", "return", "select(User)"],
        "description": "默认管理员创建",
    },
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_file_safe(path: Path) -> str:
    """Read file content, returning empty string on errors."""
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return ""


def extract_function_body(content: str, func_name: str) -> str:
    """Extract the body of an async function from source code."""
    pattern = rf"async def {func_name}\b.*?(?=\nasync def |\nclass |\Z)"
    match = re.search(pattern, content, re.DOTALL)
    return match.group(0) if match else ""


def load_seed_models_data() -> tuple[list[dict], list[dict]]:
    """Load MANUFACTURER_LIST and MODEL_LIST from seed_models.py by parsing the AST."""
    content = read_file_safe(SEED_MODELS_PATH)
    if not content:
        return [], []

    # Use a simpler approach: add the path and import
    seed_dir = SEED_MODELS_PATH.parent
    if str(seed_dir) not in sys.path:
        sys.path.insert(0, str(seed_dir))

    # Parse the AST to extract the list literals
    try:
        tree = ast.parse(content)
    except SyntaxError:
        return [], []

    manufacturers = []
    models = []

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    if target.id == "MANUFACTURER_LIST" and isinstance(node.value, ast.List):
                        manufacturers = _eval_list_of_dicts(node.value)
                    elif target.id == "MODEL_LIST" and isinstance(node.value, ast.List):
                        models = _eval_list_of_dicts(node.value)

    return manufacturers, models


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


# ---------------------------------------------------------------------------
# Load seed data at module level
# ---------------------------------------------------------------------------

_MANUFACTURERS, _MODELS = load_seed_models_data()


# ---------------------------------------------------------------------------
# Structural tests: check-before-insert pattern in seed functions
# ---------------------------------------------------------------------------

class TestCheckBeforeInsertPattern:
    """Verify all seed functions use a 'check before insert' pattern for idempotency."""

    def test_ensure_builtin_roles_checks_existing(self):
        """ensure_builtin_roles must query existing roles before inserting."""
        content = read_file_safe(DATABASE_PY_PATH)
        func_body = extract_function_body(content, "ensure_builtin_roles")
        assert func_body, "ensure_builtin_roles not found in database.py"
        # Must select existing roles
        assert "select(Role)" in func_body or "select( Role )" in func_body, (
            "ensure_builtin_roles does not query existing roles"
        )
        # Must check before inserting
        assert "not in names" in func_body or "not in" in func_body, (
            "ensure_builtin_roles does not check for existing roles before insert"
        )

    def test_ensure_builtin_permissions_checks_existing(self):
        """ensure_builtin_permissions must query existing permissions before inserting."""
        content = read_file_safe(DATABASE_PY_PATH)
        func_body = extract_function_body(content, "ensure_builtin_permissions")
        assert func_body, "ensure_builtin_permissions not found in database.py"
        assert "select(Permission)" in func_body, (
            "ensure_builtin_permissions does not query existing permissions"
        )
        assert "existing" in func_body or "continue" in func_body, (
            "ensure_builtin_permissions does not skip existing records"
        )

    def test_ensure_default_admin_checks_existing_user(self):
        """ensure_default_admin must check if admin email already exists."""
        content = read_file_safe(DATABASE_PY_PATH)
        func_body = extract_function_body(content, "ensure_default_admin")
        assert func_body, "ensure_default_admin not found in database.py"
        assert "select(User)" in func_body, (
            "ensure_default_admin does not query existing users"
        )
        assert "is not None" in func_body and "return" in func_body, (
            "ensure_default_admin does not skip when user already exists"
        )

    def test_seed_models_checks_existing_manufacturers(self):
        """seed_models must check existing manufacturers before inserting."""
        content = read_file_safe(SEED_MODELS_PATH)
        assert content, "seed_models.py not found"
        assert "existing_manu_map" in content or "existing_manus" in content, (
            "seed_models does not track existing manufacturers"
        )
        assert "continue" in content, (
            "seed_models does not skip existing manufacturer records"
        )

    def test_seed_models_checks_existing_models(self):
        """seed_models must check existing models before inserting."""
        content = read_file_safe(SEED_MODELS_PATH)
        assert content, "seed_models.py not found"
        assert "existing_model_map" in content or "existing_models" in content, (
            "seed_models does not track existing models"
        )

    def test_seed_models_checks_existing_configs(self):
        """seed_models must check existing model configs before inserting."""
        content = read_file_safe(SEED_MODELS_PATH)
        assert content, "seed_models.py not found"
        assert "existing_config_map" in content or "existing_configs" in content, (
            "seed_models does not track existing model configs"
        )

    def test_seed_models_checks_existing_binding(self):
        """seed_models must check if chatbox binding exists before creating."""
        content = read_file_safe(SEED_MODELS_PATH)
        assert content, "seed_models.py not found"
        assert "chatbox" in content, (
            "seed_models does not reference chatbox binding"
        )
        # Must check before creating
        assert re.search(r"if\s+not\s+chatbox_binding", content), (
            "seed_models does not check if chatbox binding already exists"
        )


# ---------------------------------------------------------------------------
# Data uniqueness tests: no duplicates in seed data lists
# ---------------------------------------------------------------------------

class TestManufacturerDataUniqueness:
    """Verify MANUFACTURER_LIST has no duplicate (code, category) entries."""

    def test_manufacturer_list_loaded(self):
        """MANUFACTURER_LIST must be parseable from seed_models.py."""
        assert len(_MANUFACTURERS) > 0, (
            "Failed to parse MANUFACTURER_LIST from seed_models.py"
        )

    def test_no_duplicate_manufacturer_keys(self):
        """Each (code, category) pair in MANUFACTURER_LIST must be unique."""
        keys = [(m.get("code"), m.get("category")) for m in _MANUFACTURERS]
        counter = Counter(keys)
        duplicates = {k: v for k, v in counter.items() if v > 1}
        assert not duplicates, (
            f"Duplicate (code, category) keys in MANUFACTURER_LIST: {duplicates}"
        )


class TestModelDataUniqueness:
    """Verify MODEL_LIST has no duplicate (manufacturer_code, code) entries."""

    def test_model_list_loaded(self):
        """MODEL_LIST must be parseable from seed_models.py."""
        assert len(_MODELS) > 0, (
            "Failed to parse MODEL_LIST from seed_models.py"
        )

    def test_no_duplicate_model_keys(self):
        """Each (manufacturer_code, code) pair in MODEL_LIST must be unique."""
        keys = [(m.get("manufacturer_code"), m.get("code")) for m in _MODELS]
        counter = Counter(keys)
        duplicates = {k: v for k, v in counter.items() if v > 1}
        assert not duplicates, (
            f"Duplicate (manufacturer_code, code) keys in MODEL_LIST: {duplicates}"
        )


# ---------------------------------------------------------------------------
# Property tests: idempotency via data uniqueness
# ---------------------------------------------------------------------------

@given(idx=st.integers(min_value=0, max_value=max(len(_MANUFACTURERS) - 1, 0)))
@settings(max_examples=max(len(_MANUFACTURERS), 1))
def test_manufacturer_entry_has_unique_key(idx: int):
    """
    **Validates: Requirements 6.3**

    For any manufacturer entry, its (code, category) key must be unique
    across the entire MANUFACTURER_LIST, ensuring idempotent inserts.
    """
    assume(len(_MANUFACTURERS) > 0)
    assume(idx < len(_MANUFACTURERS))
    entry = _MANUFACTURERS[idx]
    key = (entry.get("code"), entry.get("category"))
    matches = [
        m for m in _MANUFACTURERS
        if (m.get("code"), m.get("category")) == key
    ]
    assert len(matches) == 1, (
        f"Manufacturer key {key} appears {len(matches)} times — "
        f"idempotent insert would fail"
    )


@given(idx=st.integers(min_value=0, max_value=max(len(_MODELS) - 1, 0)))
@settings(max_examples=min(len(_MODELS), 100))
def test_model_entry_has_unique_key(idx: int):
    """
    **Validates: Requirements 7.4**

    For any model entry, its (manufacturer_code, code) key must be unique
    across the entire MODEL_LIST, ensuring idempotent inserts.
    """
    assume(len(_MODELS) > 0)
    assume(idx < len(_MODELS))
    entry = _MODELS[idx]
    key = (entry.get("manufacturer_code"), entry.get("code"))
    matches = [
        m for m in _MODELS
        if (m.get("manufacturer_code"), m.get("code")) == key
    ]
    assert len(matches) == 1, (
        f"Model key {key} appears {len(matches)} times — "
        f"idempotent insert would fail"
    )


# Strategy: pick a seed function name
seed_function_strategy = st.sampled_from(list(SEED_FUNCTIONS.keys()))


@given(func_name=seed_function_strategy)
@settings(max_examples=len(SEED_FUNCTIONS))
def test_seed_function_has_check_before_insert(func_name: str):
    """
    **Validates: Requirements 4.5, 5.4**

    For any seed function, it must contain a "check before insert" pattern
    (querying existing records and skipping duplicates) to ensure idempotency.
    """
    info = SEED_FUNCTIONS[func_name]
    content = read_file_safe(info["file"])
    assert content, f"Source file not found: {info['file']}"

    func_body = extract_function_body(content, func_name)
    assert func_body, f"Function {func_name} not found in {info['file'].name}"

    # At least one check pattern must be present
    found_patterns = [p for p in info["check_patterns"] if p in func_body]
    assert len(found_patterns) >= 2, (
        f"Function {func_name} ({info['description']}) lacks sufficient "
        f"check-before-insert patterns. Found: {found_patterns}, "
        f"Expected at least 2 of: {info['check_patterns']}"
    )
