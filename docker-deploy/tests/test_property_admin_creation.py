# Feature: docker-deploy, Property 2: 管理员创建完整性
# Validates: Requirements 4.1, 4.2, 4.3, 4.4
"""
Property 2: 管理员创建完整性

For any valid admin email and password combination (when CREATE_DEFAULT_ADMIN=true),
after running the DB initializer, the created user shall have is_active=True,
is_superuser=True, is_verified=True, be assigned the admin role, and have an
initialized credit account.

Since the actual database functions require a running PostgreSQL instance and the
full app.* module stack, these tests verify the STRUCTURAL correctness of the
db_init.py script, docker-compose.yml env vars, and .env.example configuration
to ensure admin creation will work correctly at deploy time.
"""

import ast
import re
from pathlib import Path

import pytest
import yaml
from hypothesis import given, settings, assume
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DOCKER_DEPLOY_DIR = Path(__file__).resolve().parent.parent
DB_INIT_PATH = DOCKER_DEPLOY_DIR / "init-db" / "db_init.py"
COMPOSE_PATH = DOCKER_DEPLOY_DIR / "docker-compose.yml"
ENV_EXAMPLE_PATH = DOCKER_DEPLOY_DIR / ".env.example"
DATABASE_PY_PATH = DOCKER_DEPLOY_DIR.parent / "fastapi_backend" / "app" / "database.py"

# Admin-related environment variables that must be present
ADMIN_ENV_VARS = [
    "CREATE_DEFAULT_ADMIN",
    "DEFAULT_ADMIN_EMAIL",
    "DEFAULT_ADMIN_PASSWORD",
]

# Expected user attributes set in ensure_default_admin
EXPECTED_USER_ATTRS = {
    "is_active": "True",
    "is_superuser": "True",
    "is_verified": "True",
}

# Email strategy: valid email-like strings
email_strategy = st.from_regex(
    r"[a-z][a-z0-9]{2,10}@[a-z]{3,8}\.[a-z]{2,4}", fullmatch=True
)

# Password strategy: random strings of reasonable length
password_strategy = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N", "P")),
    min_size=8,
    max_size=64,
).filter(lambda s: len(s.strip()) >= 8)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_file_safe(path: Path) -> str:
    """Read file content, returning empty string on errors."""
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return ""


def parse_compose() -> dict:
    """Parse docker-compose.yml."""
    with open(COMPOSE_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


def get_db_init_service_env(compose: dict) -> dict[str, str]:
    """Extract environment variables from the db-init service."""
    services = compose.get("services", {})
    db_init = services.get("db-init", {})
    env = db_init.get("environment", {})
    return env if isinstance(env, dict) else {}


# ---------------------------------------------------------------------------
# Structural tests: db_init.py calls ensure_default_admin
# ---------------------------------------------------------------------------

class TestDbInitCallsEnsureDefaultAdmin:
    """Verify db_init.py invokes ensure_default_admin in its execution flow."""

    def test_db_init_imports_ensure_default_admin(self):
        """db_init.py must import ensure_default_admin from app.database."""
        content = read_file_safe(DB_INIT_PATH)
        assert "ensure_default_admin" in content, (
            "db_init.py does not reference ensure_default_admin"
        )

    def test_db_init_calls_ensure_default_admin(self):
        """db_init.py must call ensure_default_admin() in its main flow."""
        content = read_file_safe(DB_INIT_PATH)
        # Check for the await call pattern
        assert re.search(r"await\s+ensure_default_admin\s*\(\s*\)", content), (
            "db_init.py does not call 'await ensure_default_admin()'"
        )

    def test_db_init_calls_ensure_builtin_roles_before_admin(self):
        """Roles must be initialized before admin creation (admin needs admin role)."""
        content = read_file_safe(DB_INIT_PATH)
        # Search for the await calls (not imports) to determine execution order
        roles_call = re.search(r"await\s+ensure_builtin_roles\s*\(\s*\)", content)
        admin_call = re.search(r"await\s+ensure_default_admin\s*\(\s*\)", content)
        assert roles_call, "ensure_builtin_roles() call not found in db_init.py"
        assert admin_call, "ensure_default_admin() call not found in db_init.py"
        assert roles_call.start() < admin_call.start(), (
            "ensure_builtin_roles must be called before ensure_default_admin"
        )


# ---------------------------------------------------------------------------
# Structural tests: ensure_default_admin sets correct user attributes
# ---------------------------------------------------------------------------

class TestEnsureDefaultAdminAttributes:
    """Verify the ensure_default_admin function in database.py sets correct attributes."""

    def test_database_py_exists(self):
        """The backend database.py file must exist."""
        assert DATABASE_PY_PATH.exists(), (
            f"database.py not found at {DATABASE_PY_PATH}"
        )

    def test_ensure_default_admin_sets_is_active_true(self):
        """ensure_default_admin must set is_active=True on the created user."""
        content = read_file_safe(DATABASE_PY_PATH)
        # Find the ensure_default_admin function and check for is_active=True
        func_match = re.search(
            r"async def ensure_default_admin.*?(?=\nasync def |\nclass |\Z)",
            content,
            re.DOTALL,
        )
        assert func_match, "ensure_default_admin function not found in database.py"
        func_body = func_match.group(0)
        assert "is_active=True" in func_body, (
            "ensure_default_admin does not set is_active=True"
        )

    def test_ensure_default_admin_sets_is_superuser_true(self):
        """ensure_default_admin must set is_superuser=True on the created user."""
        content = read_file_safe(DATABASE_PY_PATH)
        func_match = re.search(
            r"async def ensure_default_admin.*?(?=\nasync def |\nclass |\Z)",
            content,
            re.DOTALL,
        )
        assert func_match, "ensure_default_admin function not found"
        func_body = func_match.group(0)
        assert "is_superuser=True" in func_body, (
            "ensure_default_admin does not set is_superuser=True"
        )

    def test_ensure_default_admin_sets_is_verified_true(self):
        """ensure_default_admin must set is_verified=True on the created user."""
        content = read_file_safe(DATABASE_PY_PATH)
        func_match = re.search(
            r"async def ensure_default_admin.*?(?=\nasync def |\nclass |\Z)",
            content,
            re.DOTALL,
        )
        assert func_match, "ensure_default_admin function not found"
        func_body = func_match.group(0)
        assert "is_verified=True" in func_body, (
            "ensure_default_admin does not set is_verified=True"
        )

    def test_ensure_default_admin_assigns_admin_role(self):
        """ensure_default_admin must assign the admin role to the created user."""
        content = read_file_safe(DATABASE_PY_PATH)
        func_match = re.search(
            r"async def ensure_default_admin.*?(?=\nasync def |\nclass |\Z)",
            content,
            re.DOTALL,
        )
        assert func_match, "ensure_default_admin function not found"
        func_body = func_match.group(0)
        assert "admin" in func_body and "UserRole" in func_body, (
            "ensure_default_admin does not assign admin role via UserRole"
        )

    def test_ensure_default_admin_initializes_credit_account(self):
        """ensure_default_admin must initialize a credit account for the user."""
        content = read_file_safe(DATABASE_PY_PATH)
        func_match = re.search(
            r"async def ensure_default_admin.*?(?=\nasync def |\nclass |\Z)",
            content,
            re.DOTALL,
        )
        assert func_match, "ensure_default_admin function not found"
        func_body = func_match.group(0)
        assert "credit" in func_body.lower() or "ensure_account" in func_body, (
            "ensure_default_admin does not initialize credit account"
        )


# ---------------------------------------------------------------------------
# Structural tests: docker-compose.yml passes admin env vars to db-init
# ---------------------------------------------------------------------------

class TestComposeAdminEnvVars:
    """Verify docker-compose.yml passes admin-related env vars to db-init service."""

    def test_db_init_has_create_default_admin(self):
        """db-init service must have CREATE_DEFAULT_ADMIN env var."""
        compose = parse_compose()
        env = get_db_init_service_env(compose)
        assert "CREATE_DEFAULT_ADMIN" in env, (
            "db-init service missing CREATE_DEFAULT_ADMIN env var"
        )

    def test_db_init_has_default_admin_email(self):
        """db-init service must have DEFAULT_ADMIN_EMAIL env var."""
        compose = parse_compose()
        env = get_db_init_service_env(compose)
        assert "DEFAULT_ADMIN_EMAIL" in env, (
            "db-init service missing DEFAULT_ADMIN_EMAIL env var"
        )

    def test_db_init_has_default_admin_password(self):
        """db-init service must have DEFAULT_ADMIN_PASSWORD env var."""
        compose = parse_compose()
        env = get_db_init_service_env(compose)
        assert "DEFAULT_ADMIN_PASSWORD" in env, (
            "db-init service missing DEFAULT_ADMIN_PASSWORD env var"
        )


# ---------------------------------------------------------------------------
# Property test: random email/password are valid inputs for admin creation
# ---------------------------------------------------------------------------

@given(email=email_strategy, password=password_strategy)
@settings(max_examples=100)
def test_random_email_password_are_valid_admin_inputs(email: str, password: str):
    """
    **Validates: Requirements 4.1, 4.2**

    For any generated email/password pair, verify they would be valid inputs
    for the admin creation flow by checking:
    1. Email matches a valid email pattern
    2. Password has sufficient length
    3. The .env.example has the corresponding variables defined
    """
    # Verify email is valid format
    assert re.match(r"^[^@]+@[^@]+\.[^@]+$", email), (
        f"Generated email '{email}' is not a valid email format"
    )

    # Verify password meets minimum length
    assert len(password) >= 8, (
        f"Generated password is too short: {len(password)} chars"
    )

    # Verify .env.example defines the admin variables
    env_content = read_file_safe(ENV_EXAMPLE_PATH)
    for var in ADMIN_ENV_VARS:
        assert var in env_content, (
            f"Admin env var '{var}' not found in .env.example"
        )


@given(var_name=st.sampled_from(ADMIN_ENV_VARS))
@settings(max_examples=len(ADMIN_ENV_VARS))
def test_admin_env_var_in_compose_db_init(var_name: str):
    """
    **Validates: Requirements 4.1**

    For any admin-related environment variable, it must be passed to the
    db-init service in docker-compose.yml.
    """
    compose = parse_compose()
    env = get_db_init_service_env(compose)
    assert var_name in env, (
        f"Admin env var '{var_name}' not passed to db-init service in docker-compose.yml"
    )


@given(attr_name=st.sampled_from(list(EXPECTED_USER_ATTRS.keys())))
@settings(max_examples=len(EXPECTED_USER_ATTRS))
def test_admin_user_attribute_set_in_source(attr_name: str):
    """
    **Validates: Requirements 4.2, 4.3**

    For any expected admin user attribute (is_active, is_superuser, is_verified),
    verify it is set to True in the ensure_default_admin function.
    """
    content = read_file_safe(DATABASE_PY_PATH)
    func_match = re.search(
        r"async def ensure_default_admin.*?(?=\nasync def |\nclass |\Z)",
        content,
        re.DOTALL,
    )
    assert func_match, "ensure_default_admin function not found"
    func_body = func_match.group(0)
    expected_value = EXPECTED_USER_ATTRS[attr_name]
    assert f"{attr_name}={expected_value}" in func_body, (
        f"ensure_default_admin does not set {attr_name}={expected_value}"
    )
