
# 漫剧工业化生产架构方案 (Manju Architecture v3.0)

## 1. 核心设计变更点

基于你提供的 7 个 Schema 文件，我们在架构层面做出了以下关键调整：

1. **资产中心化 (Asset Registry):** 新增 `assets` 表，严格对应 `assets.schema.json`，将角色、道具、特效标准化。
2. **ID 策略双轨制:** 数据库内部使用 **UUID** 确保引用完整性，同时维护符合 Schema 正则（如 `EP001_SC01`）的  **业务编码 (Business Code)** ，用于导出和人类阅读。
3. **L5 层级进化:** 原“关键帧 (Keyframe)”层级正式根据 `video_prompts.schema.json` 升级为 **“视频提示词 (VideoPrompt)”** 层级，直接对接生成端。
4. **环境分层结构化:** `Scene` 表引入 `z_depth` 字段，响应竖屏叙事的前中后景需求。

---

## 2. 数据库详细设计 (PostgreSQL DDL)

请使用以下 SQL 重构数据库。这套结构完美兼容你提供的 JSON Schema。

### 2.1 基础资产库 (`assets`)

对应 `assets.schema.json`。这是所有生成的源头。

**SQL**

```
CREATE TYPE asset_type_enum AS ENUM ('character', 'scene', 'prop', 'vfx');

CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
    -- 业务 ID (Schema 要求: ^CHAR_[0-9]{3}$, ^SCENE_... 等)
    asset_id VARCHAR(50) NOT NULL, 
  
    -- 核心属性
    name VARCHAR(100) NOT NULL,
    type asset_type_enum NOT NULL,
    category VARCHAR(50), -- 主角/配角/武器/UI...
  
    -- 视觉特征 (对应 Schema 中的 hair, eyes, clothing, z_depth 等)
    -- 使用 JSONB 存储，因为不同类型的资产结构差异巨大
    visual_features JSONB DEFAULT '{}', 
  
    -- 统计与状态
    appearances INT DEFAULT 0,
    first_appearance_ref VARCHAR(50), -- 首次出现的集/场
  
    -- AI 生产专用
    prompt_template TEXT, -- 基础 Prompt 模板
  
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, asset_id)
);

CREATE INDEX idx_assets_type ON assets(project_id, type);
```

### 2.2 剧集表 (`episodes`)

对应 `episodes.schema.json`。增加了源码映射能力。

**SQL**

```
CREATE TABLE episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
    -- 业务 ID (Schema: ^EP[0-9]{3}$)
    episode_code VARCHAR(20) NOT NULL, 
    episode_number INT NOT NULL,
  
    title VARCHAR(255),
    summary TEXT,
  
    -- 统计与源码映射 (Schema 新增需求)
    word_count INT DEFAULT 0,
    start_line INT, -- 对应原文起始行
    end_line INT,   -- 对应原文结束行
  
    -- 状态机 (Schema: pending, parsing, parsed, error)
    status VARCHAR(20) DEFAULT 'pending',
  
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, episode_code)
);
```

### 2.3 分场表 (`scenes`)

对应 `scenes.schema.json`。**重点关注 `z_depth` 的实现。**

**SQL**

```
CREATE TABLE scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    episode_id UUID REFERENCES episodes(id) ON DELETE CASCADE,
  
    -- 业务 ID (Schema: ^EP[0-9]{3}_SC[0-9]{2}$)
    scene_code VARCHAR(50) NOT NULL, 
    scene_number INT NOT NULL,
  
    title VARCHAR(255),
  
    -- 空间与时间
    location VARCHAR(100),
    location_type VARCHAR(10) CHECK (location_type IN ('内', '外', '内外')),
    time_of_day VARCHAR(50), -- 日/夜
    weather VARCHAR(50),
    mood VARCHAR(50),        -- 情绪基调
  
    -- 竖屏叙事核心 (Schema: z_depth)
    -- 存: { "foreground": ["铁丝网"], "midground": ["废墟"], "background": ["天空"] }
    z_depth JSONB DEFAULT '{}', 
  
    -- 文本内容
    content TEXT, -- 场景完整原文
    key_events JSONB, -- 关键事件列表 ["A遇见B", "发生爆炸"]
  
    -- 源码映射
    content_start_pos INT,
    content_end_pos INT,
  
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(episode_id, scene_code)
);
```

### 2.4 分镜表 (`shots`)

对应 `shots.schema.json`。嵌入导演与运镜逻辑。

**SQL**

```
CREATE TABLE shots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE,
  
    -- 业务 ID (Schema: ^EP..._SC..._SH[0-9]{2}$)
    shot_code VARCHAR(50) NOT NULL,
    shot_number INT NOT NULL,
  
    -- 视听语言 (Strict Enum per Schema)
    shot_type VARCHAR(20), -- 大远景, 特写...
    camera_angle VARCHAR(20), -- 平视, 仰视...
    camera_move VARCHAR(50),  -- 推, 拉, 摇...
    filter_style VARCHAR(50), -- 滤镜
  
    -- 叙事功能 (Schema: narrative_function)
    narrative_function VARCHAR(20), -- 建立, 发展, 高潮...
    pov_character VARCHAR(100),     -- 视点人物
  
    -- 内容
    description TEXT,
    dialogue TEXT,
    dialogue_speaker VARCHAR(100),
    sound_effect VARCHAR(100),
  
    -- 关联资产 (Schema: characters, assets)
    -- 存储 Asset ID 的数组，如 ["CHAR_001", "PROP_002"]
    active_assets JSONB DEFAULT '[]',
  
    duration_estimate NUMERIC(5,2), -- 秒
  
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(scene_id, shot_code)
);
```

### 2.5 视频提示词表 (`video_prompts`)

对应 `video_prompts.schema.json`。这是 L5 执行层。

**SQL**

```
CREATE TABLE video_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shot_id UUID REFERENCES shots(id) ON DELETE CASCADE,
  
    -- 生成参数
    prompt_main TEXT,       -- 中文方括号格式
    negative_prompt TEXT,
    style_model VARCHAR(50), -- anime, realistic...
    aspect_ratio VARCHAR(10), -- 9:16 (竖屏默认)
  
    -- 细粒度控制 (Schema: character_prompts)
    -- 存: [{"character": "A", "action": "run", "expression": "scared"}]
    character_prompts JSONB DEFAULT '[]',
  
    -- 摄像机参数 (Schema: camera_settings)
    camera_settings JSONB DEFAULT '{}',
  
    -- 生产状态
    duration NUMERIC(5,2),
    generation_notes TEXT,
  
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.6 质检报告表 (`qc_reports`)

对应 `qc.schema.json`。用于存储每次跑批的检查结果。

**SQL**

```
CREATE TABLE qc_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
    check_time TIMESTAMP DEFAULT NOW(),
    iteration INT, -- 第几次迭代
  
    -- 概览
    status VARCHAR(20), -- passed, failed, needs_fix
    total_issues INT,
    critical_issues INT,
  
    -- 详细报告 (Schema: checks, issues, statistics)
    -- 这是一个巨大的 JSON，直接存 Schema 定义的完整结构
    report_content JSONB, 
  
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 3. Python 后端数据模型 (SQLModel)

在 FastAPI 中，我们需要定义与 Schema 一致的模型。

**Python**

```




from typing import Optional, List, Dict, Any
from uuid import UUID, uuid4
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB

# --- L0: Assets ---
class Asset(SQLModel, table=True):
    __tablename__ = "assets"
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    asset_id: str = Field(index=True) # CHAR_001
    name: str
    type: str # character, prop...
    category: Optional[str] = None
    visual_features: Dict[str, Any] = Field(default={}, sa_column=Column(JSONB))
    prompt_template: Optional[str] = None

# --- L3: Scene ---
class Scene(SQLModel, table=True):
    __tablename__ = "scenes"
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    scene_code: str # EP001_SC01
  
    # Vertical Storytelling Core
    z_depth: Dict[str, List[str]] = Field(default={}, sa_column=Column(JSONB))
    # {"foreground": ["栏杆"], "midground": ["人物"], "background": ["夕阳"]}
  
    location_type: str # 内/外
    key_events: List[str] = Field(default=[], sa_column=Column(JSONB))
    content: Optional[str] = None

# --- L4: Shot ---
class Shot(SQLModel, table=True):
    __tablename__ = "shots"
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    shot_code: str
  
    # Director Decisions
    shot_type: str # 特写
    camera_angle: str # 仰视
    narrative_function: str # 高潮
  
    active_assets: List[str] = Field(default=[], sa_column=Column(JSONB))
    # ["CHAR_001", "PROP_002"] - 用于后续 Prompt 组装时查找 Asset 表

# --- L5: Video Prompt ---
class VideoPrompt(SQLModel, table=True):
    __tablename__ = "video_prompts"
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    shot_id: UUID = Field(foreign_key="shots.id")
  
    prompt: str
    character_prompts: List[Dict] = Field(default=[], sa_column=Column(JSONB))
    camera_settings: Dict = Field(default={}, sa_column=Column(JSONB))
```

## 新增的要求 关于资产数据设计
1. 实体-变体-资源 (EVR) 三级模型原则
不要试图在一张表里描述资产的所有状态，应将其拆解为三个逻辑层级：

实体层 (Entity/Master): 存储资产的唯一身份（如：角色“林峰”）。

变体层 (Variant): 存储资产在特定条件下（年龄、时期、服装、状态）的形态。

资源层 (Resource): 存储对应的物理文件索引（Minio 路径）及 AI 训练参数。

Postgres 建议： 使用 Parent_ID 建立自关联或层级表，主表字段仅保留 asset_id (Pattern: CHAR_[0-9]{3})、name 和 type。

2. “动静分离”字段划分原则 (Column vs. JSONB)
利用 PostgreSQL 的 JSONB 性能优势，将确定性强的搜索条件列式化，将多变的描述性属性 JSON 化。

列 (Columns) - 用于检索和约束：

主键 ID、资产类型（character, scene, prop, vfx）。

分类（category）：如主角、反派。

生命周期状态：草稿、已发布、已废弃。

JSONB - 用于存储扩展属性：

角色细节： 发色、眼色、服装细节（hair, eyes, clothing）。

场景参数： 深度信息（z_depth）、天气（weather）、光照。

好处： 后续增加“性格标签”或“技能属性”时，无需执行 ALTER TABLE。

3. 资源路径映射与 Minio 解耦原则
数据库中严禁存储任何二进制媒体数据，仅存储逻辑路径。

标准化路径： 在数据库中定义 bucket 和 key_prefix。

资源表结构示例：

SQL
CREATE TABLE asset_resources (
    id UUID PRIMARY KEY,
    variant_id VARCHAR REFERENCES asset_variants(id),
    res_type VARCHAR, -- 'image', 'audio', 'model_weights'
    minio_bucket VARCHAR,
    minio_key VARCHAR, -- 例如: assets/CHAR_001/V2/face_ref.jpg
    meta_data JSONB -- 存储分辨率、时长、文件哈希等
);
预签名机制： 后端从 Postgres 读取路径后，通过 Minio SDK 生成具有时效性的 Presigned URL 给前端或 AI 引擎。

4. 时序与阶段匹配原则 (Timeline Mapping)
为了支持“不同时期”的形象，资产需要与剧本的阶段（Stage）进行解耦。

逻辑关联： 在 asset_variants 表中增加 stage_tag 或 age_range 字段。

自动路由： * 当查询某个镜头（Shot）时，系统先从 episodes 表获取该镜头所属的 stage。

根据 stage 自动选择对应的 variant_id。

如果某镜头特殊（如：闪回/回忆），允许在 shots 表中显式覆盖 asset_variant_id。

5. 多对多关联的桥接原则 (Bridge Tables)
由于一个镜头会包含多个角色/道具（assets 数组），一个角色也会出现在多个镜头中。

中间表设计： 建立 shot_asset_relations 表。

扩展价值： 这张表不仅记录关联，还可以记录资产在当前镜头的状态（例如：is_damaged=true，表示该资产在该镜头的状态是受损的）。

Schema 映射： 将 shots.schema.json 中的 characters 和 assets 数组在入库时拆解为关联记录，以支持高效的反向查询（查询某资产所有出现的镜头）。