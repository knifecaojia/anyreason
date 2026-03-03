import asyncio

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
        payload: Dict[str, Any] = {
            "model": request.model_key,
            "prompt": request.prompt,
            "response_format": "url",
        }
        
        payload.update(request.param_json)

        # 移除前端专用字段，不传给 SDK
        payload.pop("resolution_tier", None)
        payload.pop("aspect_ratio", None)  # Volcengine 不用 aspect_ratio，用 size 控制
        payload.pop("negative_prompt", None)  # Volcengine SDK 不支持 negative_prompt
        payload.pop("model_config_id", None)
        payload.pop("parent_node_id", None)
        payload.pop("project_id", None)
        payload.pop("filename", None)

        # 前端 resolution 字段映射为 SDK 的 size 参数（如果 size 未设置）
        resolution = payload.pop("resolution", None)
        if resolution and "size" not in payload:
            payload["size"] = resolution

        # 将清晰度档位名（"1K"/"2K"/"4K"）转换为 SDK 期望的像素尺寸
        # Volcengine SDK 的 size 参数只接受 "宽x高" 格式或不传
        _TIER_TO_SIZE = {
            "1K": "1024x1024",
            "2K": "2048x2048",
            "4K": "4096x4096",
        }
        size_val = payload.get("size")
        if isinstance(size_val, str) and size_val in _TIER_TO_SIZE:
            payload["size"] = _TIER_TO_SIZE[size_val]

        # 将 image_data_urls 转换为 Volcengine SDK 期望的 image 参数
        image_data_urls = payload.pop("image_data_urls", None)
        if image_data_urls:
            imgs = [x for x in image_data_urls if isinstance(x, str) and x.strip()]
            if len(imgs) == 1:
                payload["image"] = imgs[0]
            elif len(imgs) > 1:
                payload["image"] = imgs

        # 将前端 prompt_extend 布尔值转换为 SDK 的 prompt_optimize 对象
        prompt_extend = payload.pop("prompt_extend", None)
        if prompt_extend:
            payload["prompt_optimize"] = {"mode": "standard"}

        # 将前端 batch_count 转换为 SDK 的 n 参数
        batch_count = payload.pop("batch_count", None)
        if batch_count and int(batch_count) > 1:
            payload["n"] = int(batch_count)
        
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
    """火山引擎视频生成 Provider（Seedance 2.0 等）。
    使用 HTTP API 实现异步任务提交 + 轮询模式。
    """

    POLL_INTERVAL = 2    # 秒
    MAX_POLLS = 300      # 10 分钟

    def __init__(self, api_key: str, base_url: str = "https://ark.cn-beijing.volces.com/api/v3"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    async def generate(self, request: MediaRequest) -> MediaResponse:
        task_id = await self._submit_task(request)

        async with httpx.AsyncClient() as client:
            for _ in range(self.MAX_POLLS):
                await asyncio.sleep(self.POLL_INTERVAL)
                status, result = await self._query_task(client, task_id)

                if status == "SUCCEEDED":
                    video_url = result.get("video_url", "")
                    return MediaResponse(
                        url=video_url,
                        duration=result.get("duration"),
                        usage_id=task_id,
                        meta=result,
                    )
                if status in ("FAILED", "CANCELED"):
                    raise AppError(
                        msg=f"Volcengine video task {status}: {result.get('message', '')}",
                        data=result,
                        code=502,
                        status_code=502,
                    )

        raise AppError(msg="Volcengine video task timeout", code=504, status_code=504)

    async def _submit_task(self, request: MediaRequest) -> str:
        url = f"{self.base_url}/video/generations"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        payload: dict = {
            "model": request.model_key,
            "prompt": request.prompt,
        }
        payload.update(request.param_json)

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, headers=headers, timeout=30.0)
            if resp.status_code != 200:
                raise AppError(
                    msg=f"Volcengine video submit error: {resp.status_code}",
                    data={"raw": resp.text},
                    code=502,
                    status_code=502,
                )
            data = resp.json()
            task_id = data.get("task_id") or data.get("id")
            if not task_id:
                raise AppError(msg="Volcengine video: no task_id", data=data, code=502, status_code=502)
            return task_id

    async def _query_task(self, client: httpx.AsyncClient, task_id: str) -> tuple[str, dict]:
        url = f"{self.base_url}/video/generations/{task_id}"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        resp = await client.get(url, headers=headers, timeout=10.0)
        if resp.status_code != 200:
            return "PENDING", {}
        data = resp.json()
        status = data.get("status", "PENDING")
        return status, data
