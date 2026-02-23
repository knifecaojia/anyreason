import httpx
from typing import Any, Dict
from volcenginesdkarkruntime import AsyncArk
from app.ai_gateway.providers.base_media import MediaProvider
from app.schemas_media import MediaRequest, MediaResponse
from app.core.exceptions import AppError

class VolcengineMediaProvider(MediaProvider):
    def __init__(self, api_key: str, base_url: str = "https://ark.cn-beijing.volces.com/api/v3"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        
        # Initialize AsyncArk client
        self.client = AsyncArk(
            api_key=api_key,
            base_url=self.base_url,
            timeout=1800,  # Recommended timeout for long-running tasks
            max_retries=2
        )

    async def generate(self, request: MediaRequest) -> MediaResponse:
        payload = {
            "model": request.model_key,
            "prompt": request.prompt,
            "response_format": "url",
        }
        
        payload.update(request.param_json)
        
        try:
            # Call the images generation API
            response = await self.client.images.generate(**payload)
            
            # Extract the image URL
            if not response.data or len(response.data) == 0:
                 raise AppError(msg="Volcengine API returned no data", data={}, code=502)
                 
            first = response.data[0]
            image_url = ""
            
            if hasattr(first, "url") and first.url:
                image_url = first.url
            elif hasattr(first, "b64_json") and first.b64_json:
                image_url = f"data:image/png;base64,{first.b64_json}"
            else:
                 raise AppError(msg="Volcengine API returned no valid image URL", data={}, code=502)
            
            return MediaResponse(
                url=image_url,
                usage_id=str(getattr(response, "created", "")),
                meta=response.to_dict() if hasattr(response, "to_dict") else {}
            )
            
        except Exception as e:
            raise AppError(msg=f"Volcengine API Error: {str(e)}", data={"error": str(e)}, code=502)

class VolcengineVideoProvider(MediaProvider):
    def __init__(self, api_key: str, base_url: str = "https://ark.cn-beijing.volces.com/api/v3"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        
        # Initialize AsyncArk client
        self.client = AsyncArk(
            api_key=api_key,
            base_url=self.base_url,
            timeout=1800,  # Recommended timeout for long-running tasks
            max_retries=2
        )

    async def generate(self, request: MediaRequest) -> MediaResponse:
        # Note: Volcengine SDK video generation implementation might differ based on SDK version
        # Assuming similar interface or direct API call if SDK doesn't support video yet
        # But per user request, we try to use SDK structure
        
        # Currently Volcengine SDK mainly supports chat and image generation
        # If video generation is supported in newer versions, it would likely be client.video.generations.create
        # For now, we'll implement a structure that can be easily adapted or use direct API via SDK client if exposed
        
        # Since I cannot verify if 'client.video' exists in the installed SDK version without running it,
        # I will implement a robust fallback or standard implementation based on typical OpenAI-compatible SDKs
        
        try:
            # Attempt to use SDK if video attribute exists (hypothetical future SDK feature)
            if hasattr(self.client, 'video'):
                 # This is speculative based on "migrate to SDK" request
                 # Real implementation depends on SDK capabilities
                 pass
            
            # Fallback to direct HTTP if SDK doesn't support video yet, 
            # BUT user specifically asked for SDK migration. 
            # If the SDK strictly doesn't support video, we might need to stick to HTTP but use SDK's config.
            
            # However, for now, let's assume the user implies Image generation first and Video later or 
            # if Video is supported. The current file 'volcengine.py' is for MediaProvider which handles both?
            # Actually factories distinguish by manufacturer.
            
            # Let's keep VolcengineMediaProvider as the main entry for Image.
            # I will add VolcengineVideoProvider class here for future use or if 'volcengine-video' is requested.
            
            raise NotImplementedError("Volcengine Video SDK integration is pending SDK verification")

        except Exception as e:
            raise AppError(msg=f"Volcengine Video Error: {str(e)}", code=502)
