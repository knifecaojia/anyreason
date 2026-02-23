import asyncio
import httpx
from typing import Any, Dict
from app.ai_gateway.providers.base_media import MediaProvider
from app.schemas_media import MediaRequest, MediaResponse
from app.core.exceptions import AppError

class ViduMediaProvider(MediaProvider):
    def __init__(self, api_key: str, base_url: str = "https://api.vidu.cn/ent/v2"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    async def generate(self, request: MediaRequest) -> MediaResponse:
        url = f"{self.base_url}/text2video" 
        
        headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": request.model_key,
            "prompt": request.prompt,
        }
        # Merge param_json (duration, aspect_ratio, etc.)
        payload.update(request.param_json)
        
        if request.callback_url:
             payload["callback_url"] = request.callback_url

        async with httpx.AsyncClient() as client:
            # 1. Submit Task
            resp = await client.post(url, json=payload, headers=headers, timeout=30.0)
            if resp.status_code not in [200, 201]:
                 raise AppError(msg=f"Vidu Submit Error: {resp.status_code}", data={"raw": resp.text}, code=502)
            
            data = resp.json()
            task_id = data.get("task_id")
            if not task_id:
                 raise AppError(msg="Vidu API returned no task_id", data=data, code=502)
            
            # 2. Poll Task
            # Poll for up to 5 minutes
            for _ in range(150):
                await asyncio.sleep(2)
                task_url = f"{self.base_url}/tasks/{task_id}"
                resp = await client.get(task_url, headers=headers, timeout=10.0)
                if resp.status_code != 200:
                    continue
                
                task_data = resp.json()
                state = task_data.get("state")
                
                if state == "success":
                    creations = task_data.get("creations", [])
                    video_url = None
                    if creations:
                         video_url = creations[0].get("url")
                    elif "url" in task_data:
                         video_url = task_data["url"]
                    elif "mp4_url" in task_data:
                         video_url = task_data["mp4_url"]
                    
                    if not video_url:
                         raise AppError(msg="Vidu Task Succeeded but no URL found", data=task_data, code=502)

                    return MediaResponse(
                        url=video_url,
                        usage_id=task_id,
                        meta=task_data
                    )
                elif state == "failed":
                     raise AppError(msg=f"Vidu Task Failed", data=task_data, code=502)
            
            raise AppError(msg="Vidu Task Timeout", code=504)
