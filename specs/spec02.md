
在现有项目架构上增加构建一套基于 LiteLLM Gateway 的企业级 LLM 中台，实现模型动态配置、多租户虚拟 Key 鉴权及基于 HTTP 回调的用量统计。

### 1. 基础设施 (Infrastructure)

* **网关层** ：LiteLLM Gateway 已在 Docker 容器中运行，作为所有大模型的统一代理接入点。
* **通信协议** ：前端、后端与 LiteLLM 之间通过标准 HTTP API 及 Webhook 进行交互。

### 2. 动态模型配置 (Dynamic Configuration)

* **前端管理** ：提供可视化界面，支持管理上游模型（Upstream Models）。配置参数包括 `endpoint`、`api_key`、`model_name` 等。
* **实时同步** ：当前端更新配置时，触发后端调用 LiteLLM 的 `/model/new` 或更新配置接口，实现 Gateway 上游模型的 **实时热更新** ，无需重启容器。

### 3. 鉴权与隔离逻辑 (Auth & Isolation)

* **虚拟 Key 签发** ：后端业务系统接入 LiteLLM 的数据库（或调用 `/key/generate` API），为每个业务用户签发唯一的 **虚拟 Key (Virtual Key)** 。
* **统一入口** ：前端仅暴露一个统一的聊天/调用入口，用户请求时携带虚拟 Key。
* **路由分发** ：用户通过虚拟 Key 调用 LiteLLM，LiteLLM 根据 Key 的权限范围展示和路由至允许使用的上游模型。

### 4. 用量统计与回调 (Usage Tracking & Webhooks)

* **实时监控** ：利用 LiteLLM 的 `logging` 机制或 `success_callback`。
* **HTTP 回调** ：LiteLLM 在每次请求结束后，通过 **HTTP 回调 (Webhook)** 将 `usage`（token 消耗、时长等）和 `metadata`（关联的虚拟 Key、用户 ID）异步推送到后端指定接口。
* **数据入库** ：后端接收回调数据，实现精细化的用户用量统计与账单分析。
