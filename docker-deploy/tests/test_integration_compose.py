# Integration tests: docker-compose.yml 语法与结构验证
# Validates: Requirements 2.1, 2.2, 2.3, 3.2, 3.3, 3.4, 3.5, 3.6
"""
Integration tests for docker-compose.yml.

Uses PyYAML to parse docker-compose.yml and verify service definitions,
dependency relationships, health check configurations, volumes, and networks.
"""

from pathlib import Path

import pytest
import yaml

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

COMPOSE_PATH = Path(__file__).resolve().parent.parent / "docker-compose.yml"


@pytest.fixture(scope="module")
def compose() -> dict:
    """Parse docker-compose.yml once for all tests."""
    with open(COMPOSE_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)


@pytest.fixture(scope="module")
def services(compose) -> dict:
    return compose.get("services", {})


# ---------------------------------------------------------------------------
# Expected services
# ---------------------------------------------------------------------------

EXPECTED_SERVICES = {
    "postgres", "redis", "minio", "minio-init",
    "db-init", "backend", "task-worker", "frontend", "nginx",
}


# ---------------------------------------------------------------------------
# Service existence
# ---------------------------------------------------------------------------

class TestServiceExistence:
    """Verify all expected services are defined."""

    def test_all_expected_services_exist(self, services):
        missing = EXPECTED_SERVICES - set(services.keys())
        assert not missing, f"Missing services: {missing}"

    @pytest.mark.parametrize("svc", sorted(EXPECTED_SERVICES))
    def test_service_defined(self, services, svc):
        assert svc in services, f"Service '{svc}' not found in docker-compose.yml"


# ---------------------------------------------------------------------------
# PostgreSQL health check (Req 2.1)
# ---------------------------------------------------------------------------

class TestPostgresHealthCheck:
    """Verify PostgreSQL health check configuration."""

    def test_healthcheck_exists(self, services):
        assert "healthcheck" in services["postgres"]

    def test_interval(self, services):
        hc = services["postgres"]["healthcheck"]
        assert hc.get("interval") == "5s"

    def test_timeout(self, services):
        hc = services["postgres"]["healthcheck"]
        assert hc.get("timeout") == "5s"

    def test_retries(self, services):
        hc = services["postgres"]["healthcheck"]
        assert hc.get("retries") == 10


# ---------------------------------------------------------------------------
# Redis health check (Req 2.2)
# ---------------------------------------------------------------------------

class TestRedisHealthCheck:
    """Verify Redis health check configuration."""

    def test_healthcheck_exists(self, services):
        assert "healthcheck" in services["redis"]

    def test_has_test_command(self, services):
        hc = services["redis"]["healthcheck"]
        assert "test" in hc


# ---------------------------------------------------------------------------
# db-init service (Req 3.2)
# ---------------------------------------------------------------------------

class TestDbInit:
    """Verify db-init service configuration."""

    def test_restart_no(self, services):
        assert services["db-init"].get("restart") == "no"

    def test_depends_on_postgres_healthy(self, services):
        deps = services["db-init"].get("depends_on", {})
        assert "postgres" in deps
        assert deps["postgres"].get("condition") == "service_healthy"


# ---------------------------------------------------------------------------
# Backend dependencies (Req 3.3)
# ---------------------------------------------------------------------------

class TestBackendDependencies:
    """Verify backend depends on db-init completed and redis healthy."""

    def test_depends_on_db_init_completed(self, services):
        deps = services["backend"].get("depends_on", {})
        assert "db-init" in deps
        assert deps["db-init"].get("condition") == "service_completed_successfully"

    def test_depends_on_redis_healthy(self, services):
        deps = services["backend"].get("depends_on", {})
        assert "redis" in deps
        assert deps["redis"].get("condition") == "service_healthy"


# ---------------------------------------------------------------------------
# task-worker (Req 3.4)
# ---------------------------------------------------------------------------

class TestTaskWorker:
    """Verify task-worker uses the same image as backend."""

    def test_same_image_as_backend(self, services):
        assert services["task-worker"].get("image") == services["backend"].get("image")


# ---------------------------------------------------------------------------
# Frontend dependency (Req 3.5, 3.6)
# ---------------------------------------------------------------------------

class TestFrontendDependency:
    """Verify frontend depends on backend."""

    def test_depends_on_backend(self, services):
        deps = services["frontend"].get("depends_on", {})
        # depends_on can be a dict or a list
        if isinstance(deps, dict):
            assert "backend" in deps
        elif isinstance(deps, list):
            assert "backend" in deps
        else:
            pytest.fail("frontend depends_on has unexpected type")


# ---------------------------------------------------------------------------
# Nginx dependencies (Req 3.6)
# ---------------------------------------------------------------------------

class TestNginxDependencies:
    """Verify nginx depends on frontend and minio-init."""

    def test_depends_on_frontend(self, services):
        deps = services["nginx"].get("depends_on", {})
        if isinstance(deps, dict):
            assert "frontend" in deps
        elif isinstance(deps, list):
            assert "frontend" in deps

    def test_depends_on_minio_init(self, services):
        deps = services["nginx"].get("depends_on", {})
        if isinstance(deps, dict):
            assert "minio-init" in deps
        elif isinstance(deps, list):
            assert "minio-init" in deps


# ---------------------------------------------------------------------------
# Named volumes (Req 2.1, 2.2, 2.3)
# ---------------------------------------------------------------------------

class TestNamedVolumes:
    """Verify named volumes exist."""

    EXPECTED_VOLUMES = {"pg_data", "redis_data", "minio_data"}

    def test_volumes_section_exists(self, compose):
        assert "volumes" in compose

    @pytest.mark.parametrize("vol", sorted(EXPECTED_VOLUMES))
    def test_volume_defined(self, compose, vol):
        assert vol in compose["volumes"], f"Named volume '{vol}' not defined"


# ---------------------------------------------------------------------------
# Network definition
# ---------------------------------------------------------------------------

class TestNetwork:
    """Verify network definition exists."""

    def test_networks_section_exists(self, compose):
        assert "networks" in compose

    def test_anyreason_net_defined(self, compose):
        assert "anyreason-net" in compose["networks"]
