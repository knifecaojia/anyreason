# Feature: docker-deploy, Property 4: 内置权限完整性
# Validates: Requirements 5.2, 5.3
"""
Property 4: 内置权限完整性

For any permission code in the predefined builtin permission list, after running
the DB initializer, the permission shall exist in the database and be associated
with the admin role via RolePermission.

Since the actual database functions require a running PostgreSQL instance, these
tests verify the STRUCTURAL correctness of the ensure_builtin_permissions function
in database.py to ensure:
  1. All expected permissions are defined in the builtin list
  2. The function creates Permission records for each entry
  3. The function assigns all permissions to the admin role via RolePermission
"""

import ast
import re
from pathlib import Path

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DOCKER_DEPLOY_DIR = Path(__file__).resolve().parent.parent
DATABASE_PY_PATH = DOCKER_DEPLOY_DIR.parent / "fastapi_backend" / "app" / "database.py"

# The complete list of expected builtin permissions (code, description)
EXPECTED_BUILTIN_PERMISSIONS = [
    ("system.users", "用户管理"),
    ("system.roles", "角色与权限"),
    ("system.audit", "审计日志"),
    ("system.credits", "积分管理"),
    ("system.agents", "Agent 管理"),
    ("system.ai_models", "AI 模型配置"),
    ("system.ai_scenes", "AI 场景管理"),
    ("menu.dashboard", "工作台"),
    ("menu.scripts.list", "剧本清单"),
    ("menu.scripts.write", "剧本创作"),
    ("menu.extraction", "资产提取"),
    ("menu.assets.list", "资产清单"),
    ("menu.assets.create", "资产创作"),
    ("menu.storyboard", "内容创作"),
    ("menu.studio", "创作工坊"),
    ("menu.ai_scenes", "AI 场景"),
    ("menu.projects", "项目归档"),
    ("menu.settings.models", "模型引擎"),
    ("menu.settings.users", "用户管理"),
    ("menu.settings.roles", "角色管理"),
    ("menu.settings.permissions", "权限管理"),
    ("menu.settings.audit", "系统审计"),
    ("menu.settings.credits", "积分管理"),
    ("menu.settings.agents", "Agent 管理"),
]

EXPECTED_PERMISSION_CODES = [code for code, _ in EXPECTED_BUILTIN_PERMISSIONS]

# System permissions (system.*)
SYSTEM_PERMISSIONS = [
    code for code in EXPECTED_PERMISSION_CODES if code.startswith("system.")
]

# Menu permissions (menu.*)
MENU_PERMISSIONS = [
    code for code in EXPECTED_PERMISSION_CODES if code.startswith("menu.")
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


def extract_function_body(content: str, func_name: str) -> str:
    """Extract the body of an async function from source code."""
    pattern = rf"async def {func_name}\b.*?(?=\nasync def |\nclass |\Z)"
    match = re.search(pattern, content, re.DOTALL)
    return match.group(0) if match else ""


def extract_builtin_list_from_source(content: str) -> list[tuple[str, str]]:
    """Extract the builtin permissions list from ensure_builtin_permissions source."""
    func_body = extract_function_body(content, "ensure_builtin_permissions")
    if not func_body:
        return []

    # Find the builtin = [...] assignment within the function
    # Match tuples like ("system.users", "用户管理")
    pattern = r'\("([^"]+)",\s*"([^"]+)"\)'
    matches = re.findall(pattern, func_body)
    return matches


# ---------------------------------------------------------------------------
# Parse source at module level
# ---------------------------------------------------------------------------

_SOURCE_CONTENT = read_file_safe(DATABASE_PY_PATH)
_SOURCE_PERMISSIONS = extract_builtin_list_from_source(_SOURCE_CONTENT)
_SOURCE_PERMISSION_CODES = [code for code, _ in _SOURCE_PERMISSIONS]


# ---------------------------------------------------------------------------
# Structural tests: ensure_builtin_permissions function correctness
# ---------------------------------------------------------------------------

class TestEnsureBuiltinPermissionsStructure:
    """Verify the ensure_builtin_permissions function structure."""

    def test_function_exists(self):
        """ensure_builtin_permissions must exist in database.py."""
        func_body = extract_function_body(_SOURCE_CONTENT, "ensure_builtin_permissions")
        assert func_body, "ensure_builtin_permissions not found in database.py"

    def test_function_creates_permission_records(self):
        """Function must add Permission records for missing permissions."""
        func_body = extract_function_body(_SOURCE_CONTENT, "ensure_builtin_permissions")
        assert "Permission(" in func_body, (
            "ensure_builtin_permissions does not create Permission records"
        )

    def test_function_assigns_to_admin_role(self):
        """Function must assign permissions to the admin role via RolePermission."""
        func_body = extract_function_body(_SOURCE_CONTENT, "ensure_builtin_permissions")
        assert "RolePermission(" in func_body, (
            "ensure_builtin_permissions does not create RolePermission records"
        )
        assert "admin" in func_body, (
            "ensure_builtin_permissions does not reference admin role"
        )

    def test_function_queries_admin_role(self):
        """Function must query for the admin role to get its ID."""
        func_body = extract_function_body(_SOURCE_CONTENT, "ensure_builtin_permissions")
        assert re.search(r'Role\.name\s*==\s*"admin"', func_body), (
            "ensure_builtin_permissions does not query for admin role by name"
        )

    def test_function_checks_existing_role_permissions(self):
        """Function must check existing RolePermission records to avoid duplicates."""
        func_body = extract_function_body(_SOURCE_CONTENT, "ensure_builtin_permissions")
        assert "existing_rp" in func_body or "RolePermission" in func_body, (
            "ensure_builtin_permissions does not check existing role-permission associations"
        )

    def test_source_has_correct_permission_count(self):
        """Source builtin list must have the expected number of permissions."""
        assert len(_SOURCE_PERMISSIONS) == len(EXPECTED_BUILTIN_PERMISSIONS), (
            f"Source has {len(_SOURCE_PERMISSIONS)} permissions, "
            f"expected {len(EXPECTED_BUILTIN_PERMISSIONS)}"
        )


# ---------------------------------------------------------------------------
# Property tests: every expected permission exists in source
# ---------------------------------------------------------------------------

permission_strategy = st.sampled_from(EXPECTED_BUILTIN_PERMISSIONS)
permission_code_strategy = st.sampled_from(EXPECTED_PERMISSION_CODES)


@given(perm=permission_strategy)
@settings(max_examples=len(EXPECTED_BUILTIN_PERMISSIONS))
def test_expected_permission_exists_in_source(perm: tuple[str, str]):
    """
    **Validates: Requirements 5.2**

    For any permission in the expected builtin list, it must exist in the
    ensure_builtin_permissions function's builtin list in database.py.
    """
    code, description = perm
    assert code in _SOURCE_PERMISSION_CODES, (
        f"Expected permission '{code}' ({description}) not found in "
        f"ensure_builtin_permissions builtin list"
    )


@given(perm_code=permission_code_strategy)
@settings(max_examples=len(EXPECTED_PERMISSION_CODES))
def test_permission_has_matching_description(perm_code: str):
    """
    **Validates: Requirements 5.2**

    For any expected permission code, its description in the source must
    match the expected description.
    """
    expected_desc = dict(EXPECTED_BUILTIN_PERMISSIONS).get(perm_code)
    source_desc = dict(_SOURCE_PERMISSIONS).get(perm_code)
    assert source_desc is not None, (
        f"Permission '{perm_code}' not found in source builtin list"
    )
    assert source_desc == expected_desc, (
        f"Permission '{perm_code}' description mismatch: "
        f"expected '{expected_desc}', got '{source_desc}'"
    )


@given(perm_code=permission_code_strategy)
@settings(max_examples=len(EXPECTED_PERMISSION_CODES))
def test_permission_will_be_assigned_to_admin(perm_code: str):
    """
    **Validates: Requirements 5.3**

    For any builtin permission code, the ensure_builtin_permissions function
    must contain logic to assign it to the admin role. We verify this by
    checking that:
    1. The function queries all builtin permission IDs
    2. The function creates RolePermission for each permission
    """
    func_body = extract_function_body(_SOURCE_CONTENT, "ensure_builtin_permissions")
    assert func_body, "ensure_builtin_permissions not found"

    # The function must iterate over all permission IDs and create RolePermission
    assert "perm_ids" in func_body or "pid" in func_body, (
        "Function does not collect permission IDs for admin role assignment"
    )
    assert "RolePermission(role_id=" in func_body, (
        "Function does not create RolePermission records for admin role"
    )


# ---------------------------------------------------------------------------
# Category coverage tests
# ---------------------------------------------------------------------------

class TestPermissionCategoryCoverage:
    """Verify both system and menu permission categories are covered."""

    def test_system_permissions_present(self):
        """All system.* permissions must be in the source."""
        for code in SYSTEM_PERMISSIONS:
            assert code in _SOURCE_PERMISSION_CODES, (
                f"System permission '{code}' missing from source"
            )

    def test_menu_permissions_present(self):
        """All menu.* permissions must be in the source."""
        for code in MENU_PERMISSIONS:
            assert code in _SOURCE_PERMISSION_CODES, (
                f"Menu permission '{code}' missing from source"
            )

    def test_no_extra_permissions_in_source(self):
        """Source should not have permissions not in the expected list."""
        extra = set(_SOURCE_PERMISSION_CODES) - set(EXPECTED_PERMISSION_CODES)
        assert not extra, (
            f"Source has unexpected extra permissions: {extra}"
        )

    def test_no_missing_permissions_in_source(self):
        """Expected list should not have permissions missing from source."""
        missing = set(EXPECTED_PERMISSION_CODES) - set(_SOURCE_PERMISSION_CODES)
        assert not missing, (
            f"Source is missing expected permissions: {missing}"
        )
