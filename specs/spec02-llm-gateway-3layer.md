# 三层架构：前端配置（含 Key）- 后端配置中心 - LiteLLM Proxy 转发（LLM Gateway Spec v0.2）

> **文档状态：** `Draft`
>
> **适用范围：** anyreason（Next.js/React + FastAPI + Docker）
>
> **目标读者：** 产品/架构/后端/前端/运维/安全

---

## 0. 一句话结论

在现有项目（Next.js 前端已具备 Settings->models 配置入口；FastAPI 已具备 JWT 登录态与 RBAC）基础上，采用“前端统一配置供应商 API Key + FastAPI 统一配置中心 + LiteLLM Proxy 最简转发”的三层形态：前端在具备权限的 Settings 页面配置各供应商真实 API Key；FastAPI 作为唯一配置中心保存供应商 Key、模型目录与默认参数，并在调用时做鉴权、参数合并与调用日志落库；LiteLLM Proxy 只提供 OpenAI-compatible 的协议转发能力，不承担 Virtual Key、故障转移、成本追踪等复杂网关能力。

---

## 1. 背景与现状（基于当前仓库）

### 1.1 当前可复用能力

- **后端鉴权与 RBAC 已具备**：FastAPI 使用 fastapi-users（JWT）+ 自定义 `require_permissions()`，并有审计日志表（`audit_logs`）。
- **前端已有“模型引擎”配置入口**：`/settings?tab=models` 已存在供应商/默认模型等 UI 雏形，但目前密钥来源与持久化路径不清晰。
- **Docker Compose 目前无网关/Proxy**：仓库 compose 仅包含 backend/frontend + 基础设施（Postgres/MinIO/Redis），未引入 LiteLLM。

### 1.2 当前痛点（也是本方案要解决的）

- 前端目前“看起来可以填 API Key”，但缺少后端统一持久化与策略约束，易出现配置漂移与难以审计。
- 多供应商/多模型的“统一调用入口”不清晰，难以让 Studio 侧稳定依赖一个 OpenAI-compatible API。
- 模型配置目前不动态（无后端配置中心/策略统一点），难以做到“集中管控 + 灵活配置”。

---

## 2. 目标与非目标

### 2.1 目标（必须满足）

1. **三层架构落地**
   - 前端：可视化配置与调用，允许在受控页面配置真实供应商 API Key。
   - 后端（FastAPI）：配置中心（Key/模型目录/默认参数/可用模型）、鉴权与权限控制、参数合并、请求代理、调用日志与用量统计。
   - Proxy（LiteLLM）：仅做 OpenAI-compatible 协议转发与多供应商兼容调用的执行层，不引入 Virtual Key、故障转移、预算等复杂能力。
2. **统一 OpenAI 兼容接口对外服务**
   - 前端（以及未来其它内部服务）调用 FastAPI 暴露的 OpenAI-compatible 路由。
3. **动态化模型配置**
   - 模型列表、默认参数、可用模型、别名/映射均可通过 FastAPI 配置中心动态调整。
4. **集中化调用管理**
   - 统一鉴权、权限、限流、配额、审计、错误策略。
5. **精细化成本审计**
   - 至少做到：按用户、按模型、按时间段聚合；能追溯到单次调用记录（含 request_id），并保存 token 用量。
6. **兼容主流模型**
   - 文本：OpenAI / Claude / Gemini / 豆包等。
   - 图像：Gemini（如需）、豆包文生图/图生图等（若供应商不兼容 OpenAI Images，需适配层）。

### 2.2 非目标（本阶段不承诺）

- 不承诺把所有供应商的“私有参数”完整暴露给前端（只开放可控白名单）。
- 不承诺一次性实现视频/音频等所有模态（本 spec 聚焦文本与图像）。
- 不在本阶段实施数据库迁移与代码改造（等待你批准后才进入实施）。

---

## 3. 总体架构

### 3.1 逻辑视图（推荐数据流）

```mermaid
flowchart LR
  FE[React/Next.js 前端\nSettings->models + Studio 调用] -->|JWT Cookie| BE[FastAPI 控制面\n鉴权/RBAC/参数合并/策略/审计]
  BE -->|OpenAI-compatible\n+ user_id/request_id| PX[LiteLLM Proxy 数据面\nOpenAI协议转发]
  PX --> OA[OpenAI]
  PX --> CL[Anthropic Claude]
  PX --> GG[Google/Vertex Gemini]
  PX --> VB[Volcengine 豆包(文本/Embedding)]
  PX --> AD[内部适配器(可选)\n把非OpenAI接口包装成OpenAI兼容]
  AD --> IMG1[豆包文生图/图生图]
  AD --> IMG2[Gemini/Imagen 等图像]
```

### 3.2 职责边界（“谁负责什么”）

**前端（配置层）**

- 展示：可用模型列表、每个模型的可调参数、默认值与能力说明。
- 配置：用户偏好（如默认模型、温度、风格偏好等）与“请求级别参数”。
- 配置（受控）：在具备 RBAC 权限的页面维护供应商 API Key（便于运维集中管理）。
- 调用：只调用 FastAPI 的统一接口，不直接访问 LiteLLM。

**后端（管控层）**

- 鉴权：沿用现有 JWT + RBAC（对模型配置、调用、成本查看各自授权）。
- 策略：系统级可用模型、请求参数白名单与范围限制、速率限制、配额等。
- 参数合并：模型默认 → 用户偏好 → 请求参数（可控字段）→ 系统强制策略。
- 代理转发：对 LiteLLM Proxy 进行请求转发（含 SSE streaming、multipart image edit）。
- 审计：写入业务审计（调用人/模型/请求 id/结果/用量）。

**Proxy（转发层）**

- 统一 OpenAI-compatible 协议入口（chat/embeddings/images）。
- 按 FastAPI 选定的模型映射调用对应供应商（不做自动故障转移与预算控制）。
- 尽量“无状态”，减少需要维护的网关侧配置与概念。

---

## 4. 动态模型配置：FastAPI 作为唯一配置中心

本方案的工程原则是：**所有“配置与策略”只在 FastAPI 一处收敛**，LiteLLM Proxy 只作为执行层转发请求，尽可能减少引入 LiteLLM Proxy 带来的额外概念与维护面。

落地方式：

- FastAPI 维护一套 **模型目录（Model Catalog）**：
  - 逻辑模型名（展示名/alias）→ LiteLLM Proxy 的 `model`（对外保持稳定）
  - 能力描述：text/embedding/image、是否支持流式、最大 tokens、图像尺寸等
  - 默认参数：temperature/top_p/max_tokens 等
- FastAPI 维护 **供应商 API Key**（由前端受控页面配置），并将 Key 用于运行时调用。
- LiteLLM Proxy 仅维护最小 `model_list` 映射（从逻辑 model 到供应商模型），不启用 Virtual Key / budgets / fallback。

---

## 5. 安全假设（刻意弱化以降低复杂度）

### 5.1 约定与边界

- 允许在前端 Settings 页面配置与查看供应商 API Key（通过 RBAC 限制为管理员可见）。
- 允许 API Key 在数据库中以明文保存（以降低引入复杂度为目标）。
- 不引入 LiteLLM Virtual Key、预算、配额等网关侧隔离机制。

最低限度约束：

- 不在应用日志与审计日志中打印 API Key 明文。
- 前端页面不把 API Key 写入浏览器持久化存储（localStorage/sessionStorage），只作为表单字段展示与提交。
- Proxy 仅在容器内网暴露，不对公网直接开放。

### 5.2 密钥存储（按“低复杂度”实现）

- 建议字段直接命名为 `credentials`（jsonb），内部存 `{ api_key: "...", api_base: "...", ... }`。
- 明文存储会显著增加泄露风险，后续如需提升安全性，可在不改 API 的前提下把存储从明文切换到“单密钥对称加密”（只增加一个 `LLM_ENCRYPTION_KEY` 环境变量）。

---

## 6. 数据模型（建议新增，供实现时参考）

> 本节是“未来实施”所需的数据库设计草案。若进入实施阶段，需同步更新 `docs/数据库设计规范.md`。

### 6.1 表：llm_providers（供应商配置）

- `id` UUID PK
- `provider` varchar（openai/anthropic/vertex_ai/volcengine/…）
- `display_name` varchar
- `credentials` jsonb（明文，结构按 provider 区分，例如 `{api_key, api_base}`）
- `status` varchar（enabled/disabled）
- `created_at`, `updated_at`

### 6.2 表：llm_models（逻辑模型目录）

- `id` UUID PK
- `provider_id` UUID FK -> llm_providers.id
- `model_key` varchar unique（逻辑名/别名，例如 `text-pro`、`gemini-pro`、`doubao-seed-1.6`）
- `litellm_model` varchar（转发给 LiteLLM Proxy 的 model 名）
- `capabilities` jsonb（text/embedding/image，streaming，max_tokens，image_sizes…）
- `default_params` jsonb（temperature/top_p/max_tokens/…）
- `status` varchar（enabled/disabled）
- `created_at`, `updated_at`

### 6.3 表：user_model_preferences（用户偏好）

- `id` UUID PK
- `user_id` UUID FK
- `preferred_model_key` varchar（指向 llm_models.model_key）
- `params` jsonb（用户可控参数白名单）
- `updated_at`

### 6.4 表：llm_request_logs（调用索引表）

不依赖 LiteLLM 的成本追踪能力，FastAPI 侧落库用于按用户聚合用量与审计追溯。

- `id` UUID PK
- `request_id` varchar unique（同一链路贯穿 FE/BE/Proxy）
- `user_id`
- `model_key`, `provider`, `endpoint`（chat/embeddings/images）
- `status`（ok/error/timeout）
- `prompt_tokens`, `completion_tokens`, `cost`
- `created_at`

### 6.5 表：llm_user_usage_daily（用户用量聚合，可选）

- `id` UUID PK
- `user_id`
- `date` date
- `model_key`
- `prompt_tokens`, `completion_tokens`
- `request_count`
- unique(user_id, date, model_key)

---

## 7. API 设计（FastAPI 对前端与内部服务的统一接口）

### 7.1 配置面（Frontend -> FastAPI）

**模型目录**

- `GET /api/v1/llm/catalog`
  - 返回：当前用户可用模型列表 + 每个模型的能力描述 + 参数 schema

**用户偏好**

- `GET /api/v1/llm/preferences`
- `PUT /api/v1/llm/preferences`
  - 只允许写入白名单字段（例如 temperature/top_p/max_tokens/style 等）

**管理端（RBAC 保护）**

- `GET/POST/PUT /api/v1/llm/admin/providers`
- `GET/POST/PUT /api/v1/llm/admin/models`
- `PUT /api/v1/llm/admin/providers/{provider}/credentials`（写入真实 API Key）
- `GET /api/v1/llm/admin/costs`（按 user/model 聚合）

权限建议（可映射到现有 RBAC）：

- `llm.catalog.read`
- `llm.preferences.read` / `llm.preferences.write`
- `llm.providers.manage`
- `llm.models.manage`
- `llm.costs.read`

### 7.2 调用面（OpenAI Compatible：Frontend/Service -> FastAPI）

为避免与其它路由冲突，建议挂载在：

- `/api/v1/llm/openai/v1/...`

需要覆盖的 OpenAI 兼容端点（最小可用集合）：

- `POST /chat/completions`（文本对话，支持 stream）
- `POST /embeddings`
- `POST /images/generations`（文生图）
- `POST /images/edits`（图生图/指令编辑，multipart）

FastAPI 对这些端点的行为：

1. 解析用户身份（JWT）。
2. 校验：当前用户是否允许使用请求中的 `model`（逻辑 model_key）。
3. 参数合并（见第 8 章），并强制执行系统策略（限流/最大 tokens 等）。
4. 将请求改写为 LiteLLM Proxy 接受的 payload，并转发（不使用 Virtual Key）。
5. 把 Proxy 响应原样回传（尽量保持 OpenAI 兼容，包括 SSE）。
6. 写入调用日志（至少写 request_id、user_id、model_key、status、tokens）。

---

## 8. 参数合并与校验（“用户偏好 → 模型默认”）

### 8.1 合并顺序（建议）

最终参数来源建议按以下优先级叠加（后者覆盖前者）：

1. **模型默认（Model default_params）**
2. **用户偏好（user_model_preferences.params）**
3. **请求参数（OpenAI payload 中允许覆盖的字段）**
4. **系统强制策略（hard limits）**

### 8.2 参数白名单（建议）

白名单字段示例（文本）：

- `temperature`, `top_p`, `max_tokens`
- `presence_penalty`, `frequency_penalty`
- `seed`
- `stop`
- `response_format`（仅允许 json_schema/none 等有限集合）

白名单字段示例（图像）：

- `size`（限制在可用尺寸列表）
- `n`（限制数量）
- `quality`（限制枚举）

所有不在白名单中的字段：

- 默认丢弃；若为管理员/内部服务，可开启“严格模式”或“透传模式”（但需审计与告警）。

---

## 9. LiteLLM Proxy：最简转发模式

### 9.1 为什么选 LiteLLM Proxy

- OpenAI-compatible 网关，可统一 `/chat/completions`、`/embeddings`、`/images` 等端点。
- 可通过最小 `model_list` 接入多供应商，减少业务侧对接差异。

### 9.2 豆包/Volcengine 接入要点（文本/Embedding）

LiteLLM 已支持 Volcengine（火山引擎）模型前缀路由：`volcengine/<endpoint_or_model>`；并提供豆包 embedding 模型示例（如 `volcengine/doubao-embedding-text-240715`）。

> 这意味着：**豆包文本/embedding 可以直接纳入 Proxy 的 model_list**，成为“主流文本模型兼容”里的第一梯队。

### 9.3 图像模型兼容策略（Gemini 图像、豆包文生图/图生图）

现实约束：不同供应商的图像接口并不总是 OpenAI Images 兼容。

因此，本 spec 给出“可保证落地”的兼容策略：

**策略 S1（优先）：直接走 LiteLLM 原生 images 端点**

- 若 LiteLLM 对该供应商/模型提供 OpenAI images 兼容（`/images/generations` / `/images/edits`），直接纳入 model_list。

**策略 S2（兜底）：内部适配器（OpenAI Images Compatible Adapter）**

- 对于“非 OpenAI images 兼容”的供应商（常见于国内视觉服务），新增一个内部适配器服务：
  - 对外暴露 OpenAI images 接口
  - 内部把请求翻译成供应商 API
  - 返回 OpenAI 风格响应
- LiteLLM 将该适配器当作“openai-compatible provider”（自定义 api_base）进行路由。
- FastAPI 仍旧只调用 LiteLLM（保持三层架构不变）。

这样可以同时满足：

- “前端统一配置 Key + 后端统一代理”
- “兼容豆包文生图/图生图，以及 Gemini 图像（如需）”
- “尽量减少 Proxy 侧复杂能力与配置面”

---

## 10. 成本审计与可观测性

### 10.1 追踪维度（必须可聚合）

- user_id（通过 OpenAI payload 的 `user` 字段或 FastAPI 侧 request context）
- model_key / provider / endpoint（chat/embedding/image）
- request_id（链路追踪）
- tokens / cost（如果供应商返回 usage）

### 10.2 建议的链路字段

FastAPI 在转发给 LiteLLM 时附加：

- `user`: `${user_id}`
- `metadata`: `{ "request_id": "...", "project": "anyreason" }`
- `tags`: `["anyreason", "user:<id>", "model:<model_key>"]`

并在 FastAPI 的数据库中记录调用索引与用量，作为统一的成本审计数据源。

---

## 11. 部署建议（落到当前仓库的 Docker 结构）

### 11.1 LiteLLM 容器挂载位置

建议把 `litellm` service 加入 `docker/compose.app.yml`，与 `backend/frontend` 同 profile，做到：

- `docker compose -f docker-compose.yml -f compose.app.yml --profile app up -d` 一键启动包含 Proxy 的完整链路
- 容器互通通过 compose service 名即可（`http://litellm:4000`）

### 11.2 FastAPI 配置建议（新增环境变量）

- `LITELLM_BASE_URL=http://litellm:4000`
- `LLM_ENCRYPTION_KEY=...`（可选：未来把明文切换为对称加密时启用）

---

## 12. 风险清单与规避策略

1. **图像模型不兼容 OpenAI images 接口**
   - 规避：采用“内部适配器”作为兜底（第 9.3 节策略 S2）。
2. **参数透传导致越权或成本失控**
   - 规避：后端参数白名单 + 强制上限 + RBAC 控制“透传模式”。
3. **API Key 明文存储与前端可见带来的泄露风险**
   - 规避：仅管理员可见；数据库与备份最小化访问；前后端日志禁止输出 Key；必要时启用 `LLM_ENCRYPTION_KEY` 做低成本加密升级。

---

## 13. 下一步（等待你批准后再进入实施）

本 spec 被批准后，实施顺序建议：

1. 引入 LiteLLM Proxy 容器 + 最小模型列表（先文本后图像）。
2. FastAPI 新增 `/api/v1/llm/catalog` 与 OpenAI-compatible 代理路由（含 stream）。
3. 把前端 `/settings?tab=models` 从“本地 state/环境变量”迁移为“调用后端配置 API”。
4. 增加用户调用日志与 token 用量落库，并提供按用户/模型聚合查询接口。
5. 引入图像适配器（如豆包文生图/图生图、Gemini 图像能力确需时）。
