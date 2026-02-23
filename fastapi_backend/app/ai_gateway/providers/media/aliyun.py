import asyncio
import httpx
from typing import Any, Dict
from app.ai_gateway.providers.base_media import MediaProvider
from app.schemas_media import MediaRequest, MediaResponse
from app.core.exceptions import AppError

class AliyunMediaProvider(MediaProvider):
    def __init__(self, api_key: str, base_url: str = "https://dashscope.aliyuncs.com/api/v1"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    async def generate(self, request: MediaRequest) -> MediaResponse:
        url = f"{self.base_url}/services/aigc/text2image/image-synthesis" 
        
        if "wan2.6" in request.model_key:
             url = f"{self.base_url}/services/aigc/multimodal-generation/generation"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-DashScope-Async": "enable"
        }
        
        payload = {
            "model": request.model_key,
            "input": {
                "prompt": request.prompt
            },
            "parameters": {
                **request.param_json
            }
        }
        
        if request.negative_prompt:
             payload["parameters"]["negative_prompt"] = request.negative_prompt

        async with httpx.AsyncClient() as client:
            # 1. Submit Task
            resp = await client.post(url, json=payload, headers=headers, timeout=30.0)
            if resp.status_code != 200:
                 raise AppError(msg=f"Aliyun Submit Error: {resp.status_code}", data={"raw": resp.text}, code=502)
            
            data = resp.json()
            if "output" not in data or "task_id" not in data["output"]:
                 if "output" in data and "results" in data["output"]:
                      return MediaResponse(
                          url=data["output"]["results"][0]["url"],
                          usage_id=data.get("request_id", "unknown"),
                          meta=data
                      )
                 raise AppError(msg="Aliyun API returned no task_id or results", data=data, code=502)
            
            task_id = data["output"]["task_id"]
            
            # 2. Poll Task
            # Poll for up to 5 minutes (150 * 2s)
            for _ in range(150): 
                await asyncio.sleep(2)
                task_url = f"{self.base_url}/tasks/{task_id}"
                resp = await client.get(task_url, headers={"Authorization": f"Bearer {self.api_key}"}, timeout=10.0)
                
                if resp.status_code != 200:
                    continue
                
                task_data = resp.json()
                status = task_data.get("output", {}).get("task_status")
                
                if status == "SUCCEEDED":
                    results = task_data["output"].get("results", [])
                    if not results:
                         if "url" in task_data["output"]:
                              return MediaResponse(
                                  url=task_data["output"]["url"],
                                  usage_id=task_id,
                                  meta=task_data
                              )
                         raise AppError(msg="Aliyun Task Succeeded but no results found", data=task_data, code=502)
                    
                    return MediaResponse(
                        url=results[0]["url"],
                        usage_id=task_id,
                        meta=task_data
                    )
                elif status in ["FAILED", "CANCELED"]:
                     raise AppError(msg=f"Aliyun Task Failed: {task_data.get('output', {}).get('message')}", data=task_data, code=502)
            
            raise AppError(msg="Aliyun Task Timeout", code=504)
