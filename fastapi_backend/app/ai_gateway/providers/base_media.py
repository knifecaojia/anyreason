from abc import ABC, abstractmethod
from app.schemas_media import MediaRequest, MediaResponse

class MediaProvider(ABC):
    @abstractmethod
    async def generate(self, request: MediaRequest) -> MediaResponse:
        """Execute media generation request"""
        pass
