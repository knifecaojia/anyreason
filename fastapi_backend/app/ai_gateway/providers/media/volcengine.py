import asyncio

import httpx
from typing import Any, Dict
from volcenginesdkarkruntime import AsyncArk
from app.ai_gateway.providers.base_media import MediaProvider
from app.schemas_media import MediaRequest, MediaResponse
from app.core.exceptions import AppError

def _resolve_volcengine_size(
    resolution: str | None,
    aspect_ratio: str | None,
    resolution_tier: str | None = None,
) -> str:
    """将前端参数转换为 Volcengine SDK 的 size 参数（WIDTHxHEIGHT 格式）。

    优先级：resolution_tier > resolution > 默认值。
    SeedDream 系列模型最低像素 3,686,400（≈1920²），所以所有档位都需满足此下限。

    Volcengine size 接受: 'WIDTHxHEIGHT' | '1k' | '2k' | '4k'
    """
    # SeedDream 最低 3,686,400 像素；按比例算最小尺寸
    _SIZE_MAP: dict[str, dict[str, str]] = {
        "standard": {
            "1:1": "1920x1920", "16:9": "2560x1440", "9:16": "1440x2560",
            "4:3": "2216x1664", "3:4": "1664x2216",
        },
        "hd": {
            "1:1": "1920x1920", "16:9": "2560x1440", "9:16": "1440x2560",
            "4:3": "2216x1664", "3:4": "1664x2216",
        },
        "1k": {
            "1:1": "1920x1920", "16:9": "2560x1440", "9:16": "1440x2560",
            "4:3": "2216x1664", "3:4": "1664x2216",
        },
        "2k": {
            "1:1": "2048x2048", "16:9": "2560x1440", "9:16": "1440x2560",
            "4:3": "2216x1664", "3:4": "1664x2216",
        },
        "4k": {
            "1:1": "4096x4096", "16:9": "3840x2160", "9:16": "2160x3840",
            "4:3": "4096x3072", "3:4": "3072x4096",
        },
    }

    # 决定使用哪个 resolution key（resolution_tier 优先）
    raw = resolution_tier or resolution or "standard"
    res_key = raw.strip().lower()
    ratio_key = (aspect_ratio or "1:1").strip()

    # 已经是 WIDTHxHEIGHT 格式，直接返回
    if "x" in res_key and res_key.replace("x", "").isdigit():
        return raw.strip()

    tier = _SIZE_MAP.get(res_key, _SIZE_MAP["standard"])
    return tier.get(ratio_key, tier.get("1:1", "1920x1920"))


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
        payload.pop("negative_prompt", None)  # Volcengine SDK 不支持 negative_prompt
        payload.pop("model_config_id", None)
        payload.pop("parent_node_id", None)
        payload.pop("project_id", None)
        payload.pop("filename", None)

        # 将前端 resolution / resolution_tier / aspect_ratio 合并为 Volcengine size
        resolution_tier = payload.pop("resolution_tier", None)
        resolution = payload.pop("resolution", None)
        aspect_ratio = payload.pop("aspect_ratio", None)
        if "size" not in payload:
            payload["size"] = _resolve_volcengine_size(resolution, aspect_ratio, resolution_tier)

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
