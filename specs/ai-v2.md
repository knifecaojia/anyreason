**漫剧平台智能创作引擎需求规格说明书（PRD）**
 **版本** ：v3.0（Agent 平台化版本）
 **目标读者** ：技术团队、架构师、产品经理
 **核心变更** ：引入 Agent 与应用市场架构，支持内置专家 Agent 提示词版本管理 + 用户自定义 Agent 组合

---

## 1. 项目概述与目标

### 1.1 背景

现有漫剧剧本创作平台需升级为 **Agent 即服务（AaaS）** 架构，不仅提供固定的剧本处理能力，更要成为可扩展的 **智能创作操作系统** 。平台内置专业创作 Agent（分集、角色、分镜等专家），同时允许用户基于这些能力构建 **自定义应用** 。

### 1.2 核心目标

* 构建 **内置专家 Agent 库** （7大专家）：提示词支持多版本管理、A/B 测试、热更新
* 定义 **标准场景（Scene）** ：普通对话、剧本分集、资产提取、场景创建等（系统级，不可删除）
* 支持 **用户自定义应用（App）** ：通过组合内置 Agent + 用户自定义 Agent，构建个性化工作流
* 保持技术栈：PydanticAI + FastAPI + Celery + PostgreSQL

---

## 2. 核心概念定义

### 2.1 内置专家 Agent（Built-in Experts）

系统预置的 7 个专业 Agent， **属于平台资产** ，所有租户共享但可个性化配置提示词：

**表格**复制

| Agent ID              | 角色     | 职责                                 | 默认模型          |
| :-------------------- | :------- | :----------------------------------- | :---------------- |
| `script_expert`     | 剧本专家 | 整体剧本结构分析、风格诊断、逻辑检查 | GPT-4o            |
| `episode_expert`    | 分集专家 | 剧本分集、场次划分、节奏控制         | GPT-4o            |
| `prop_expert`       | 道具专家 | 提取道具清单、道具与剧情关联分析     | GPT-4o-mini       |
| `character_expert`  | 角色专家 | 角色提取、人物关系图谱、角色弧光分析 | Claude-3.5-Sonnet |
| `scene_expert`      | 场景专家 | 场景描述优化、空间布局、氛围设计     | GPT-4o            |
| `vfx_expert`        | 特效专家 | 特效需求识别、特效与分镜匹配         | GPT-4o-mini       |
| `storyboard_expert` | 分镜专家 | 分镜脚本生成、镜头语言设计           | Claude-3.5-Sonnet |

 **提示词版本管理** ：

* 每个内置 Agent 支持 **多版本提示词** （v1, v2, v3...）
* 版本属性：创建时间、创建人、变更说明、是否默认版本
* **热切换** ：可在运行时切换版本，无需重启服务
* **A/B 测试** ：支持按用户群分配不同提示词版本

### 2.2 标准场景（Scene）

系统预置的 **原子能力单元** ，对应 PydanticAI 的 Agent 运行时配置， **不可删除、不可修改核心逻辑** ：

**表格**复制

| Scene ID           | 类型 | 说明                              | 绑定内置 Agent        |
| :----------------- | :--- | :-------------------------------- | :-------------------- |
| `chat`           | 对话 | 普通自由对话，使用 Director Agent | `script_expert`     |
| `script_split`   | 处理 | 剧本分集处理                      | `episode_expert`    |
| `asset_extract`  | 处理 | 资产提取（角色+道具+场景+特效）   | 组合多个 Expert       |
| `scene_create`   | 处理 | 基于文本创建可视化场景描述        | `scene_expert`      |
| `storyboard_gen` | 处理 | 分镜生成                          | `storyboard_expert` |

 **Scene 的特性** ：

* 封装了特定的 System Prompt 模板、Tools 集合、输出 Schema
* 用户 **只能配置参数** （如 temperature、max_tokens），不能修改 Scene 的核心逻辑
* Scene 是**构建自定义应用的基础积木**

### 2.3 用户自定义应用（App）

用户（创作者/团队）通过**组合 Scene + 自定义 Agent** 创建的个性化工作流：

 **App 的组成** ：

* **触发方式** ：对话框 / 文件上传 / 定时任务
* **Agent 链** ：顺序调用多个内置 Agent 或自定义 Agent
* **条件分支** ：根据中间结果决定下一步（如"如果角色数>10则简化"）
* **输出模板** ：自定义最终输出格式

 **示例用户 App** ：

* "快速角色设定器"：上传图片 → Character Expert 提取特征 → 用户自定义 Agent 生成人设卡 → 保存到角色库
* "自动分镜流水线"：剧本 → Episode Expert 分集 → Storyboard Expert 生成分镜 → VFX Expert 标记特效 → 批量导出

---

## 3. 系统架构设计

### 3.1 三层架构

**plain**复制

```plain
┌─────────────────────────────────────────────────────────────┐
│                      用户层 (Next.js)                        │
│  App Builder UI │ Agent Prompt Editor │ Chat Interface       │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   应用编排层 (FastAPI)                       │
│  App Orchestrator │ Scene Router │ Agent Version Manager    │
│  - 加载用户 App 配置                                           │
│  - 管理内置 Agent 版本切换                                      │
│  - 执行条件逻辑                                               │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                   引擎层 (PydanticAI)                        │
│  Built-in Agents │ Custom Agents │ Tools Registry            │
│  - 7大专家 Agent 实例                                          │
│  - 用户自定义 Agent 动态加载                                     │
│  - Tools 统一注册中心                                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 关键服务模块

**Agent Registry Service（Agent 注册中心）**

* 维护内置 Agent 的元数据（ID、描述、可用版本列表）
* 管理用户自定义 Agent 的生命周期（CRUD）
* **版本控制** ：提示词版本存储为 JSON，支持 diff 对比和回滚

**Scene Engine（场景引擎）**

* 封装标准场景的执行逻辑
* 将 Scene 配置转换为 PydanticAI Agent 实例
* 管理 Scene 与内置 Agent 的映射关系

**App Runtime（应用运行时）**

* 解析用户 App 的定义（Agent 链、条件分支）
* 协调多个 Agent 的顺序/并行执行
* 维护跨 Agent 的状态共享（通过 State 对象）

---

## 4. 数据模型设计

### 4.1 内置 Agent 配置表（系统级）

**sql**复制

```sql
-- builtin_agents
id: string (PK)  -- 如 "character_expert"
name: string
description: text
category: enum   -- script, episode, asset, scene, vfx, storyboard
default_model: string  -- "openai:gpt-4o"
tools: string[]  -- 关联的 tools ID 列表
created_at: timestamp

-- builtin_agent_prompt_versions
id: string (PK)
agent_id: string (FK)
version: int     -- 版本号，自增
system_prompt: text
description: string -- 版本变更说明
is_default: boolean
created_by: string -- admin 用户 ID
created_at: timestamp
metadata: json    -- temperature, max_tokens 等默认参数
```

### 4.2 标准场景表（系统级，只读）

**sql**复制

```sql
-- scenes
id: string (PK)   -- "asset_extract", "chat"
name: string
type: enum        -- chat, process, analysis
description: text
builtin_agent_id: string (FK)  -- 默认绑定的内置 Agent
required_tools: string[]
input_schema: json   -- Pydantic Schema，输入验证
output_schema: json  -- Pydantic Schema，输出验证
ui_config: json      -- 前端组件配置（如是否需要上传按钮）
```

### 4.3 用户自定义 Agent 表（租户级）

**sql**复制

```sql
-- user_agents
id: string (PK)
user_id: string (FK)
org_id: string     -- 团队/组织 ID（支持团队共享）
name: string
description: text
base_agent_id: string?  -- 继承自哪个内置 Agent（可选）
system_prompt: text
model: string
temperature: float
tools: string[]    -- 用户选择的 Tools
is_public: boolean -- 是否分享给团队
created_at: timestamp
```

### 4.4 用户自定义应用表（租户级）

**sql**复制

```sql
-- user_apps
id: string (PK)
user_id: string (FK)
org_id: string
name: string
description: text
icon: string

-- App 流程定义（DAG）
flow_definition: json /* 
{
  "nodes": [
    {"id": "step1", "type": "scene", "scene_id": "script_split"},
    {"id": "step2", "type": "agent", "agent_id": "custom_001"},
    {"id": "step3", "type": "condition", "condition": "input.role_count > 5"}
  ],
  "edges": [
    {"from": "step1", "to": "step2"},
    {"from": "step2", "to": "step3", "condition": "success"}
  ]
}
*/

trigger_type: enum  -- manual, file_upload, webhook, scheduled
input_template: json   -- 用户输入表单配置
output_template: json  -- 输出格式化配置
is_active: boolean
created_at: timestamp
```

---

## 5. 功能需求详述

### 5.1 内置专家 Agent 管理（管理员功能）

 **提示词版本管理** ：

* 管理员可在后台查看 7 大内置 Agent 的提示词编辑界面
* 支持 **版本对比** （Diff 视图，高亮显示变更内容）
* 支持 **灰度发布** ：选择 10% 用户使用新版本提示词，观察效果后再全量发布
* 支持 **紧急回滚** ：一键切换回上一稳定版本

 **版本切换 API** ：

**Python**复制

```python
# 运行时动态切换版本（影响新会话，不影响进行中的会话）
POST /admin/agents/{agent_id}/versions/{version_id}/activate

# 为特定用户强制指定版本（用于 A/B 测试）
POST /admin/agents/{agent_id}/override-user-version
Body: {user_id: "u123", version: 3}
```

### 5.2 标准场景（Scene）封装

 **Scene 的不可变性** ：

* Scene 的核心逻辑（Tools 绑定、输出 Schema）在代码中硬编码，**数据库仅存储配置元数据**
* 用户在前端看到的 Scene 是"只读模板"，只能配置参数（如 temperature），不能修改 Tools 列表

 **Scene 扩展机制** ：

* 系统升级时可新增 Scene，但已有 Scene ID 永不被删除（保证用户 App 兼容性）
* 若 Scene 需要升级，通过**版本号**管理（如 `asset_extract_v2`），旧版保留但标记为 deprecated

### 5.3 用户自定义 Agent 创建

 **创建流程** ：

1. 选择 **基础模板** （从 7 大内置 Agent 继承，或从零创建）
2. 编辑 System Prompt（富文本编辑器，支持变量插值如 `{{project_name}}`）
3. 选择模型（受用户层级限制：免费用户只能用 GPT-4o-mini）
4. 绑定 Tools（从 Tools 市场选择，只能选用户有权限的）
5. 测试与发布（提供 Playground 即时测试）

 **继承机制** ：

* 若基于内置 Agent 创建，当内置 Agent 更新版本时，用户可选择**同步更新**或**保持独立**

### 5.4 用户自定义应用（App）编排

 **可视化编排器** （前端）：

* **节点类型** ：
* Scene 节点（黄色）：选择系统预置场景
* Agent 节点（蓝色）：选择内置或自定义 Agent
* 条件节点（菱形）：编写 Python-like 条件表达式（如 `len(assets) > 10`）
* 工具节点（绿色）：直接调用某个 Tool
* 输入/输出节点（圆形）：定义 App 的输入表单和输出格式
* **连线规则** ：
* Scene → Agent ✓
* Agent → Agent ✓
* Agent → Condition → [Agent A | Agent B]（分支）
* 禁止循环（DAG 无环图）

 **App 执行** ：

* 用户触发 App 后，系统按 DAG 顺序执行
* 每个节点的输出自动作为下一个节点的输入（通过 State 传递）
* 支持 **断点调试** ：用户可单步执行，查看每个节点的中间结果

---

## 6. 运行时行为定义

### 6.1 Agent 加载策略

 **内置 Agent 实例化** ：

**Python**复制

```python
# 根据版本配置动态创建 PydanticAI Agent
def get_builtin_agent(agent_id: str, version: int = None, user_tier: str = "free"):
    config = builtin_agent_registry.get(agent_id)
  
    # 确定版本
    if version is None:
        version = config.get_default_version()
  
    prompt_version = config.get_version(version)
  
    # 根据用户层级选择模型（企业用户可用 Claude，免费用户用 GPT-4o-mini）
    model = get_model_for_tier(user_tier, prompt_version.default_model)
  
    return Agent(
        model=model,
        system_prompt=prompt_version.system_prompt,
        tools=load_tools(config.tools),
        retries=2
    )
```

 **用户自定义 Agent 实例化** ：

**Python**复制

```python
def get_user_agent(agent_id: str, user_id: str):
    custom_config = db.user_agents.find_one(id=agent_id, user_id=user_id)
  
    if custom_config.base_agent_id:
        # 继承模式：先加载基础 Agent，再覆盖提示词
        base_agent = get_builtin_agent(custom_config.base_agent_id)
        # 合并 Tools（基础 + 用户新增）
        tools = base_agent.tools + load_tools(custom_config.tools)
    else:
        tools = load_tools(custom_config.tools)
  
    return Agent(
        model=custom_config.model,
        system_prompt=custom_config.system_prompt,
        tools=tools
    )
```

### 6.2 Scene 执行流程

当用户调用某个 Scene（如"剧本分集"）：

1. **路由** ：根据 `scene_id` 找到对应的 Scene 配置
2. **鉴权** ：检查用户是否有权限使用该 Scene（某些高级 Scene 可能仅限 Pro 用户）
3. **参数合并** ：Scene 默认参数 + 用户传入参数（如 temperature）
4. **Agent 获取** ：根据 Scene 绑定的 `builtin_agent_id` 获取对应版本的 Agent
5. **执行** ：调用 PydanticAI Agent，流式返回结果
6. **后处理** ：按 Scene 定义的 `output_schema` 校验并格式化输出

### 6.3 用户 App 执行流程

**Python**复制

```python
async def execute_user_app(app_id: str, input_data: dict, user_context: dict):
    app = db.user_apps.find_one(id=app_id)
    flow = app.flow_definition  # DAG
  
    # 初始化状态
    state = {"input": input_data, "user": user_context, "intermediate": {}}
  
    # 拓扑排序执行节点
    for node in topological_sort(flow.nodes):
        if node.type == "scene":
            agent = get_builtin_agent(node.scene_id)
            result = await agent.run(input_data, deps=state)
          
        elif node.type == "agent":
            agent = get_user_agent(node.agent_id, user_context.user_id)
            result = await agent.run(input_data, deps=state)
          
        elif node.type == "condition":
            # 评估条件，决定走哪个分支
            if evaluate_condition(node.condition, state):
                continue_to = node.true_branch
            else:
                continue_to = node.false_branch
            continue
          
        # 保存结果到 State，供下游使用
        state["intermediate"][node.id] = result.data
      
        # 发布进度事件（通过 Redis Pub/Sub 推送到前端）
        await publish_progress(app_id, node.id, "completed")
  
    # 格式化最终输出
    return format_output(state, app.output_template)
```

---

## 7. 权限与安全

### 7.1 权限矩阵

**表格**复制

| 功能                  | 系统管理员 | 团队管理员 | 普通用户     |
| :-------------------- | :--------- | :--------- | :----------- |
| 修改内置 Agent 提示词 | ✅         | ❌         | ❌           |
| 切换内置 Agent 版本   | ✅         | ❌         | ❌           |
| 创建自定义 Agent      | ✅         | ✅         | ✅（限数量） |
| 分享 Agent 给团队     | ✅         | ✅         | ❌           |
| 创建自定义 App        | ✅         | ✅         | ✅           |
| 使用所有 Scene        | ✅         | ✅         | 部分受限     |

### 7.2 隔离机制

* **内置 Agent 版本** ：全局生效，但用户可在其 App 中 **固定使用某个版本** （避免被系统升级影响）
* **用户自定义 Agent** ：默认私有，可选择分享给团队（同 org_id）或公开到市场（需审核）
* **资源限制** ：免费用户最多创建 3 个自定义 Agent 和 2 个自定义 App

---

## 8. 验收标准（新增）

 **Agent 平台功能** ：

* [ ] 管理员可修改 7 大内置 Agent 的提示词，并保存为新版本
* [ ] 支持提示词版本对比（Diff 视图）和一键回滚
* [ ] 用户可基于内置 Agent 创建自定义 Agent，继承 Tools 并修改提示词
* [ ] 用户可通过拖拽方式组合 Scene 和 Agent，创建自定义 App
* [ ] 用户 App 支持条件分支和断点调试
* [ ] 系统升级内置 Agent 后，用户旧版 App 仍可正常运行（向后兼容）

 **性能与稳定性** ：

* [ ] 切换内置 Agent 版本无需重启服务（热更新）
* [ ] 同时运行 100 个不同的用户自定义 App 不相互干扰
* [ ] 用户 App 执行失败时，精确显示失败发生在哪个节点

---

## 9. 技术实现提示

 **PydanticAI 动态 Agent 创建** ：

* 使用 `Agent` 类的动态实例化，而非全局定义
* 提示词通过字符串模板渲染（支持 Jinja2 语法插入变量）

 **数据库设计建议** ：

* 提示词版本表使用 `JSONB` 类型存储完整的 Agent 配置快照
* 用户 App 的 `flow_definition` 使用 JSON 存储 DAG，考虑使用 PostgreSQL 的 JSON 索引优化查询

 **缓存策略** ：

* 内置 Agent 的配置可缓存于 Redis（版本号作为缓存 Key）
* 用户自定义 Agent 修改后，使相关缓存失效

 **向后兼容** ：

* Scene ID 使用 `scene_` 前缀，内置 Agent ID 使用 `builtin_` 前缀，用户 Agent ID 使用 `user_` 前缀，避免命名冲突
* 删除内置 Agent 的某版本时，检查是否有用户 App 固定使用该版本，若有则禁止删除或强制迁移
