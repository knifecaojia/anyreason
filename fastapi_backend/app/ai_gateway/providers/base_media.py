from abc import ABC, abstractmethod
from app.schemas_media import MediaRequest, MediaResponse

class MediaProvider(ABC):
    def __init__(self, api_key: str, base_url: str = "", **kwargs: object) -> None: ...

    @abstractmethod
    async def generate(self, request: MediaRequest) -> MediaResponse:
        """Execute media generation request"""
        pass
