import logging
import os
import sys
import json
from types import FrameType
from datetime import date, datetime
from typing import Any, Dict, Optional, Set, cast

from loguru import logger

from app.config import settings


LOGGING_RESERVED_FIELDS: Set[str] = {
    "name",
    "msg",
    "args",
    "levelname",
    "levelno",
    "pathname",
    "filename",
    "module",
    "exc_info",
    "exc_text",
    "stack_info",
    "lineno",
    "funcName",
    "created",
    "msecs",
    "relativeCreated",
    "thread",
    "threadName",
    "processName",
    "process",
}


def _sanitize_extra(value: Any, depth: int = 0) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if depth >= 2:
        return str(value)
    if isinstance(value, dict):
        return {str(k): _sanitize_extra(v, depth + 1) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_sanitize_extra(v, depth + 1) for v in value]
    return str(value)


class InterceptHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        level: Any
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame: Optional[FrameType] = logging.currentframe()
        depth = 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        extra = {
            key: value
            for key, value in record.__dict__.items()
            if key not in LOGGING_RESERVED_FIELDS
        }

        safe_extra = {k: _sanitize_extra(v) for k, v in extra.items()}

        logger.bind(**safe_extra).opt(depth=depth, exception=record.exc_info).log(
            level, record.getMessage()
        )


class LoggingConfig:
    def __init__(self) -> None:
        self.debug = bool(getattr(settings, "DEBUG", False))
        self.level = "DEBUG" if self.debug else "INFO"
        self.log_dir = getattr(settings, "LOGS_ROOT", "logs")
        self.service_name = getattr(settings, "PROJECT_NAME", "application")
        self.environment = getattr(settings, "APP_ENV", "development")
        self.enqueue = os.name != "nt"
        self._ensure_log_dir()

    def _ensure_log_dir(self) -> None:
        os.makedirs(self.log_dir, exist_ok=True)

    @staticmethod
    def _json_default(value: Any) -> Any:
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if isinstance(value, (set, tuple)):
            return list(value)
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        return str(value)

    def _build_log_entry(self, record: Dict[str, Any]) -> Dict[str, Any]:
        extra: Dict[str, Any] = dict(record.get("extra", {}))
        extra.pop("serialized", None)

        log_entry: Dict[str, Any] = {
            "timestamp": record["time"].astimezone().isoformat(),
            "level": record["level"].name,
            "message": record["message"],
            "logger": record["name"],
            "module": record["module"],
            "function": record["function"],
            "line": record["line"],
            "process": record["process"].id,
            "thread": record["thread"].id,
            "service": self.service_name,
            "environment": self.environment,
        }

        context = extra.pop("context", None)
        if isinstance(context, dict):
            extra.update(context)

        log_entry.update(extra)

        if record.get("exception"):
            exception = record["exception"]
            log_entry["exception"] = {
                "type": exception.type.__name__ if exception.type else None,
                "value": str(exception.value),
                "traceback": exception.traceback,
            }

        return log_entry

    def _serialize_record(self, record: Dict[str, Any]) -> str:
        log_entry = self._build_log_entry(record)
        return json.dumps(
            log_entry,
            ensure_ascii=False,
            default=self._json_default,
            sort_keys=self.debug,
            separators=(",", ":") if not self.debug else (",", ": "),
        )

    def _patch_record(self, record: Dict[str, Any]) -> None:
        record.setdefault("extra", {})
        record["extra"]["serialized"] = self._serialize_record(record)

    def setup(self) -> None:
        logger.remove()

        intercept_handler = InterceptHandler()
        logging.basicConfig(handlers=[intercept_handler], level=0, force=True)

        for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access", "fastapi"):
            standard_logger = logging.getLogger(logger_name)
            standard_logger.handlers = [intercept_handler]
            standard_logger.propagate = False

        logger.configure(patcher=cast(Any, self._patch_record))

        logger.add(
            sink=sys.stdout,
            level=self.level,
            format="{extra[serialized]}",
            colorize=False,
            backtrace=True,
            diagnose=self.debug,
            enqueue=self.enqueue,
        )

        logger.add(
            sink=f"{self.log_dir}/backend_{{time:YYYY-MM-DD}}.log",
            level="DEBUG",
            format="{extra[serialized]}",
            rotation="100 MB",
            retention="30 days",
            compression="zip",
            encoding="utf-8",
            backtrace=True,
            diagnose=self.debug,
            enqueue=self.enqueue,
        )

        logger.add(
            sink=f"{self.log_dir}/backend_error_{{time:YYYY-MM-DD}}.log",
            level="ERROR",
            format="{extra[serialized]}",
            rotation="50 MB",
            retention="90 days",
            compression="zip",
            encoding="utf-8",
            backtrace=True,
            diagnose=self.debug,
            enqueue=self.enqueue,
        )

        logger.add(
            sink=f"{self.log_dir}/backend_critical_{{time:YYYY-MM-DD}}.log",
            level="CRITICAL",
            format="{extra[serialized]}",
            rotation="10 MB",
            retention="180 days",
            compression="zip",
            encoding="utf-8",
            backtrace=True,
            diagnose=self.debug,
            enqueue=self.enqueue,
        )


_configured = False


def setup_logging() -> None:
    global _configured
    if _configured:
        return
    LoggingConfig().setup()
    _configured = True
