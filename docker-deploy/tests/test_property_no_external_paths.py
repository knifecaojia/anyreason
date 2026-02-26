# Feature: docker-deploy, Property 1: 无外部路径依赖
# Validates: Requirements 1.3
"""
Property 1: 无外部路径依赖

For any file in the docker-deploy/ directory, it shall not contain runtime
path references to directories outside docker-deploy/ (such as ../docker/,
../local-shared-data/). For docker-compose.yml specifically, volume mounts
must not reference ../fastapi_backend or ../nextjs-frontend (build context
references are acceptable since they are build-time only).
"""

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

# Directories / patterns that should NEVER appear in any file
FORBIDDEN_RUNTIME_PATHS = [
    "../docker/",
    "../local-shared-data/",
]

# Paths that must not appear in volume mounts (but are OK in build context)
FORBIDDEN_VOLUME_PATHS = [
    "../fastapi_backend",
    "../nextjs-frontend",
]

# Directories to skip when scanning
EXCLUDED_DIRS = {"tests", "__pycache__", ".git"}

# Files to skip
EXCLUDED_FILES = {".gitkeep"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_deploy_files() -> list[Path]:
    """Collect all scannable files under docker-deploy/, excluding tests and .gitkeep."""
    files: list[Path] = []
    for path in DOCKER_DEPLOY_DIR.rglob("*"):
        if not path.is_file():
            continue
        # Skip excluded directories
        if any(part in EXCLUDED_DIRS for part in path.relative_to(DOCKER_DEPLOY_DIR).parts):
            continue
        # Skip excluded files
        if path.name in EXCLUDED_FILES:
            continue
        files.append(path)
    return files


def read_file_safe(path: Path) -> str:
    """Read file content, returning empty string on decode errors."""
    try:
        return path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return ""


def parse_docker_compose() -> dict:
    """Parse docker-compose.yml and return the parsed YAML dict."""
    compose_path = DOCKER_DEPLOY_DIR / "docker-compose.yml"
    with open(compose_path, encoding="utf-8") as f:
        return yaml.safe_load(f)


def extract_volume_mounts(compose: dict) -> list[dict]:
    """Extract all volume mount entries from all services.

    Returns a list of dicts with keys: service, volume.
    Only short-syntax string mounts starting with './' or '../' are included.
    """
    mounts: list[dict] = []
    services = compose.get("services", {})
    for svc_name, svc_def in services.items():
        if not isinstance(svc_def, dict):
            continue
        volumes = svc_def.get("volumes", [])
        for vol in volumes:
            if isinstance(vol, str):
                # Short syntax: host_path:container_path[:mode]
                host_part = vol.split(":")[0]
                if host_part.startswith("./") or host_part.startswith("../"):
                    mounts.append({"service": svc_name, "volume": vol})
            elif isinstance(vol, dict):
                # Long syntax
                source = vol.get("source", "")
                if isinstance(source, str) and (source.startswith("./") or source.startswith("../")):
                    mounts.append({"service": svc_name, "volume": source})
    return mounts


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

# Strategy: pick a random file from the deploy directory
deploy_files = get_deploy_files()
if deploy_files:
    deploy_file_strategy = st.sampled_from(deploy_files)
else:
    deploy_file_strategy = st.nothing()

# Strategy: pick a random forbidden runtime path
forbidden_runtime_strategy = st.sampled_from(FORBIDDEN_RUNTIME_PATHS)

# Strategy: generate random external relative path patterns like ../something/
random_external_path_strategy = st.from_regex(
    r"\.\./[a-z_]{3,20}/", fullmatch=True
).filter(
    # Exclude the known build-context paths that are acceptable
    lambda p: p not in ("../fastapi_backend/", "../nextjs-frontend/")
)


# ---------------------------------------------------------------------------
# Property tests
# ---------------------------------------------------------------------------

@given(file_path=deploy_file_strategy, forbidden=forbidden_runtime_strategy)
@settings(max_examples=100)
def test_no_forbidden_runtime_paths_in_any_file(file_path: Path, forbidden: str):
    """No file in docker-deploy/ should contain forbidden runtime path references."""
    content = read_file_safe(file_path)
    assert forbidden not in content, (
        f"File '{file_path.relative_to(DOCKER_DEPLOY_DIR)}' contains "
        f"forbidden runtime path reference: '{forbidden}'"
    )


@given(random_path=random_external_path_strategy)
@settings(max_examples=100)
def test_no_random_external_paths_in_deploy_files(random_path: str):
    """Generated random external path patterns (../xxx/) should not appear in deploy files."""
    for file_path in deploy_files:
        content = read_file_safe(file_path)
        assert random_path not in content, (
            f"File '{file_path.relative_to(DOCKER_DEPLOY_DIR)}' contains "
            f"external path reference: '{random_path}'"
        )


class TestDockerComposeVolumeMounts:
    """Verify docker-compose.yml volume mounts don't reference external source directories."""

    def test_no_volume_mounts_to_fastapi_backend(self):
        """Volume mounts must not reference ../fastapi_backend (source code mount)."""
        compose = parse_docker_compose()
        mounts = extract_volume_mounts(compose)
        for mount in mounts:
            host_part = mount["volume"].split(":")[0]
            assert "../fastapi_backend" not in host_part, (
                f"Service '{mount['service']}' has a volume mount referencing "
                f"../fastapi_backend: '{mount['volume']}'. "
                f"Build context is OK, but volume mounts create runtime dependencies."
            )

    def test_no_volume_mounts_to_nextjs_frontend(self):
        """Volume mounts must not reference ../nextjs-frontend (source code mount)."""
        compose = parse_docker_compose()
        mounts = extract_volume_mounts(compose)
        for mount in mounts:
            host_part = mount["volume"].split(":")[0]
            assert "../nextjs-frontend" not in host_part, (
                f"Service '{mount['service']}' has a volume mount referencing "
                f"../nextjs-frontend: '{mount['volume']}'. "
                f"Build context is OK, but volume mounts create runtime dependencies."
            )

    def test_no_volume_mounts_to_docker_dir(self):
        """Volume mounts must not reference ../docker/ (old docker directory)."""
        compose = parse_docker_compose()
        mounts = extract_volume_mounts(compose)
        for mount in mounts:
            host_part = mount["volume"].split(":")[0]
            assert "../docker" not in host_part, (
                f"Service '{mount['service']}' has a volume mount referencing "
                f"../docker: '{mount['volume']}'"
            )

    def test_build_context_is_acceptable(self):
        """Build context references to ../fastapi_backend and ../nextjs-frontend are OK."""
        compose = parse_docker_compose()
        services = compose.get("services", {})
        # Just verify the build contexts exist where expected (positive check)
        build_contexts = {}
        for svc_name, svc_def in services.items():
            if isinstance(svc_def, dict) and "build" in svc_def:
                build = svc_def["build"]
                if isinstance(build, dict):
                    build_contexts[svc_name] = build.get("context", "")
                elif isinstance(build, str):
                    build_contexts[svc_name] = build
        # These are build-time only, so they're acceptable
        # This test documents that build contexts are intentionally external
        assert len(build_contexts) > 0, "Expected at least one service with a build context"
