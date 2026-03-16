import pytest
from unittest.mock import patch


class TestExternalPollerConfig:
    """Tests for external poller configuration defaults."""

    def test_default_external_task_max_wait_hours_is_48(self):
        """Verify default external task max wait hours is 48."""
        from app.config import Settings

        settings = Settings()
        assert settings.EXTERNAL_TASK_MAX_WAIT_HOURS == 48

    def test_external_task_max_wait_hours_can_be_overridden_by_env(self):
        """Verify external task max wait hours can be overridden via environment variable."""
        with patch.dict("os.environ", {"EXTERNAL_TASK_MAX_WAIT_HOURS": "48"}):
            from app.config import Settings
            settings = Settings()
            assert settings.EXTERNAL_TASK_MAX_WAIT_HOURS == 48

    def test_external_task_max_wait_hours_invalid_env_raises(self):
        """Verify invalid external task max wait hours env value raises validation error."""
        import pydantic
        with patch.dict("os.environ", {"EXTERNAL_TASK_MAX_WAIT_HOURS": "invalid"}):
            from app.config import Settings
            with pytest.raises(pydantic.ValidationError):
                Settings()


class TestExternalPollerTimeoutHelper:
    """Tests for external poller timeout helper function."""

    def test_get_max_task_wait_hours_returns_config_value(self):
        """Verify get_max_task_wait_hours returns value from settings."""
        from app.config import Settings
        from app.tasks.external_poller import get_max_task_wait_hours

        settings = Settings()
        result = get_max_task_wait_hours()
        assert result == settings.EXTERNAL_TASK_MAX_WAIT_HOURS

    def test_get_max_task_wait_hours_returns_48_by_default(self):
        """Verify get_max_task_wait_hours returns 48 by default."""
        from app.tasks.external_poller import get_max_task_wait_hours

        # By default, should return 48 hours
        assert get_max_task_wait_hours() == 48
