# Feature: docker-deploy, Property 8: 环境变量文件完整性
# Validates: Requirements 1.2, 11.1, 11.2, 11.3
"""
Property 8: 环境变量文件完整性

For any required environment variable (across PostgreSQL, MinIO, Redis,
application ports, security keys, domain/CORS, and admin account groups),
it shall appear in .env.example with a Chinese comment describing its purpose.
Sensitive variables (passwords, secret keys) shall use placeholder values,
while non-sensitive variables shall have reasonable defaults.
"""

import os
import re
from pathlib import Path

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ENV_EXAMPLE_PATH = Path(__file__).resolve().parent.parent / ".env.example"

# All required environment variables grouped by function
REQUIRED_VARIABLES: dict[str, list[str]] = {
    "PostgreSQL": [
        "POSTGRES_PORT",
        "POSTGRES_DB",
        "POSTGRES_USER",
        "POSTGRES_PASSWORD",
        "APP_DB_USER",
        "APP_DB_PASSWORD",
    ],
    "MinIO": [
        "MINIO_API_PORT",
        "MINIO_CONSOLE_PORT",
        "MINIO_ROOT_USER",
        "MINIO_ROOT_PASSWORD",
        "MINIO_BUCKET_ASSETS",
        "MINIO_BUCKET_EXPORTS",
        "MINIO_BUCKET_SCRIPTS",
    ],
    "Redis": [
        "REDIS_PASSWORD",
    ],
    "Application": [
        "BACKEND_PORT",
        "FRONTEND_PORT",
    ],
    "Security": [
        "ACCESS_SECRET_KEY",
        "RESET_PASSWORD_SECRET_KEY",
        "VERIFICATION_SECRET_KEY",
    ],
    "Domain/CORS": [
        "DOMAIN",
        "CORS_ORIGINS",
        "FRONTEND_URL",
    ],
    "Admin": [
        "CREATE_DEFAULT_ADMIN",
        "DEFAULT_ADMIN_EMAIL",
        "DEFAULT_ADMIN_PASSWORD",
    ],
}

ALL_REQUIRED_VARIABLES: list[str] = [
    var for group in REQUIRED_VARIABLES.values() for var in group
]

SENSITIVE_VARIABLES: set[str] = {
    "POSTGRES_PASSWORD",
    "APP_DB_PASSWORD",
    "MINIO_ROOT_PASSWORD",
    "REDIS_PASSWORD",
    "ACCESS_SECRET_KEY",
    "RESET_PASSWORD_SECRET_KEY",
    "VERIFICATION_SECRET_KEY",
    "DEFAULT_ADMIN_PASSWORD",
}

NON_SENSITIVE_VARIABLES: set[str] = set(ALL_REQUIRED_VARIABLES) - SENSITIVE_VARIABLES

# Placeholder pattern used for sensitive variables
PLACEHOLDER_PATTERN = re.compile(r"<请修改>")

# Chinese character detection (CJK Unified Ideographs range)
CHINESE_CHAR_PATTERN = re.compile(r"[\u4e00-\u9fff]")


# ---------------------------------------------------------------------------
# Helpers – parse .env.example once
# ---------------------------------------------------------------------------

def parse_env_example(path: Path = ENV_EXAMPLE_PATH) -> dict[str, dict]:
    """Parse .env.example and return a dict keyed by variable name.

    Each value is a dict with keys:
        - value: the raw value string (right side of '=')
        - comment: the inline comment (if any), or None
        - line: the full original line
    """
    result: dict[str, dict] = {}
    with open(path, encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            # Match: VAR=value  # optional comment
            m = re.match(
                r"^([A-Za-z_][A-Za-z0-9_]*)=(.+?)(?:\s+#\s*(.+))?$", line
            )
            if not m:
                # Try without comment
                m2 = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.+)$", line)
                if m2:
                    result[m2.group(1)] = {
                        "value": m2.group(2).strip(),
                        "comment": None,
                        "line": line,
                    }
                continue
            result[m.group(1)] = {
                "value": m.group(2).strip(),
                "comment": m.group(3).strip() if m.group(3) else None,
                "line": line,
            }
    return result


# Parse once at module level for efficiency
_PARSED_ENV: dict[str, dict] | None = None


def get_parsed_env() -> dict[str, dict]:
    global _PARSED_ENV
    if _PARSED_ENV is None:
        _PARSED_ENV = parse_env_example()
    return _PARSED_ENV


# ---------------------------------------------------------------------------
# Hypothesis strategy: draw from the required variable list
# ---------------------------------------------------------------------------

required_var_strategy = st.sampled_from(ALL_REQUIRED_VARIABLES)
sensitive_var_strategy = st.sampled_from(sorted(SENSITIVE_VARIABLES))
non_sensitive_var_strategy = st.sampled_from(sorted(NON_SENSITIVE_VARIABLES))


# ---------------------------------------------------------------------------
# Property tests
# ---------------------------------------------------------------------------

@given(var_name=required_var_strategy)
@settings(max_examples=len(ALL_REQUIRED_VARIABLES))
def test_required_variable_exists_in_env_example(var_name: str):
    """Every required variable must be defined in .env.example."""
    parsed = get_parsed_env()
    assert var_name in parsed, (
        f"Required variable '{var_name}' is missing from .env.example"
    )


@given(var_name=required_var_strategy)
@settings(max_examples=len(ALL_REQUIRED_VARIABLES))
def test_required_variable_has_chinese_comment(var_name: str):
    """Every required variable must have an inline comment containing Chinese."""
    parsed = get_parsed_env()
    assume(var_name in parsed)
    entry = parsed[var_name]
    comment = entry["comment"]
    assert comment is not None, (
        f"Variable '{var_name}' has no inline comment. "
        f"Line: {entry['line']}"
    )
    assert CHINESE_CHAR_PATTERN.search(comment), (
        f"Variable '{var_name}' comment does not contain Chinese characters. "
        f"Comment: {comment}"
    )


@given(var_name=sensitive_var_strategy)
@settings(max_examples=len(SENSITIVE_VARIABLES))
def test_sensitive_variable_uses_placeholder(var_name: str):
    """Sensitive variables must use the <请修改> placeholder."""
    parsed = get_parsed_env()
    assume(var_name in parsed)
    entry = parsed[var_name]
    assert PLACEHOLDER_PATTERN.search(entry["value"]), (
        f"Sensitive variable '{var_name}' should use '<请修改>' placeholder "
        f"but has value: {entry['value']}"
    )


@given(var_name=non_sensitive_var_strategy)
@settings(max_examples=len(NON_SENSITIVE_VARIABLES))
def test_non_sensitive_variable_has_default_value(var_name: str):
    """Non-sensitive variables must have a reasonable default (not a placeholder)."""
    parsed = get_parsed_env()
    assume(var_name in parsed)
    entry = parsed[var_name]
    value = entry["value"]
    assert not PLACEHOLDER_PATTERN.search(value), (
        f"Non-sensitive variable '{var_name}' should have a default value "
        f"but uses placeholder: {value}"
    )
    assert value != "", (
        f"Non-sensitive variable '{var_name}' has an empty default value"
    )
