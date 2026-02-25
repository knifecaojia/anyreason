import base64
import io
import uuid
import httpx
from typing import Any, Dict
from app.ai_gateway.providers.base_media import MediaProvider
from app.schemas_media import MediaRequest, MediaResponse
from app.core.exceptions import AppError
from app.storage.minio_client import get_minio_client
from app.config import settings

class GeminiMediaProvider(MediaProvider):
    def __init__(self, api_key: str, base_url: str = "https://generativelanguage.googleapis.com/v1beta"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.minio = get_minio_client()
        self.bucket_name = settings.MINIO_BUCKET_VFS

    async def generate(self, request: MediaRequest) -> MediaResponse:
        url = f"{self.base_url}/models/{request.model_key}:generateContent?key={self.api_key}"
        
        headers = {
            "Content-Type": "application/json"
        }
        
        payload = {
            "contents": [{
                "parts": [{"text": request.prompt}]
            }],
            "generationConfig": {
                 "responseModalities": ["IMAGE"]
            }
        }
        
        if request.param_json:
             payload["generationConfig"].update(request.param_json)

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, headers=headers, timeout=60.0)
            
            if resp.status_code != 200:
                raise AppError(msg=f"Gemini API Error: {resp.status_code}", data={"raw": resp.text}, code=502)
            
            data = resp.json()
            
            if not data.get("candidates"):
                 raise AppError(msg="Gemini API returned no candidates", data=data, code=502)
            
            candidate = data["candidates"][0]
            parts = candidate.get("content", {}).get("parts", [])
            
            image_data = None
            mime_type = "image/png"
            
            for part in parts:
                # Check for inlineData (camelCase) or inline_data (snake_case)
                inline_data = part.get("inlineData") or part.get("inline_data")
                if inline_data:
                    image_data = inline_data.get("data")
                    mime_type = inline_data.get("mimeType") or inline_data.get("mime_type")
                    break
            
            if not image_data:
                 raise AppError(msg="Gemini API returned no image data", data=data, code=502)
            
            # Decode and upload
            try:
                image_bytes = base64.b64decode(image_data)
            except Exception as e:
                 raise AppError(msg=f"Failed to decode base64 image: {str(e)}", code=500)
            
            file_ext = mime_type.split("/")[-1] if mime_type else "png"
            object_name = f"generated/gemini/{uuid.uuid4()}.{file_ext}"
            
            try:
                self.minio.put_object(
                    self.bucket_name,
                    object_name,
                    io.BytesIO(image_bytes),
                    len(image_bytes),
                    content_type=mime_type
                )
            except Exception as e:
                 raise AppError(msg=f"Failed to upload Gemini image to MinIO: {str(e)}", code=500)
            
            # Construct URL
            from app.storage.minio_client import build_minio_url
            image_url = build_minio_url(self.bucket_name, object_name)

            return MediaResponse(
                url=image_url,
                usage_id=str(uuid.uuid4()), 
                meta=data
            )
