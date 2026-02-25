"""Property-based tests for the unified media provider system.

Uses Hypothesis library for property-based testing.
Each property test runs at least 100 iterations.
"""

import hypothesis.strategies as st
from hypothesis import given, settings

from app.ai_gateway.providers.base_media import MediaProvider
from app.ai_gateway.providers.media_factory import MediaProviderFactory


# Feature: unified-media-provider, Property 1: 已注册厂商返回有效 Provider 实例
# **Validates: Requirements 1.3**
class TestRegisteredManufacturerReturnsValidProvider:
    """For any manufacturer key that exists in MediaProviderFactory.PROVIDER_MAP,
    calling get_provider(manufacturer, api_key) should return an instance of
    MediaProvider (not raise an exception).

    We always supply a base_url because some providers (e.g. gemini_proxy)
    require it. The factory passes base_url through when provided, so this
    exercises the full constructor path for every provider."""

    @given(
        manufacturer=st.sampled_from(list(MediaProviderFactory.PROVIDER_MAP.keys())),
        api_key=st.text(min_size=1, max_size=100),
    )
    @settings(max_examples=100)
    def test_registered_manufacturer_returns_media_provider_instance(
        self, manufacturer: str, api_key: str
    ):
        factory = MediaProviderFactory()
        provider = factory.get_provider(
            manufacturer=manufacturer,
            api_key=api_key,
            base_url="https://test.example.com",
        )
        assert isinstance(provider, MediaProvider), (
            f"get_provider('{manufacturer}', ...) returned {type(provider).__name__}, "
            f"expected a MediaProvider instance"
        )

from app.core.exceptions import AppError
import pytest


# Feature: unified-media-provider, Property 2: 未注册厂商抛出 AppError
# **Validates: Requirements 1.4**
class TestUnregisteredManufacturerRaisesAppError:
    """For any string that is not a key in MediaProviderFactory.PROVIDER_MAP,
    calling get_provider(manufacturer, api_key) should raise an AppError
    with code=400 and the error message should contain the manufacturer string."""

    @given(
        manufacturer=st.text(min_size=1, max_size=200).filter(
            lambda s: s.lower().strip() not in MediaProviderFactory.PROVIDER_MAP
        ),
        api_key=st.text(min_size=1, max_size=100),
    )
    @settings(max_examples=100)
    def test_unregistered_manufacturer_raises_app_error(
        self, manufacturer: str, api_key: str
    ):
        factory = MediaProviderFactory()
        with pytest.raises(AppError) as exc_info:
            factory.get_provider(manufacturer=manufacturer, api_key=api_key)

        error = exc_info.value
        assert error.code == 400, (
            f"Expected AppError code=400, got code={error.code}"
        )
        assert manufacturer in error.msg, (
            f"Expected error message to contain '{manufacturer}', "
            f"got: '{error.msg}'"
        )


from unittest.mock import AsyncMock, patch

from app.ai_gateway.providers.adapters.kling_image_adapter import KlingImageAdapter
from app.ai_gateway.providers.adapters.kling_video_adapter import KlingVideoAdapter
from app.ai_gateway.providers.adapters.openai_image_adapter import OpenAIImageAdapter
from app.schemas_media import MediaRequest, MediaResponse


# ---------------------------------------------------------------------------
# Hypothesis strategies for MediaRequest param_json fields
# ---------------------------------------------------------------------------

_resolution_st = st.one_of(
    st.none(),
    st.from_regex(r"[1-9]\d{2,3}x[1-9]\d{2,3}", fullmatch=True),
)

_duration_st = st.one_of(st.none(), st.integers(min_value=1, max_value=60))

_aspect_ratio_st = st.one_of(
    st.none(),
    st.from_regex(r"[1-9]\d?:[1-9]\d?", fullmatch=True),
)

_image_data_urls_st = st.one_of(
    st.none(),
    st.lists(
        st.from_regex(r"data:image/png;base64,[A-Za-z0-9+/]{4,20}", fullmatch=True),
        min_size=0,
        max_size=5,
    ),
)

_model_key_st = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="-_"),
    min_size=1,
    max_size=50,
)

_prompt_st = st.text(min_size=1, max_size=200)

KNOWN_URL = "https://cdn.test.example.com/generated-media-result.png"


# Feature: unified-media-provider, Property 3: 适配器字段映射与响应封装
# **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**
class TestAdapterFieldMappingAndResponseWrapping:
    """For any MediaRequest with arbitrary model_key, prompt, and param_json fields,
    when passed to any adapter (KlingImageAdapter, KlingVideoAdapter, OpenAIImageAdapter),
    the adapter should correctly extract param_json fields (resolution, duration,
    aspect_ratio, image_data_urls) and map them to the old provider's parameter format,
    and the returned value should be a valid MediaResponse with a non-empty url field."""

    # --- KlingImageAdapter ---------------------------------------------------

    @given(
        model_key=_model_key_st,
        prompt=_prompt_st,
        resolution=_resolution_st,
        image_data_urls=_image_data_urls_st,
    )
    @settings(max_examples=100)
    @pytest.mark.asyncio
    async def test_kling_image_adapter_field_mapping(
        self,
        model_key: str,
        prompt: str,
        resolution,
        image_data_urls,
    ):
        adapter = KlingImageAdapter(api_key="test-key", base_url="https://api.kling.test")

        param_json: dict = {}
        if resolution is not None:
            param_json["resolution"] = resolution
        if image_data_urls is not None:
            param_json["image_data_urls"] = image_data_urls

        request = MediaRequest(
            model_key=model_key,
            prompt=prompt,
            param_json=param_json,
        )

        with patch.object(
            adapter._provider,
            "generate_image",
            new_callable=AsyncMock,
            return_value=KNOWN_URL,
        ) as mock_gen:
            result = await adapter.generate(request)

            # Verify field mapping to old provider
            mock_gen.assert_called_once()
            kw = mock_gen.call_args.kwargs
            assert kw["prompt"] == prompt
            assert kw["resolution"] == param_json.get("resolution")
            assert kw["image_data_urls"] == param_json.get("image_data_urls")
            cfg = kw["cfg"]
            assert cfg.model == model_key
            assert cfg.category == "image"
            assert cfg.manufacturer == "kling"

            # Verify response wrapping
            assert isinstance(result, MediaResponse)
            assert result.url == KNOWN_URL
            assert len(result.url) > 0

    # --- KlingVideoAdapter ---------------------------------------------------

    @given(
        model_key=_model_key_st,
        prompt=_prompt_st,
        duration=_duration_st,
        aspect_ratio=_aspect_ratio_st,
        image_data_urls=_image_data_urls_st,
    )
    @settings(max_examples=100)
    @pytest.mark.asyncio
    async def test_kling_video_adapter_field_mapping(
        self,
        model_key: str,
        prompt: str,
        duration,
        aspect_ratio,
        image_data_urls,
    ):
        adapter = KlingVideoAdapter(api_key="test-key", base_url="https://api.kling.test")

        param_json: dict = {}
        if duration is not None:
            param_json["duration"] = duration
        if aspect_ratio is not None:
            param_json["aspect_ratio"] = aspect_ratio
        if image_data_urls is not None:
            param_json["image_data_urls"] = image_data_urls

        request = MediaRequest(
            model_key=model_key,
            prompt=prompt,
            param_json=param_json,
        )

        with patch.object(
            adapter._provider,
            "generate_video",
            new_callable=AsyncMock,
            return_value=KNOWN_URL,
        ) as mock_gen:
            result = await adapter.generate(request)

            # Verify field mapping to old provider
            mock_gen.assert_called_once()
            kw = mock_gen.call_args.kwargs
            assert kw["prompt"] == prompt
            # duration defaults to 5 when not in param_json
            assert kw["duration"] == param_json.get("duration", 5)
            # aspect_ratio defaults to "16:9" when not in param_json
            assert kw["aspect_ratio"] == param_json.get("aspect_ratio", "16:9")
            assert kw["image_data_urls"] == param_json.get("image_data_urls")
            cfg = kw["cfg"]
            assert cfg.model == model_key
            assert cfg.category == "video"
            assert cfg.manufacturer == "kling"

            # Verify response wrapping
            assert isinstance(result, MediaResponse)
            assert result.url == KNOWN_URL
            assert len(result.url) > 0

    # --- OpenAIImageAdapter --------------------------------------------------

    @given(
        model_key=_model_key_st,
        prompt=_prompt_st,
        resolution=_resolution_st,
        image_data_urls=_image_data_urls_st,
    )
    @settings(max_examples=100)
    @pytest.mark.asyncio
    async def test_openai_image_adapter_field_mapping(
        self,
        model_key: str,
        prompt: str,
        resolution,
        image_data_urls,
    ):
        adapter = OpenAIImageAdapter(api_key="sk-test", base_url="https://api.openai.test")

        param_json: dict = {}
        if resolution is not None:
            param_json["resolution"] = resolution
        if image_data_urls is not None:
            param_json["image_data_urls"] = image_data_urls

        request = MediaRequest(
            model_key=model_key,
            prompt=prompt,
            param_json=param_json,
        )

        with patch.object(
            adapter._provider,
            "generate_image",
            new_callable=AsyncMock,
            return_value=KNOWN_URL,
        ) as mock_gen:
            result = await adapter.generate(request)

            # Verify field mapping to old provider
            mock_gen.assert_called_once()
            kw = mock_gen.call_args.kwargs
            assert kw["prompt"] == prompt
            assert kw["resolution"] == param_json.get("resolution")
            assert kw["image_data_urls"] == param_json.get("image_data_urls")
            cfg = kw["cfg"]
            assert cfg.model == model_key
            assert cfg.category == "image"
            assert cfg.manufacturer == "openai"

            # Verify response wrapping
            assert isinstance(result, MediaResponse)
            assert result.url == KNOWN_URL
            assert len(result.url) > 0


# ---------------------------------------------------------------------------
# Property 4: API 向后兼容性
# ---------------------------------------------------------------------------

from httpx import AsyncClient, ASGITransport
from app.schemas_media import MediaResponse as _MediaResponse4  # avoid shadowing

# Strategies for valid image request payloads
_image_prompt_st = st.text(min_size=1, max_size=200)
_image_resolution_st = st.one_of(
    st.none(),
    st.from_regex(r"[1-9]\d{2,3}x[1-9]\d{2,3}", fullmatch=True),
)
_image_images_st = st.lists(
    st.from_regex(r"data:image/png;base64,[A-Za-z0-9+/]{4,20}", fullmatch=True),
    min_size=0,
    max_size=3,
)

# Strategies for valid video request payloads
_video_prompt_st = st.text(min_size=1, max_size=200)
_video_duration_st = st.integers(min_value=1, max_value=60)
_video_aspect_ratio_st = st.sampled_from(["16:9", "4:3", "1:1", "9:16", "3:4"])
_video_images_st = st.lists(
    st.from_regex(r"data:image/png;base64,[A-Za-z0-9+/]{4,20}", fullmatch=True),
    min_size=0,
    max_size=3,
)

MOCK_MEDIA_RESPONSE = _MediaResponse4(
    url="https://cdn.test.example.com/pbt-result.png",
    usage_id="pbt-usage-001",
    meta={"source": "pbt"},
)


# Feature: unified-media-provider, Property 4: API 向后兼容性
# **Validates: Requirements 4.3**
class TestAPIBackwardCompatibility:
    """For any valid image or video generation request in the existing API format
    (prompt, resolution/aspect_ratio, negative_prompt), the migrated API routes
    should accept the request and return a response in the same format as before
    migration: {code: 200, msg: "OK", data: {url: string, raw: object}}."""

    @given(
        prompt=_image_prompt_st,
        resolution=_image_resolution_st,
        images=_image_images_st,
    )
    @settings(max_examples=100)
    @pytest.mark.asyncio
    async def test_image_route_backward_compatible(
        self,
        prompt: str,
        resolution,
        images: list[str],
    ):
        """POST /api/v1/ai/image/generate should accept any valid legacy image
        request and return {code: 200, msg: "OK", data: {url, raw}}."""
        from app.main import app as _app
        from app.users import current_active_user
        from app.database import get_async_session

        # Stub out auth and DB dependencies so we don't need a real database
        fake_user = type("FakeUser", (), {"id": "00000000-0000-0000-0000-000000000001"})()
        _app.dependency_overrides[current_active_user] = lambda: fake_user
        _app.dependency_overrides[get_async_session] = lambda: AsyncMock()

        try:
            # Build the request payload in the legacy format
            payload: dict = {"prompt": prompt}
            if resolution is not None:
                payload["resolution"] = resolution
            if images:
                payload["images"] = images

            with patch(
                "app.api.v1.ai_image.ai_gateway_service.generate_media",
                new_callable=AsyncMock,
                return_value=MOCK_MEDIA_RESPONSE,
            ):
                async with AsyncClient(
                    transport=ASGITransport(app=_app),
                    base_url="http://testserver",
                ) as client:
                    resp = await client.post(
                        "/api/v1/ai/image/generate",
                        json=payload,
                    )

            assert resp.status_code == 200, (
                f"Expected 200, got {resp.status_code} for payload {payload}"
            )
            body = resp.json()
            assert body["code"] == 200
            assert body["msg"] == "OK"
            assert "data" in body
            assert isinstance(body["data"]["url"], str)
            assert len(body["data"]["url"]) > 0
            assert isinstance(body["data"]["raw"], dict)
        finally:
            _app.dependency_overrides.pop(current_active_user, None)
            _app.dependency_overrides.pop(get_async_session, None)

    @given(
        prompt=_video_prompt_st,
        duration=_video_duration_st,
        aspect_ratio=_video_aspect_ratio_st,
        images=_video_images_st,
    )
    @settings(max_examples=100)
    @pytest.mark.asyncio
    async def test_video_route_backward_compatible(
        self,
        prompt: str,
        duration: int,
        aspect_ratio: str,
        images: list[str],
    ):
        """POST /api/v1/ai/video/generate should accept any valid legacy video
        request and return {code: 200, msg: "OK", data: {url, raw}}."""
        from app.main import app as _app
        from app.users import current_active_user
        from app.database import get_async_session

        # Stub out auth and DB dependencies so we don't need a real database
        fake_user = type("FakeUser", (), {"id": "00000000-0000-0000-0000-000000000002"})()
        _app.dependency_overrides[current_active_user] = lambda: fake_user
        _app.dependency_overrides[get_async_session] = lambda: AsyncMock()

        try:
            payload: dict = {
                "prompt": prompt,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
            }
            if images:
                payload["images"] = images

            with patch(
                "app.api.v1.ai_video.ai_gateway_service.generate_media",
                new_callable=AsyncMock,
                return_value=MOCK_MEDIA_RESPONSE,
            ):
                async with AsyncClient(
                    transport=ASGITransport(app=_app),
                    base_url="http://testserver",
                ) as client:
                    resp = await client.post(
                        "/api/v1/ai/video/generate",
                        json=payload,
                    )

            assert resp.status_code == 200, (
                f"Expected 200, got {resp.status_code} for payload {payload}"
            )
            body = resp.json()
            assert body["code"] == 200
            assert body["msg"] == "OK"
            assert "data" in body
            assert isinstance(body["data"]["url"], str)
            assert len(body["data"]["url"]) > 0
            assert isinstance(body["data"]["raw"], dict)
        finally:
            _app.dependency_overrides.pop(current_active_user, None)
            _app.dependency_overrides.pop(get_async_session, None)
