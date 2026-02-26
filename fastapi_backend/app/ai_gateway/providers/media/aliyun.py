"""
AliyunMediaProvider - 阿里云 DashScope 媒体生成统一 Provider。
所有图片和视频模型统一走异步提交 + 轮询（X-DashScope-Async: enable）。
img_url 支持三种格式：公网 URL、OSS 临时 URL、data:image/xxx;base64,... 编码。
参考文档：https://help.aliyun.com/zh/model-studio/image-to-video-api-reference/
"""

import asyncio
import logging
from typing import Any, Dict

import httpx

from app.ai_gateway.providers.base_media import MediaProvider
from app.core.exceptions import AppError
from app.schemas_media import MediaRequest, MediaResponse

logger = logging.getLogger(__name__)


class AliyunMediaProvider(MediaProvider):
    # 模型 → API 端点映射
    ENDPOINT_MAP: Dict[str, str] = {
        # 图片：千问文生图 qwen-image-max（multimodal-generation + messages 格式）
        "qwen-image-max": "multimodal-generation/generation",
        "qwen-image-max-2025-12-30": "multimodal-generation/generation",
        # 图片：千问文生图 qwen-image-plus / qwen-image（text2image + prompt 格式）
        "qwen-image-plus": "text2image/image-synthesis",
        "qwen-image-plus-2026-01-09": "text2image/image-synthesis",
        "qwen-image": "text2image/image-synthesis",
        # 图片：Z-Image
        "z-image-turbo": "text2image/image-synthesis",
        # 图片：万向文生图 v2
        "wan2.6-t2i": "multimodal-generation/generation",
        "wan2.5-t2i": "multimodal-generation/generation",
        "wan2.2-t2i": "multimodal-generation/generation",
        # 视频：基于首帧（wan2.6/wan2.5 系列）
        "wan2.6-i2v": "video-generation/video-synthesis",
        "wan2.5-i2v": "video-generation/video-synthesis",
        # 视频：首尾帧（wan2.2/wanx2.1 系列）
        "wan2.2-kf2v-flash": "image2video/video-synthesis",
        "wanx2.1-kf2v-plus": "image2video/video-synthesis",
        # 视频：首帧（wan2.2 i2v）
        "wan2.2-i2v": "image2video/video-synthesis",
        # 视频：参考生视频
        "wan2.6-r2v": "video-generation/video-synthesis",
        "wan2.6-r2v-flash": "video-generation/video-synthesis",
    }

    # qwen-image-max 系列使用 messages 格式（而非 prompt 格式）
    MESSAGES_FORMAT_MODELS = {
        "qwen-image-max", "qwen-image-max-2025-12-30",
    }

    VIDEO_MODELS = {
        "wan2.6-i2v", "wan2.5-i2v",
        "wan2.2-i2v", "wan2.2-kf2v-flash", "wanx2.1-kf2v-plus",
        "wan2.6-r2v", "wan2.6-r2v-flash",
    }

    POLL_INTERVAL = 2       # 秒
    MAX_POLL_IMAGE = 150    # 5 分钟
    MAX_POLL_VIDEO = 150    # 5 分钟

    def __init__(self, api_key: str, base_url: str = "https://dashscope.aliyuncs.com/api/v1"):
        self.api_key = api_key
        # 规范化 base_url：只保留到 /api/v1，去掉用户可能多填的 endpoint 路径
        raw = base_url.rstrip("/")
        idx = raw.find("/api/v1")
        if idx >= 0:
            raw = raw[:idx + len("/api/v1")]
        self.base_url = raw

    # ------------------------------------------------------------------
    # routing
    # ------------------------------------------------------------------
    def _get_endpoint(self, model_key: str) -> str:
        endpoint = self.ENDPOINT_MAP.get(model_key)
        if endpoint:
            return endpoint
        for prefix, ep in self.ENDPOINT_MAP.items():
            if model_key.startswith(prefix):
                return ep
        return "text2image/image-synthesis"

    def _is_video_model(self, model_key: str) -> bool:
        if model_key in self.VIDEO_MODELS:
            return True
        return any(model_key.startswith(v) for v in self.VIDEO_MODELS)

    def _uses_messages_format(self, model_key: str) -> bool:
        """qwen-image-max 系列使用 messages 格式，其他图片模型使用 prompt 格式"""
        return model_key in self.MESSAGES_FORMAT_MODELS

    # ------------------------------------------------------------------
    # public entry
    # ------------------------------------------------------------------
    async def generate(self, request: MediaRequest) -> MediaResponse:
        if self._is_video_model(request.model_key):
            return await self._generate_video(request)
        if self._uses_messages_format(request.model_key):
            # qwen-image-max 不支持异步调用，只能同步等待
            return await self._generate_image_sync(request)
        return await self._generate_image(request)

    # ------------------------------------------------------------------
    # 图片生成 — 同步（qwen-image-max 不支持异步，只能同步等待）
    # ------------------------------------------------------------------
    async def _generate_image_sync(self, request: MediaRequest) -> MediaResponse:
        endpoint = self._get_endpoint(request.model_key)
        url = f"{self.base_url}/services/aigc/{endpoint}"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        params = {**request.param_json}
        resolution = params.pop("resolution", None)
        # 参考图字段不属于阿里云 multimodal-generation API 的 text2image 模式
        image_data_urls = params.pop("image_data_urls", None)
        if image_data_urls:
            raise AppError(
                msg=f"模型 {request.model_key} 不支持参考图输入（文生图模型仅支持文本生成图片）。如需使用参考图，请选择支持图片编辑的模型（如 qwen-image-edit）。",
                code=400,
                status_code=400,
            )
        if resolution and "size" not in params:
            params["size"] = str(resolution).replace("x", "*").replace("X", "*")
        if request.negative_prompt:
            params["negative_prompt"] = request.negative_prompt

        payload: dict = {
            "model": request.model_key,
            "input": {
                "messages": [
                    {"role": "user", "content": [{"text": request.prompt}]}
                ]
            },
            "parameters": params,
        }

        logger.info("[aliyun-image-sync] model=%s url=%s params=%s",
                     request.model_key, url, {k: v for k, v in params.items() if k != "negative_prompt"})

        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, headers=headers, timeout=300.0)
            if resp.status_code != 200:
                body = resp.text[:2000]
                logger.error("[aliyun-image-sync] failed status=%d body=%s", resp.status_code, body)
                err_msg = f"Aliyun error: HTTP {resp.status_code}"
                try:
                    err_data = resp.json()
                    err_msg = f"Aliyun: {err_data.get('message') or err_data.get('msg') or body[:300]}"
                except Exception:
                    if body:
                        err_msg = f"Aliyun error: HTTP {resp.status_code} - {body[:300]}"
                raise AppError(msg=err_msg, data={"raw": body}, code=502, status_code=502)

            data = resp.json()
            logger.info("[aliyun-image-sync] ok request_id=%s keys=%s", data.get("request_id"), list(data.keys()))

            choices = data.get("output", {}).get("choices", [])
            if choices:
                content = choices[0].get("message", {}).get("content", [])
                for item in content:
                    if "image" in item:
                        return MediaResponse(url=item["image"], usage_id=data.get("request_id", "unknown"), meta=data)

            results = data.get("output", {}).get("results", [])
            if results:
                first = results[0]
                return MediaResponse(url=first.get("url", ""), usage_id=data.get("request_id", "unknown"), meta=data)

            logger.error("[aliyun-image-sync] no image in response: %s", data)
            raise AppError(msg="Aliyun: 未获取到图片结果", data=data, code=502, status_code=502)

    # ------------------------------------------------------------------
    # 图片生成 — 异步提交 + 轮询（所有其他图片模型）
    # ------------------------------------------------------------------
    async def _generate_image(self, request: MediaRequest) -> MediaResponse:
        endpoint = self._get_endpoint(request.model_key)
        url = f"{self.base_url}/services/aigc/{endpoint}"
        headers = self._build_headers(async_mode=True)

        params = {**request.param_json}
        resolution = params.pop("resolution", None)
        # 参考图字段不属于阿里云 text2image API，从 parameters 中移除
        image_data_urls = params.pop("image_data_urls", None)
        if image_data_urls:
            raise AppError(
                msg=f"模型 {request.model_key} 不支持参考图输入（text2image 模型仅支持文本生成图片）。如需使用参考图，请选择支持图片编辑的模型（如 qwen-image-edit）。",
                code=400,
                status_code=400,
            )
        if resolution and "size" not in params:
            params["size"] = str(resolution).replace("x", "*").replace("X", "*")

        input_block: Dict[str, Any] = {"prompt": request.prompt}
        if request.negative_prompt:
            input_block["negative_prompt"] = request.negative_prompt
        payload: dict = {
            "model": request.model_key,
            "input": input_block,
            "parameters": params,
        }

        logger.info("[aliyun-image] async submit model=%s url=%s params=%s",
                     request.model_key, url, {k: v for k, v in params.items() if k != "negative_prompt"})

        return await self._submit_and_poll(url, headers, payload, self.MAX_POLL_IMAGE)

    # ------------------------------------------------------------------
    # 视频生成（所有视频模型统一异步提交 + 轮询）
    # ------------------------------------------------------------------
    # wan2.6/wan2.5 video-generation 端点只接受 tier 格式（720P / 1080P）
    _VIDEO_RESOLUTION_TIER_ONLY = {"wan2.6-i2v", "wan2.5-i2v", "wan2.6-r2v", "wan2.6-r2v-flash"}
    _PIXEL_TO_TIER: Dict[str, str] = {
        "1280x720": "720P", "720x1280": "720P", "854x480": "720P",
        "480x854": "720P", "960x540": "720P", "540x960": "720P",
        "1920x1080": "1080P", "1080x1920": "1080P",
    }

    async def _generate_video(self, request: MediaRequest) -> MediaResponse:
        endpoint = self._get_endpoint(request.model_key)
        url = f"{self.base_url}/services/aigc/{endpoint}"
        headers = self._build_headers(async_mode=True)

        params = dict(request.param_json)

        # wan2.6/wan2.5 系列只接受 resolution_tier（720P/1080P），不接受像素分辨率
        if request.model_key in self._VIDEO_RESOLUTION_TIER_ONLY:
            raw_res = params.pop("resolution", None)
            tier = params.pop("resolution_tier", None)
            if not tier and raw_res:
                tier = self._PIXEL_TO_TIER.get(raw_res, "720P")
            if tier:
                # 只允许 720P / 1080P
                if tier not in ("720P", "1080P"):
                    tier = "720P"
                params["resolution"] = tier

        input_block: Dict[str, Any] = {"prompt": request.prompt}

        # 统一处理 image_data_urls
        image_data_urls = params.pop("image_data_urls", None) or []
        images = [i for i in image_data_urls if (i or "").strip()]

        first_frame = (
            params.pop("first_frame_image", None)
            or params.pop("first_frame_url", None)
            or params.pop("img_url", None)
            or (images[0] if len(images) > 0 else None)
        )
        last_frame = (
            params.pop("last_frame_image", None)
            or params.pop("last_frame_url", None)
            or (images[1] if len(images) > 1 else None)
        )

        is_kf2v = endpoint == "image2video/video-synthesis"
        if first_frame:
            input_block["first_frame_url" if is_kf2v else "img_url"] = first_frame
        if last_frame:
            input_block["last_frame_url"] = last_frame

        ref_images = params.pop("ref_image_urls", None)
        ref_videos = params.pop("ref_video_urls", None)
        if ref_images:
            input_block["ref_image_urls"] = ref_images
        if ref_videos:
            input_block["ref_video_urls"] = ref_videos

        if request.negative_prompt:
            input_block["negative_prompt"] = request.negative_prompt

        payload: dict = {
            "model": request.model_key,
            "input": input_block,
            "parameters": params,
        }

        log_input = {k: (f"<base64 {len(str(v))} chars>" if isinstance(v, str) and len(str(v)) > 500 else v) for k, v in input_block.items()}
        logger.info("[aliyun-video] async submit model=%s endpoint=%s input_summary=%s params=%s",
                     request.model_key, endpoint, log_input, params)

        return await self._submit_and_poll(url, headers, payload, self.MAX_POLL_VIDEO)

    # ------------------------------------------------------------------
    # 统一异步任务提交 + 轮询
    # ------------------------------------------------------------------
    async def _submit_and_poll(
        self,
        url: str,
        headers: dict,
        payload: dict,
        max_polls: int,
    ) -> MediaResponse:
        async with httpx.AsyncClient() as client:
            logger.info("[aliyun-poll] submitting to %s model=%s", url, payload.get("model"))
            resp = await client.post(url, json=payload, headers=headers, timeout=30.0)
            if resp.status_code != 200:
                body = resp.text[:2000]
                logger.error("[aliyun-poll] submit failed status=%d body=%s", resp.status_code, body)
                err_msg = f"Aliyun submit error: HTTP {resp.status_code}"
                try:
                    err_data = resp.json()
                    err_msg = f"Aliyun: {err_data.get('message') or err_data.get('msg') or body[:300]}"
                except Exception:
                    if body:
                        err_msg = f"Aliyun submit error: HTTP {resp.status_code} - {body[:300]}"
                raise AppError(msg=err_msg, data={"raw": body}, code=502, status_code=502)

            data = resp.json()
            logger.info("[aliyun-poll] submit ok keys=%s request_id=%s", list(data.keys()), data.get("request_id"))

            output = data.get("output", {})

            # 如果服务端直接返回了结果（无 task_id）
            if "task_id" not in output:
                # choices 格式（qwen-image-max 同步 fallback）
                choices = output.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", [])
                    for item in content:
                        if "image" in item:
                            return MediaResponse(url=item["image"], usage_id=data.get("request_id", "unknown"), meta=data)
                # results 格式
                if "results" in output and output["results"]:
                    first = output["results"][0]
                    return MediaResponse(url=first.get("url") or first.get("video_url", ""), usage_id=data.get("request_id", "unknown"), meta=data)
                logger.error("[aliyun-poll] no task_id or results: %s", data)
                raise AppError(msg="Aliyun: 未返回 task_id 或结果", data=data, code=502, status_code=502)

            task_id = output["task_id"]
            logger.info("[aliyun-poll] task_id=%s, polling (max=%d, interval=%ds)", task_id, max_polls, self.POLL_INTERVAL)

            poll_headers = {"Authorization": f"Bearer {self.api_key}"}
            for attempt in range(max_polls):
                await asyncio.sleep(self.POLL_INTERVAL)
                task_url = f"{self.base_url}/tasks/{task_id}"
                resp = await client.get(task_url, headers=poll_headers, timeout=10.0)

                if resp.status_code != 200:
                    logger.warning("[aliyun-poll] attempt=%d/%d task_id=%s http=%d", attempt + 1, max_polls, task_id, resp.status_code)
                    continue

                task_data = resp.json()
                status = task_data.get("output", {}).get("task_status")
                metrics = task_data.get("output", {}).get("task_metrics", {})

                if attempt % 10 == 0 or status not in ("PENDING", "RUNNING"):
                    logger.info("[aliyun-poll] attempt=%d/%d task_id=%s status=%s metrics=%s", attempt + 1, max_polls, task_id, status, metrics)

                if status == "SUCCEEDED":
                    logger.info("[aliyun-poll] succeeded task_id=%s attempts=%d", task_id, attempt + 1)
                    return self._parse_success(task_id, task_data)
                if status in ("FAILED", "CANCELED"):
                    msg = task_data.get("output", {}).get("message", "unknown error")
                    logger.error("[aliyun-poll] %s task_id=%s msg=%s", status, task_id, msg)
                    raise AppError(msg=f"Aliyun task failed: {msg}", data=task_data, code=502, status_code=502)

            logger.error("[aliyun-poll] timeout task_id=%s after %d polls", task_id, max_polls)
            raise AppError(msg="Aliyun task timeout", code=504, status_code=504)

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------
    def _build_headers(self, async_mode: bool = False) -> dict:
        h = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if async_mode:
            h["X-DashScope-Async"] = "enable"
        return h

    @staticmethod
    def _parse_success(task_id: str, task_data: dict) -> MediaResponse:
        output = task_data.get("output", {})
        results = output.get("results", [])

        # choices 格式（qwen-image-max 异步完成后可能返回此格式）
        choices = output.get("choices", [])
        if choices:
            content = choices[0].get("message", {}).get("content", [])
            for item in content:
                if "image" in item:
                    return MediaResponse(url=item["image"], usage_id=task_id, meta=task_data)

        if results:
            first = results[0]
            url = first.get("url") or first.get("video_url", "")
        elif "video_url" in output:
            url = output["video_url"]
        elif "url" in output:
            url = output["url"]
        else:
            raise AppError(msg="Aliyun task succeeded but no URL found", data=task_data, code=502, status_code=502)

        duration = None
        if "duration" in output:
            duration = float(output["duration"])

        return MediaResponse(url=url, duration=duration, usage_id=task_id, meta=task_data)
