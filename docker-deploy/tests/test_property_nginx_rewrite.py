# Feature: docker-deploy, Property 7: Nginx URL 重写正确性
# Validates: Requirements 9.3, 9.4
"""
Property 7: Nginx URL 重写正确性

For any request path matching `/api/auth/{path}`, the Nginx config shall rewrite
it to `/auth/{path}`. For any request path matching `/api/users/{path}`, it shall
rewrite to `/users/{path}`. For any request path matching `/api/{path}` (where path
does not start with `v1/`), it shall rewrite to `/api/v1/{path}`.

Both HTTP and HTTPS configs must contain the same rewrite rules.
"""

import re
from pathlib import Path

import pytest
from hypothesis import given, settings, assume
from hypothesis import strategies as st

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DOCKER_DEPLOY_DIR = Path(__file__).resolve().parent.parent
NGINX_DIR = DOCKER_DEPLOY_DIR / "nginx"
HTTP_CONF = NGINX_DIR / "anyreason-http.conf"
HTTPS_CONF = NGINX_DIR / "anyreason-https.conf"

# The three rewrite rules extracted from nginx config
REWRITE_AUTH = re.compile(r"rewrite\s+\^/api/auth/\(\.?\*\)\s+/auth/\$1\s+break")
REWRITE_USERS = re.compile(r"rewrite\s+\^/api/users/\(\.?\*\)\s+/users/\$1\s+break")
REWRITE_API_GENERAL = re.compile(
    r"rewrite\s+\^/api/\(\?!v1/\)\(\.?\*\)\s+/api/v1/\$1\s+break"
)

# Nginx rewrite regex patterns (Python equivalents for simulation)
NGINX_AUTH_PATTERN = re.compile(r"^/api/auth/(.*)")
NGINX_USERS_PATTERN = re.compile(r"^/api/users/(.*)")
NGINX_GENERAL_PATTERN = re.compile(r"^/api/(?!v1/)(.*)")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def read_conf(path: Path) -> str:
    """Read an nginx config file."""
    return path.read_text(encoding="utf-8")


def simulate_nginx_rewrite(request_path: str) -> str:
    """Simulate Nginx location matching and rewrite behavior.

    Nginx processes location blocks in order of specificity:
    - /api/auth/ (most specific prefix)
    - /api/users/ (specific prefix)
    - /api/ (general prefix, with negative lookahead for v1/)

    Returns the rewritten path, or the original path if no rule matches.
    """
    # Rule 1: /api/auth/{path} → /auth/{path}
    m = NGINX_AUTH_PATTERN.match(request_path)
    if m and request_path.startswith("/api/auth/"):
        return f"/auth/{m.group(1)}"

    # Rule 2: /api/users/{path} → /users/{path}
    m = NGINX_USERS_PATTERN.match(request_path)
    if m and request_path.startswith("/api/users/"):
        return f"/users/{m.group(1)}"

    # Rule 3: /api/{path} → /api/v1/{path} (where path doesn't start with v1/)
    m = NGINX_GENERAL_PATTERN.match(request_path)
    if m and request_path.startswith("/api/"):
        return f"/api/v1/{m.group(1)}"

    return request_path


def extract_rewrite_rules(content: str) -> list[str]:
    """Extract all rewrite directives from nginx config content."""
    return re.findall(r"rewrite\s+[^\n;]+", content)


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Generate random URL path segments (safe characters for URLs)
path_segment_strategy = st.from_regex(r"[a-zA-Z0-9_\-]{1,30}", fullmatch=True)

# Generate multi-segment paths like "foo/bar/baz"
multi_path_strategy = st.lists(
    path_segment_strategy, min_size=1, max_size=5
).map(lambda parts: "/".join(parts))

# Optional query string
query_string_strategy = st.one_of(
    st.just(""),
    st.from_regex(r"\?[a-z]{1,10}=[a-z0-9]{1,10}", fullmatch=True),
)


# ---------------------------------------------------------------------------
# Property tests
# ---------------------------------------------------------------------------

class TestNginxRewriteRulesPresence:
    """Verify both HTTP and HTTPS configs contain the required rewrite rules."""

    def test_http_conf_has_auth_rewrite(self):
        content = read_conf(HTTP_CONF)
        assert REWRITE_AUTH.search(content), (
            "HTTP config missing rewrite rule: /api/auth/(.*) → /auth/$1"
        )

    def test_http_conf_has_users_rewrite(self):
        content = read_conf(HTTP_CONF)
        assert REWRITE_USERS.search(content), (
            "HTTP config missing rewrite rule: /api/users/(.*) → /users/$1"
        )

    def test_http_conf_has_general_api_rewrite(self):
        content = read_conf(HTTP_CONF)
        assert REWRITE_API_GENERAL.search(content), (
            "HTTP config missing rewrite rule: /api/(?!v1/)(.*) → /api/v1/$1"
        )

    def test_https_conf_has_auth_rewrite(self):
        content = read_conf(HTTPS_CONF)
        assert REWRITE_AUTH.search(content), (
            "HTTPS config missing rewrite rule: /api/auth/(.*) → /auth/$1"
        )

    def test_https_conf_has_users_rewrite(self):
        content = read_conf(HTTPS_CONF)
        assert REWRITE_USERS.search(content), (
            "HTTPS config missing rewrite rule: /api/users/(.*) → /users/$1"
        )

    def test_https_conf_has_general_api_rewrite(self):
        content = read_conf(HTTPS_CONF)
        assert REWRITE_API_GENERAL.search(content), (
            "HTTPS config missing rewrite rule: /api/(?!v1/)(.*) → /api/v1/$1"
        )

    def test_http_and_https_have_same_rewrite_rules(self):
        """Both configs must contain identical rewrite directives."""
        http_rules = sorted(extract_rewrite_rules(read_conf(HTTP_CONF)))
        https_rules = sorted(extract_rewrite_rules(read_conf(HTTPS_CONF)))
        assert http_rules == https_rules, (
            f"Rewrite rules differ between HTTP and HTTPS configs.\n"
            f"HTTP: {http_rules}\nHTTPS: {https_rules}"
        )


@given(path=multi_path_strategy)
@settings(max_examples=100)
def test_api_auth_rewrite_correctness(path: str):
    """**Validates: Requirements 9.3**

    For any path segment, /api/auth/{path} shall be rewritten to /auth/{path}.
    """
    request_path = f"/api/auth/{path}"
    result = simulate_nginx_rewrite(request_path)
    expected = f"/auth/{path}"
    assert result == expected, (
        f"Rewrite failed: '{request_path}' → '{result}', expected '{expected}'"
    )


@given(path=multi_path_strategy)
@settings(max_examples=100)
def test_api_users_rewrite_correctness(path: str):
    """**Validates: Requirements 9.3**

    For any path segment, /api/users/{path} shall be rewritten to /users/{path}.
    """
    request_path = f"/api/users/{path}"
    result = simulate_nginx_rewrite(request_path)
    expected = f"/users/{path}"
    assert result == expected, (
        f"Rewrite failed: '{request_path}' → '{result}', expected '{expected}'"
    )


@given(path=multi_path_strategy)
@settings(max_examples=100)
def test_api_general_rewrite_correctness(path: str):
    """**Validates: Requirements 9.4**

    For any path not starting with v1/, /api/{path} shall be rewritten to /api/v1/{path}.
    """
    assume(not path.startswith("v1/"))
    assume(not path.startswith("auth/"))
    assume(not path.startswith("users/"))

    request_path = f"/api/{path}"
    result = simulate_nginx_rewrite(request_path)
    expected = f"/api/v1/{path}"
    assert result == expected, (
        f"Rewrite failed: '{request_path}' → '{result}', expected '{expected}'"
    )


@given(path=multi_path_strategy)
@settings(max_examples=100)
def test_api_v1_paths_not_double_rewritten(path: str):
    """**Validates: Requirements 9.4**

    Paths already starting with /api/v1/ shall NOT be rewritten (no double rewrite).
    """
    request_path = f"/api/v1/{path}"
    result = simulate_nginx_rewrite(request_path)
    assert result == request_path, (
        f"Path '{request_path}' was unexpectedly rewritten to '{result}'. "
        f"Paths starting with /api/v1/ should pass through unchanged."
    )
