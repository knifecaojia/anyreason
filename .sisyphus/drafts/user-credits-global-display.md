# Draft: Global User Credits Display

## Requirements (confirmed)
- 全局展示用户积分余额。
- 执行涉及 AI 的操作时，都要标明本次调用的积分消耗。
- 全程记录用户的积分消费记录，以便后续追溯。
- AI 操作覆盖范围确认：所有会消耗资源的 AI 操作。
- 积分消费记录可见范围确认：用户和管理员都能看。

## Technical Decisions
- 积分记录可见范围已定：用户可查看自己的流水，管理员可查看所有用户流水与调整记录。
- AI 操作覆盖范围已定：所有资源消耗类操作都必须展示本次积分消耗。

## Research Findings
- 现有前端已有 credits API action：`creditsMy()`、`creditsMyTransactions()`。
- 现有主布局 `AppLayout` 未接入余额展示。
- 现有 `CreditCostPreview` 可展示“消耗积分 + 余额”，但未形成全局落地。
- 管理后台已有积分管理与调整弹窗。
- 后端已有 `GET /api/v1/credits/my`、`GET /api/v1/credits/my/transactions`。
- 后端已有 `POST /api/v1/ai/cost-estimate` 用于事前预估，返回 `estimated_cost`、`user_balance`、`sufficient`。
- 后端 AI 扣费点已存在于 `ai_gateway.service` 与 `agent_service`，覆盖文本、流式文本、图片/视频、异步媒体、Agent 调用。
- 扣费流水已有 `credit_transactions` 表，字段包含：`user_id`、`delta`、`balance_after`、`reason`、`actor_user_id`、`meta`、`created_at`。
- 另有 `ai_usage_events` 记录 AI 使用事件，字段包含：`category`、`binding_key`、`ai_model_config_id`、`cost_credits`、`latency_ms`、`error_code`、`raw_payload`。
- 测试基础设施存在：前端 Jest + Playwright，后端 pytest；后端 credits/auth/audit 覆盖较成熟，前端 credits UI 覆盖薄弱。

## Open Questions
- 消费记录需要给谁看？
- 需要覆盖哪些 AI 操作？
- 积分扣减失败时前端应如何表现？
- 是否需要用户可见的“积分流水页/抽屉”，还是仅全局余额 + 操作内明细即可？

## Scope Boundaries
- INCLUDE: 全局余额展示、AI 调用成本标注、积分消费追溯。
- EXCLUDE: 暂未确定是否包含充值/兑换/退款等扩展能力。
