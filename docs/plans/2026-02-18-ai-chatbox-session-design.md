# AI 助手 Chatbox 会话系统设计

## 概述

将 AI 助手 Chatbox 升级为支持会话历史管理的对话系统，类似 ChatGPT/Kimi/豆包的交互体验。

## 设计决策

| 决策项 | 选择 |
|--------|------|
| 布局 | 移除中间菜单，对话区占满，右侧会话列表 |
| Plans 展示 | 摘要嵌入对话流，点击展开完整卡片和操作 |
| Trace 展示 | 折叠显示，默认隐藏，点击展开 |
| 右侧面板 | 改为会话列表 |
| Session 概念 | 引入，支持历史会话恢复和继续对话 |
| 会话标题 | 任务类型 + 时间 + 前20字符 |
| API 策略 | 新增会话 API，保留现有 API，渐进迁移 |

## 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│ AI 助手                                           [?] [会话列表] │ ← 移除中间菜单
├─────────────────────────────────────┬───────────────────────────┤
│                                     │ 📋 会话列表               │
│   对话区                            │ ┌─────────────────────┐   │
│   ┌─────────────────────────────┐   │ │ ▶ 剧本角色提取     │   │ ← 当前会话高亮
│   │ 用户: 提取角色场景          │   │ │   2026-02-18 09:18 │   │
│   └─────────────────────────────┘   │ └─────────────────────┘   │
│   ┌─────────────────────────────┐   │ ┌─────────────────────┐   │
│   │ AI: 已提取以下资产：        │   │ │   场景分析讨论     │   │
│   │ 🎭 角色：3 个  📍 场景：2 个│   │ │   2026-02-17 15:30 │   │
│   │ [展开详情] [执行落库]       │   │ └─────────────────────┘   │
│   └─────────────────────────────┘   │ ┌─────────────────────┐   │
│   ┌─────────────────────────────┐   │ │   + 新建会话        │   │
│   │ ▼ Trace (点击展开)          │   │ └─────────────────────┘   │
│   │   tool_call: extract_chars  │   │                           │
│   │   tool_done: ...            │   │                           │
│   └─────────────────────────────┘   │                           │
│                                     │                           │
├─────────────────────────────────────┴───────────────────────────┤
│ [场景选择 ▼]  [输入框...]                    [发送] [停止]      │
└─────────────────────────────────────────────────────────────────┘
```

## 数据模型

### ai_chat_session 表

```python
class AIChatSession:
    id: UUID                    # 主键
    user_id: UUID               # 用户
    project_id: UUID | None     # 关联项目（可选）
    title: str                  # 会话标题（自动生成或用户编辑）
    scene_code: str             # 使用的场景类型
    created_at: datetime
    updated_at: datetime
```

### ai_chat_message 表

```python
class AIChatMessage:
    id: UUID                    # 主键
    session_id: UUID            # 所属会话
    role: str                   # "user" | "assistant"
    content: str                # 文本内容
    plans: JSON | None          # Plans 数据（仅 assistant）
    trace: JSON | None          # Trace 事件（仅 assistant）
    created_at: datetime
```

### 会话标题生成规则

格式：`{任务类型} - {时间} - {首条消息前20字符}`

示例：
- `角色提取 - 02/18 09:18 - 提取角色场景`
- `场景分析 - 02/17 15:30 - 分析第一场戏的`

## 前端消息结构

```typescript
interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;              // 文本内容

  // assistant 消息的扩展数据
  plans?: PlanData[];           // Plans 结果
  trace?: TraceEvent[];         // Trace 事件

  // UI 状态
  plansExpanded?: boolean;      // Plans 折叠状态
  traceExpanded?: boolean;      // Trace 折叠状态
}

interface PlanData {
  id: string;
  kind: string;                 // "asset_create" | "episode_save" | ...
  tool_id: string;
  inputs: any;
  preview?: {
    raw_output_text?: string;
    summary?: string;           // 摘要文本
  };
}
```

## API 设计

### 新增端点

```
# 会话管理
GET    /api/ai/chat/sessions              # 获取会话列表（支持分页）
POST   /api/ai/chat/sessions              # 创建新会话
GET    /api/ai/chat/sessions/:id          # 获取会话详情（含所有消息）
PATCH  /api/ai/chat/sessions/:id          # 更新会话（标题等）
DELETE /api/ai/chat/sessions/:id          # 删除会话

# 消息操作
POST   /api/ai/chat/sessions/:id/messages # 发送消息（返回流式响应）
```

### 流式响应格式

```
POST /api/ai/chat/sessions/:id/messages
Request:  { content: "提取角色场景", scene_code: "asset_extract" }
Response: SSE 流
  - data: {"type":"start", "session_id": "..."}
  - data: {"type":"delta", "delta": "我已分析..."}
  - data: {"type":"tool_event", "event": {...}}     ← 工具事件
  - data: {"type":"plans", "plans": [...]}
  - data: {"type":"done", "message_id": "..."}      ← 消息ID
```

## 兼容性策略

### 保留现有 API

| API | 用途 | 状态 |
|-----|------|------|
| `/api/v1/ai/admin/scene-test/chat` | 场景测试页面 | 保留 |
| `/api/ai/scenes/:scene/chat/stream` | 无会话对话 | 保留 |

### 渐进迁移

| 阶段 | 内容 |
|------|------|
| 阶段 1 | 新增会话 API，保持现有 API 不变 |
| 阶段 2 | Chatbox 支持两种模式（URL 参数 ?sessionId=xxx 切换） |
| 阶段 3 | 默认启用会话模式，历史对话可通过会话列表恢复 |

## 实施阶段

### 阶段 1：数据层

- 新增 `ai_chat_session` 表
- 新增 `ai_chat_message` 表
- Alembic 迁移脚本

### 阶段 2：API 层

- 新增 `api/v1/ai_chat_sessions.py`
- 实现会话 CRUD
- 实现消息流式 API

### 阶段 3：前端-会话列表

- 新增 `ChatSessionList.tsx` 组件
- 支持会话切换、新建、删除

### 阶段 4：前端-消息改造

- 消息支持 plans 折叠卡片
- 消息支持 trace 折叠展示
- 资产选择和执行操作

### 阶段 5：前端-布局调整

- 移除中间菜单（概览/剧集/资产）
- 移除原右侧 Plans/Trace 面板
- 新增右侧会话列表

## Plans 折叠卡片设计

### 收起状态

```
┌─────────────────────────────────────────────────────────┐
│ 📦 已提取资产：角色 3 个，场景 2 个        [展开详情]  │
└─────────────────────────────────────────────────────────┘
```

### 展开状态

```
┌─────────────────────────────────────────────────────────┐
│ 📦 已提取资产：角色 3 个，场景 2 个        [收起]      │
├─────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────┐   │
│ │ ☑ @古荒_常态  CHAR001  置信度 0.9               │   │
│ │    黑色长发 | 冷酷自信 | 黑色锦袍金纹           │   │
│ └───────────────────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────┐   │
│ │ ☑ @古九_常态  CHAR002  置信度 0.8               │   │
│ │    棕色短发 | 忠诚机敏 | 灰色侍从服             │   │
│ └───────────────────────────────────────────────────┘   │
│                                                         │
│ [全选] [取消全选] [推荐去重]     [执行所选 (2)]        │
└─────────────────────────────────────────────────────────┘
```

## Trace 折叠区设计

```
┌─────────────────────────────────────────────────────────┐
│ ▼ Trace (3 事件)                                        │
│   09:18:01  tool_call_start  preview_extract_characters │
│   09:18:42  tool_agent_run_done  character_expert       │
│   09:18:53  tool_call_done    输出 4 个资产             │
└─────────────────────────────────────────────────────────┘
```

## 文件清单

### 后端新增

- `app/models.py` - 新增 AIChatSession, AIChatMessage 模型
- `app/api/v1/ai_chat_sessions.py` - 会话 API 路由
- `app/schemas_ai_chat.py` - Pydantic schemas
- `app/services/ai_chat_session_service.py` - 业务逻辑
- `alembic_migrations/versions/xxx_add_ai_chat_session.py` - 迁移

### 前端新增

- `components/ai-chat/ChatSessionList.tsx` - 会话列表组件
- `components/ai-chat/ChatMessageWithPlans.tsx` - 带 Plans 的消息组件
- `components/ai-chat/TraceCollapse.tsx` - Trace 折叠组件
- `components/ai-chat/PlansCard.tsx` - Plans 卡片组件
- `app/api/ai/chat/sessions/route.ts` - 会话 API 代理

### 前端修改

- `components/scripts/ScriptAIAssistantChatboxPane.tsx` - 主组件重构
