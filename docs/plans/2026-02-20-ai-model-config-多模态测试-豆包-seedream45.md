# AI 模型配置多模态测试（文本/图像/视频）+ 豆包 Seedream 4.5 接入 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将“模型配置-测试对话”从仅文本扩展为支持文本、图像、视频三类测试，并优先落地火山引擎豆包 Seedream 4.5 的图片生成 SDK，同时为后续接入其他图片/视频生成 SDK 预留扩展点。

**Architecture:** 复用现有 `AICategory = text|image|video` 与后端 `ai_gateway_service` 的三类能力（`chat_text` / `generate_image` / `generate_video`）。前端统一一个“模型测试”弹窗，根据当前 Tab（text/image/video）渲染不同表单；图像/视频参考素材在浏览器侧处理为 `data:` URL（视频抽帧→多张图片 data URL），后端只负责转发到对应 Provider 并返回生成结果。

**Tech Stack:** Next.js App Router（Client UI + Route Handlers 代理）、FastAPI（RBAC + ai_gateway）、httpx（豆包 Ark API 调用）

---

## 0. 现状与约束

### 0.1 现状
- 前端 `设置 / 模型配置` 当前只有“测试对话（文本）”，并且仅在 `activeModelTab === "text"` 时启用：见 [settings/page.tsx](file:///f:/animate-serial/apps/anyreason/nextjs-frontend/app/(aistudio)/settings/page.tsx#L971-L1086)。
- 后端已有三类能力：
  - 文本：`ai_gateway_service.chat_text` / `chat_text_stream`
  - 图片：`ai_gateway_service.generate_image`（已存在但没有 admin test 路由）
  - 视频：`ai_gateway_service.generate_video`（已存在但没有 admin test 路由）
  - 参考：图片/视频能力当前统一用 `image_data_urls: list[str] | None`
- Provider 工厂已经区分 text/image/video，但 image 的 `doubao` 目前映射到 `OpenAIImageProvider()`：见 [ProviderFactory](file:///f:/animate-serial/apps/anyreason/fastapi_backend/app/ai_gateway/factory.py#L22-L27)。

### 0.2 关键约束（来自 Seedream 4.5 文档）
- 图片生成接口：`POST https://ark.cn-beijing.volces.com/api/v3/images/generations`
- `prompt` 建议不超过 300 汉字/600 英文单词。
- 参考图 `image` 支持 URL 或 Base64（`data:image/<fmt>;base64,<...>`），最多 14 张（Seedream 4.5/4.0）。
- 单张图片大小 ≤10MB；宽高比范围 `[1/16, 16]`；总像素范围（采用“宽x高”方式时）`[1280x720, 4096x4096]` 的像素积区间。

---

## 1. 设计目标（面向后续扩展）

### 1.1 Provider 扩展策略
- 后端保持“按 category 分发”的 Provider 架构不变：
  - text：OpenAI 兼容 `chat_completions`（已落地）
  - image：实现 `generate_image(cfg, prompt, resolution, image_data_urls)`（新增 Doubao Seedream 实现）
  - video：实现 `generate_video(cfg, prompt, duration, aspect_ratio, image_data_urls)`（保持 Kling 现状）
- **后续兼容其他图片 SDK 的关键点**：
  - 统一输入：`prompt + resolution + image_data_urls[]`（参考素材统一为图片 data URL）
  - 统一输出：返回一个可展示的 `url`（可能是 http(s) URL，也可能是 `data:image/...;base64,...`）
  - SDK 差异（如支持多张输出、组图、seed、style 等）先不做进 admin test 的第一版，避免 UI 过早复杂化；后续可以在 request body 增加可选字段，不破坏现有字段。

### 1.2 前端多模态测试策略
- 统一“模型测试”弹窗：
  - text：沿用现有 SSE 流式测试（不改变已有体验）
  - image：输入 prompt + 分辨率 +（可选）上传图片/上传视频（视频抽帧得到参考图）
  - video：输入 prompt + duration + aspect_ratio +（可选）上传图片/上传视频（视频抽帧得到参考图）
- **上传视频用于生成参考**：不把整段视频传后端；在浏览器侧从视频中抽取 1~4 帧，转换为 JPEG/PNG 的 `data:` URL，作为 `image_data_urls[]` 发送到后端。
  - 优点：不引入后端视频处理依赖；不需要额外的文件存储与公开 URL；与现有 `image_data_urls` 参数契合。

---

## 2. 后端实现计划

### Task 1: 新增 Doubao Seedream 4.5 图片 Provider（SDK）

**Files:**
- Create: `fastapi_backend/app/ai_gateway/providers/doubao_seedream_image_provider.py`
- Modify: `fastapi_backend/app/ai_gateway/providers/__init__.py`
- Modify: `fastapi_backend/app/ai_gateway/factory.py`
- Test: `fastapi_backend/tests/ai_gateway/test_doubao_seedream_image_provider.py`

**Step 1: 写失败测试（解析输出 + 请求体组装）**

```python
import httpx
import pytest

from app.ai_gateway.types import ResolvedModelConfig

@pytest.mark.asyncio
async def test_seedream_generate_image_sends_images_and_returns_data_url(monkeypatch):
    cfg = ResolvedModelConfig(
        id=None,
        category="image",
        manufacturer="doubao",
        model="doubao-seedream-4.5",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        api_key="test-key",
        enabled=True,
    )

    captured = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["json"] = request.json()
        return httpx.Response(
            200,
            json={"data": [{"url": "https://example.com/out.png"}]},
        )

    transport = httpx.MockTransport(handler)
    monkeypatch.setattr("app.ai_gateway.providers.doubao_seedream_image_provider.httpx_client", lambda timeout_seconds=60.0: httpx.AsyncClient(transport=transport))

    from app.ai_gateway.providers.doubao_seedream_image_provider import DoubaoSeedreamImageProvider

    p = DoubaoSeedreamImageProvider()
    out = await p.generate_image(
        cfg=cfg,
        prompt="a cat",
        resolution="2048x2048",
        image_data_urls=["data:image/png;base64,AAAA"],
    )
    assert out == "https://example.com/out.png"
    assert captured["url"].endswith("/images/generations")
    assert "Authorization" in captured["headers"]
    assert captured["json"]["model"] == "doubao-seedream-4.5"
    assert captured["json"]["prompt"] == "a cat"
    assert captured["json"]["size"] == "2048x2048"
    assert captured["json"]["image"] == "data:image/png;base64,AAAA"
```

**Step 2: 运行测试确认失败**
- Run: `uv run pytest fastapi_backend/tests/ai_gateway/test_doubao_seedream_image_provider.py -q`
- Expected: FAIL（模块不存在 / Provider 未实现）

**Step 3: 写最小实现**
- Provider 规则：
  - base_url：使用 `cfg.base_url`；若为空则默认 `https://ark.cn-beijing.volces.com/api/v3`
  - endpoint：`{base_url.rstrip("/")}/images/generations`
  - headers：`Authorization: Bearer <api_key>` + `Content-Type: application/json`
  - body：
    - 必填：`model`, `prompt`
    - 可选：`size`（分辨率字符串，例 `2048x2048` 或文档支持的 1K/2K/4K）
    - 可选：`image`（无参考图→不传；1 张→字符串；多张→数组）
  - 输出解析：
    - 优先取 `data[0].url`
    - 若返回 base64 字段（如 `b64_json`），则拼成 `data:image/png;base64,...`
    - 都没有则抛 `doubao_seedream_no_output`

**Step 4: 运行测试确认通过**
- Run: `uv run pytest fastapi_backend/tests/ai_gateway/test_doubao_seedream_image_provider.py -q`
- Expected: PASS

**Step 5: 连接 ProviderFactory**
- 将 `ProviderFactory._image["doubao"]` 指向 `DoubaoSeedreamImageProvider()`，避免继续走 `OpenAIImageProvider()`

---

### Task 2: 新增 admin 侧图片/视频测试接口

**Files:**
- Modify: `fastapi_backend/app/schemas_ai_models.py`
- Modify: `fastapi_backend/app/api/v1/ai_model_configs.py`
- Test: `fastapi_backend/tests/routes/test_ai_model_config_test_image_video.py`

**Step 1: 增加 Schema**
- `AdminAIModelConfigTestImageRequest`：
  - `prompt: str`
  - `resolution: str | None`
  - `image_data_urls: list[str] | None`
- `AdminAIModelConfigTestImageResponse`：
  - `url: str`
  - `raw: dict[str, Any] | None`（保持可观测性；对 Doubao 可选填入 upstream json）
- `AdminAIModelConfigTestVideoRequest`：
  - `prompt: str`
  - `duration: int`
  - `aspect_ratio: str`
  - `image_data_urls: list[str] | None`
- `AdminAIModelConfigTestVideoResponse`：
  - `url: str`
  - `raw: dict[str, Any] | None`

**Step 2: 增加路由**
- `POST /api/v1/ai/admin/model-configs/{id}/test-image`
  - 调 `ai_gateway_service.generate_image(... credits_cost=0 ...)`
  - 返回 `{url, raw}`（raw 先可为 `{"url": url}`，后续再精细化）
- `POST /api/v1/ai/admin/model-configs/{id}/test-video`
  - 调 `ai_gateway_service.generate_video(... credits_cost=0 ...)`

**Step 3: 写测试（monkeypatch provider_factory）**
- 模仿现有文本测试的写法：
  - monkeypatch `provider_factory.get_image_provider` 返回 dummy provider（直接返回固定 url）
  - monkeypatch `provider_factory.get_video_provider` 返回 dummy provider
  - 断言 403（非管理员）/ 200（管理员）/ 缺少 api_key 时 400

---

## 3. 前端实现计划（设置页多模态测试 UI）

### Task 3: 把“测试对话”重构为多模态“模型测试”

**Files:**
- Modify: `nextjs-frontend/app/(aistudio)/settings/page.tsx`
- Modify: `nextjs-frontend/components/actions/ai-model-actions.ts`
- (Optional, 推荐) Create: `nextjs-frontend/components/settings/AIModelTestDialog.tsx`（把巨型 settings/page.tsx 中的弹窗逻辑抽出来）

**Step 1: 增加 Server Actions**
- 在 `ai-model-actions.ts` 新增：
  - `aiAdminTestImage(modelConfigId, input)` → `POST /api/v1/ai/admin/model-configs/:id/test-image`
  - `aiAdminTestVideo(modelConfigId, input)` → `POST /api/v1/ai/admin/model-configs/:id/test-video`

**Step 2: 实现浏览器侧上传图片（转 data URL）**
- UI：支持多选图片（最多 14 张）
- 行为：读取 `File` → `FileReader.readAsDataURL` → 存入 `image_data_urls[]`
- 校验（前端先拦截，后端也可再拦一层）：
  - 单张 ≤10MB
  - 数量 ≤14

**Step 3: 实现浏览器侧上传视频（抽帧 → data URL）**
- UI：上传 1 个视频文件
- 行为（建议策略）：
  - 创建 `HTMLVideoElement`（`URL.createObjectURL(file)`）
  - 在 `currentTime = 0, 25%, 50%, 75%` 采样最多 4 帧
  - 每帧通过 `canvas.drawImage(video, ...)` 导出 `canvas.toDataURL("image/jpeg", 0.9)`
  - 将抽取结果合并进 `image_data_urls[]`
- 目的：让“视频参考”在第一版能驱动图片/视频生成（作为参考帧），并且不引入后端视频依赖。

**Step 4: 文本测试保持流式；图片/视频测试走非流式**
- text：保留现有 `/api/ai/admin/model-configs/:id/test-chat/stream` 的 SSE 读流逻辑。
- image/video：
  - 在弹窗里展示提交按钮与结果区域
  - 返回结果 `url` 若为 `data:image/...` 用 `<img src=...>` 展示；若为 http(s) URL 同样展示
  - video 返回 `url` 用 `<video controls src=...>` 展示

**Step 5: 让弹窗在 image/video Tab 也可打开**
- 去掉 `if (activeModelTab !== "text") return;` 的限制，改为：
  - 打开弹窗时默认选择当前 tab 中的第一个 modelConfigId（与 text 一致）
  - 根据 tab 渲染不同表单

---

## 4. 配置体验（Doubao base_url 默认值）

### Task 4: 让图片分类下的 doubao 也自动填充 base_url 默认值

**Files:**
- Modify: `nextjs-frontend/app/(aistudio)/settings/page.tsx`（`getDefaultBaseUrl`）

**Goal:**
- `category === "image" && manufacturer === "doubao"` 时默认填 `https://ark.cn-beijing.volces.com/api/v3`
- 说明：与文档的 endpoint 保持一致，最终请求会拼到 `/images/generations`

---

## 5. 验证清单

### 后端
- `pytest`：新增的 image/video 测试全绿
- 手工：在“模型配置（image）”创建/更新 doubao seedream 4.5 配置后，admin test-image 返回可展示的图片 URL/data URL

### 前端
- 在设置页的 text/image/video Tab 都能打开“模型测试”
- text：SSE 流式不回归
- image：上传图片后可生成（结果可预览），不上传图片也能文生图
- video：上传图片/视频（抽帧）后可提交测试（若当前没有视频 provider，可先保证 UI/接口联调与错误提示正确）

