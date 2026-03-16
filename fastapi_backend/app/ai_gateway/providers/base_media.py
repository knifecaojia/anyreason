from abc import ABC, abstractmethod
from app.schemas_media import ExternalTaskRef, ExternalTaskStatus, MediaRequest, MediaResponse

class MediaProvider(ABC):
    def __init__(self, api_key: str, base_url: str = "", **kwargs: object) -> None: ...

    @abstractmethod
    async def generate(self, request: MediaRequest) -> MediaResponse:
        """Execute media generation request (blocking: submit + poll until done)"""
        pass

    @property
    def supports_async(self) -> bool:
        """Return True if this provider supports two-phase submit/poll."""
        return False

    async def submit_async(self, request: MediaRequest) -> ExternalTaskRef:
        """Submit a generation task and return immediately with external task reference.
        Override in subclass and set supports_async=True to enable."""
        raise NotImplementedError

    async def query_status(self, ref: ExternalTaskRef) -> ExternalTaskStatus:
        """Query the status of a previously submitted external task.
        Override in subclass and set supports_async=True to enable."""
        raise NotImplementedError

    async def cancel_task(self, external_task_id: str) -> dict[str, object]:
        """Attempt to cancel a previously submitted external task.
        Providers that do not support cancel should return a structured unsupported result."""
        _ = external_task_id
        return {
            "attempted": True,
            "supported": False,
            "message": "provider_cancel_not_supported",
        }
