import logging
import json
import re
from typing import Any
import uuid

import httpx

from app.ai_gateway.providers.base_media import MediaProvider
from app.core.exceptions import AppError
from app.schemas_media import ExternalTaskRef, ExternalTaskStatus, MediaRequest, MediaResponse

logger = logging.getLogger(__name__)

def _strip_data_url_prefix(v: str) -> str:
    s = (v or "").strip()
    if s.startswith("data:") and ";base64," in s:
        return s.split(";base64,", 1)[1]
    return s

class GrokProxyProvider(MediaProvider):
    def __init__(self, api_key: str, base_url: str = "https://new.12ai.org/v1"):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")

    async def generate(self, request: MediaRequest) -> MediaResponse:
        endpoint = f"{self.base_url}/chat/completions"
        
        # Build prompt content
        content: list[dict[str, Any]] = [{"type": "text", "text": request.prompt}]
        
        # Add reference images if any
        images: list[str] = request.param_json.get("image_data_urls") or []
        if images:
            img = images[0]
            if img.startswith("http://") or img.startswith("https://"):
                content.append({
                    "type": "image_url",
                    "image_url": {"url": img}
                })
            else:
                if img.startswith("data:"):
                    content.append({"type": "image_url", "image_url": {"url": img}})
                else:
                    img_data = _strip_data_url_prefix(img)
                    content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_data}"}})
        
        payload = {
            "model": request.model_key or "grok-imagine-1.0-video",
            "messages": [{"role": "user", "content": content}],
            "stream": True
        }
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }

        logger.info(
            "[grokproxy] submit model=%s endpoint=%s",
            payload["model"], endpoint,
        )

        video_url = None
        preview_url = None
        usage_id = str(uuid.uuid4())

        try:
            # We might need a longer timeout for video generation (often takes 1-5 minutes)
            # as it streams text until the URL is generated.
            timeout = httpx.Timeout(300.0, connect=15.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream("POST", endpoint, json=payload, headers=headers) as response:
                    if response.status_code not in (200, 201):
                        await response.aread()
                        raise AppError(
                            msg=f"GrokProxy Submit Error: {response.status_code}",
                            data={"raw": response.text[:2000]},
                            code=502,
                            status_code=502,
                        )
                    
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        if line.startswith('data: ') and line != 'data: [DONE]':
                            try:
                                data = json.loads(line[6:])
                                chat_id = data.get("id")
                                if chat_id:
                                    usage_id = chat_id
                                
                                if 'choices' in data and data['choices']:
                                    delta = data['choices'][0].get('delta', {})
                                    delta_content = delta.get('content', '')
                                    
                                    if '进度' in delta_content:
                                        logger.info("[grokproxy] progress: %s", delta_content.strip())
                                    
                                    if '<video' in delta_content:
                                        mp4_match = re.search(r'src="([^"]+\.mp4)"', delta_content)
                                        poster_match = re.search(r'poster="([^"]+)"', delta_content)
                                        if mp4_match:
                                            video_url = mp4_match.group(1)
                                        if poster_match:
                                            preview_url = poster_match.group(1)
                            except json.JSONDecodeError:
                                pass
        except httpx.RequestError as e:
            raise AppError(
                msg=f"GrokProxy Request Error: {str(e)}",
                code=502,
                status_code=502
            )

        if not video_url:
            raise AppError(
                msg="GrokProxy Task completed but no video URL found",
                code=502,
                status_code=502,
            )

        logger.info("[grokproxy] success video_url=%s", video_url)
        
        return MediaResponse(
            url=video_url,
            usage_id=usage_id,
            meta={"preview_url": preview_url} if preview_url else {}
        )

    @property
    def supports_async(self) -> bool:
        return True

    async def submit_async(self, request: MediaRequest) -> ExternalTaskRef:
        """
        Since GrokProxy works in a single long-polling/streaming HTTP request,
        we fake an async submit by storing the entire request in the meta dictionary.
        The actual work will be done sequentially in the first query_status call.
        """
        task_id = f"grokproxy_dummy_{uuid.uuid4()}"
        
        # Serialize MediaRequest to dict for meta storage
        req_dict = {
            "model_key": request.model_key,
            "prompt": request.prompt,
            "negative_prompt": request.negative_prompt,
            "param_json": request.param_json,
            "callback_url": request.callback_url
        }
        
        return ExternalTaskRef(
            external_task_id=task_id,
            provider="grokproxy",
            meta={
                "api_key": self.api_key,
                "base_url": self.base_url,
                "request_data": req_dict
            }
        )

    async def query_status(self, ref: ExternalTaskRef) -> ExternalTaskStatus:
        """
        Since submitting was fake, we do the blocking generation here inside query_status.
        If it succeeds, we return immediately with succeeded state.
        This blocks the worker for ~1-2 mins but since it's a celery/background task, it's fine.
        """
        req_data = ref.meta.get("request_data")
        if not req_data:
            return ExternalTaskStatus(state="failed", error="Grokproxy lost request context in meta")
        
        request = MediaRequest(**req_data)
        
        try:
            logger.info("[grokproxy-async] starting synchronous generation inside query_status")
            # We override api_key/base_url if passed via meta (from db)
            self.api_key = ref.meta.get("api_key", self.api_key)
            self.base_url = ref.meta.get("base_url", self.base_url).rstrip("/")
            
            res = await self.generate(request)
            
            return ExternalTaskStatus(
                state="succeeded",
                progress=100,
                result=MediaResponse(
                    url=res.url,
                    duration=res.duration,
                    cost=res.cost,
                    usage_id=res.usage_id,
                    meta=res.meta
                )
            )
        except AppError as e:
            return ExternalTaskStatus(state="failed", error=str(e.msg))
        except Exception as e:
            return ExternalTaskStatus(state="failed", error=str(e))

