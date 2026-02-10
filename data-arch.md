# 数据库设计与数据架构分析报告

> **生成时间：** 2026-02-11
> **基于代码版本：** FastAPI Backend (SQLAlchemy Models)

本文档旨在分析项目的数据库设计与数据组织方式，特别是以**剧本 (Script)** 为核心的数据流转与分层解构逻辑。

---

## 1. 核心设计理念：剧本即项目 (Script-Centric)

在本项目的数据架构中，**剧本文件**不仅仅是一个被存储的文档，它是整个项目结构的**种子**和**蓝图**。

最关键的设计决策在于 **ID 同构**：
* 当用户上传一个剧本文件 (`Script`)，系统会为其分配一个唯一的 `UUID`。
* 当对该剧本进行“结构化解析”时，系统会创建一个对应的 `Project` 实体。
* **惊人细节**：`Project.id` 直接沿用了 `Script.id`。

这意味着在逻辑上，**一个剧本对应一个项目**。原始的剧本文件驱动了后续所有的结构化数据生成。

## 2. 数据分层架构 (Hierarchy)

数据围绕剧本内容被层层拆解，形成了一棵从宏观到微观的树状结构：

```mermaid
graph TD
    Script[Script (Raw File)] -->|解析| Project[Project (Container)]
    Project --> Episode[Episode (集)]
    Episode --> Scene[Scene (场)]
    Scene --> Shot[Shot (镜)]
    Shot --> VideoPrompt[Video Prompt (生成指令)]
    
    subgraph "资产库 (复用资源)"
        Project -.-> Asset[Asset (角色/道具/场景)]
    end
    
    Asset -.->|绑定| Episode
    Asset -.->|绑定| Scene
    Asset -.->|关联| Shot
    
    subgraph "MinIO (对象存储)"
        RawFile[原始剧本文件 .txt]
        AssetFile[资产图片/模型 .png/.glb]
    end
    
    Script -.->|引用路径| RawFile
    Asset -.->|引用路径| AssetFile
```

---

## 3. 核心层级详解 (Core Hierarchy)

### 3.1 第一层：项目容器 (Project)
**表名**：`projects`
作为所有结构化数据的根节点，隐式绑定原始剧本文件。

| 字段名 | 类型 | 必填 | 意义与用途 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | ✅ | **物理主键**。与 `scripts.id` 保持一致，实现剧本到项目的直接映射。 |
| `owner_id` | UUID | - | **所有者**。项目所属的用户 ID。 |
| `name` | String | ✅ | **项目名称**。通常在解析时初始化为剧本的标题。 |
| `created_at` | DateTime | ✅ | **创建时间**。 |

### 3.2 第二层：集 (Episode)
**表名**：`episodes`
对应剧本中的 `EPISODE X` 或 `第X集`，是剧本内容的第一级拆分。

| 字段名 | 类型 | 必填 | 意义与用途 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | ✅ | **物理主键**。 |
| `project_id` | UUID | - | **所属项目**。外键关联到 Project。 |
| `episode_code` | String | ✅ | **业务编码**。如 `EP001`，用于 URL 路由、文件导出命名及人工识别。 |
| `episode_number` | Integer | ✅ | **集数序号**。用于排序（如 1, 2, 3）。 |
| `title` | String | - | **单集标题**。如 "初遇"，从剧本解析或 AI 生成。 |
| `script_full_text` | Text | - | **原始内容**。该集对应的完整剧本片段，是后续 AI 分析的输入源。 |
| `word_count` | Integer | ✅ | **字数统计**。用于估算本集时长和 AI 处理成本。 |
| `status` | String | ✅ | **处理状态**。枚举值：`pending` (待处理), `parsing` (解析中), `parsed` (已完成), `error` (失败)。 |
| `start_line` / `end_line` | Integer | - | **原文定位**。记录该集在原始剧本文件中的起始和结束行号，方便回溯。 |

### 3.3 第三层：场 (Scene)
**表名**：`scenes`
对应剧本中的 `SCENE X` 或 `第X场`，是叙事的基本时空单元，也是**竖屏短剧的空间构建核心**。

| 字段名 | 类型 | 必填 | 意义与用途 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | ✅ | **物理主键**。 |
| `episode_id` | UUID | - | **所属集**。外键关联到 Episode。 |
| `scene_code` | String | ✅ | **业务编码**。如 `EP001_SC01`，全局唯一的场次标识。 |
| `scene_number` | Integer | ✅ | **场次序号**。 |
| `location` | String | - | **地点**。如 "咖啡厅"，从剧本头解析。 |
| `location_type` | String | - | **内外景**。枚举：`内`, `外`, `内外`。影响 AI 对光照和环境的理解。 |
| `time_of_day` | String | - | **时间**。如 "日", "夜", "黄昏"。 |
| `mood` | String | - | **情绪基调**。如 "紧张", "温馨"，用于指导画面色调。 |
| `z_depth` | JSONB | ✅ | **空间层次 (核心)**。竖屏短剧特有字段，结构为 `{foreground: [], midground: [], background: []}`，用于指导 3D 构图。 |
| `content` | Text | - | **场次原文**。该场次的具体剧本内容（包含对话和动作）。 |
| `key_events` | JSONB | - | **关键事件**。AI 提取的事件列表，辅助分镜生成。 |

### 3.4 第四层：镜 (Shot)
**表名**：`shots`
视觉呈现的最小单元，通常由 AI 根据 `Scene` 内容拆解或导演人工创建。

| 字段名 | 类型 | 必填 | 意义与用途 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | ✅ | **物理主键**。 |
| `scene_id` | UUID | - | **所属场**。外键关联到 Scene。 |
| `shot_code` | String | ✅ | **业务编码**。如 `EP01_SC01_SH01`。 |
| `shot_number` | Integer | ✅ | **镜头序号**。 |
| `shot_type` | String | - | **景别**。如 `特写` (CU), `全景` (FS), `中景` (MS)。 |
| `camera_move` | String | - | **运镜**。如 `推` (Push In), `拉` (Pull Out), `摇` (Pan)。 |
| `narrative_function` | String | - | **叙事功能**。如 `建立` (Establish), `反应` (Reaction)。 |
| `description` | Text | - | **画面描述**。Visual Description，用于指导画面生成的详细描述。 |
| `dialogue` | Text | - | **台词**。该镜头覆盖的台词内容。 |
| `active_assets` | JSONB | ✅ | **资产引用**。存储该镜头中出现的资产 ID 列表 (Array)，用于快速索引。 |
| `duration_estimate` | Numeric | - | **预估时长**。单位：秒。 |

### 3.5 第五层：生成指令 (VideoPrompt)
**表名**：`video_prompts`
对接视频生成模型（如 Runway, Sora, Kling）的“原子指令”层。

| 字段名 | 类型 | 必填 | 意义与用途 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | ✅ | **物理主键**。 |
| `shot_id` | UUID | - | **所属镜头**。外键关联到 Shot。 |
| `prompt_main` | Text | - | **正向提示词**。发送给 AI 模型的最终 Prompt（包含风格、主体、动作等）。 |
| `negative_prompt` | Text | - | **负向提示词**。告诉 AI 排除哪些元素（如 "blurry", "deformed"）。 |
| `camera_settings` | JSONB | ✅ | **摄像机参数**。如光圈、焦距、快门速度，用于精细控制画面质感。 |
| `character_prompts` | JSONB | ✅ | **角色独立 Prompt**。针对每个角色的特定修饰词 (JSON Array)，确保角色特征准确。 |

---

## 4. 资产管理详解 (Asset Management)

资产系统独立于剧本层级，作为**项目级共享资源库**存在。

### 4.1 资产实体 (Asset)
**表名**：`assets`
定义一个抽象的资产对象（如“男主角”），不包含具体视觉特征。

| 字段名 | 类型 | 必填 | 意义与用途 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | ✅ | **物理主键**。 |
| `project_id` | UUID | - | **所属项目**。资产是项目范围内共享的。 |
| `asset_id` | String | ✅ | **业务 ID**。如 `CHAR_001`, `PROP_SWORD`，用于在 Script/Shot 中引用。 |
| `name` | String | ✅ | **名称**。如 "李明", "倚天剑"。 |
| `type` | Enum | ✅ | **类型**。枚举：`character` (角色), `scene` (场景), `prop` (道具), `vfx` (特效)。 |
| `lifecycle_status` | String | ✅ | **生命周期**。`draft` (草稿), `published` (已发布), `archived` (归档)。 |

### 4.2 资产变体 (AssetVariant)
**表名**：`asset_variants`
定义资产的具体视觉实现（如“男主角-高中校服版”、“男主角-西装版”）。

| 字段名 | 类型 | 必填 | 意义与用途 |
| :--- | :--- | :--- | :--- |
| `id` | UUID | ✅ | **物理主键**。 |
| `asset_entity_id` | UUID | ✅ | **所属资产**。外键关联到 Asset。 |
| `variant_code` | String | ✅ | **变体编码**。如 `v1`, `outfit_school`。 |
| `stage_tag` | String | - | **阶段标签**。如 "高中时期", "成年时期"。 |
| `attributes` | JSONB | ✅ | **视觉特征 (核心)**。存储结构化的特征描述，如 `{hair_color: "black", clothing: "white shirt"}`。 |
| `prompt_template` | Text | - | **Prompt 模板**。该变体对应的基础 Prompt 片段（如 LoRA 触发词）。 |
| `is_default` | Boolean | ✅ | **默认变体**。当未指定具体变体时使用的默认形象。 |

---

## 5. 存储架构：MinIO 集成策略 (Object Storage)

数据库中仅存储文件的**元数据**（Metadata）和**引用路径**，实际的二进制大文件（剧本、图片、模型）存储在 MinIO 对象存储中。这种**存算分离**的设计保证了数据库的轻量和高性能。

### 5.1 存储分区 (Buckets)

系统采用了双 Bucket 隔离策略，以区分敏感数据和静态资源：

| Bucket 名称 | 默认值 | 用途 | 访问权限 |
| :--- | :--- | :--- | :--- |
| **Scripts Bucket** | `anyreason-scripts` | 存储用户上传的原始剧本文件 (.txt, .docx) | **Private** (仅后端可读) |
| **Assets Bucket** | `anyreason-assets` | 存储资产图片、参考图、生成的视频片段 | **Public Read** (或 Presigned URL) |

### 5.2 路径规范 (Key Convention)

MinIO 中的文件路径（Key）设计严格遵循“归属关系”，防止命名冲突。

#### 5.2.1 剧本文件路径
* **格式**: `scripts/{user_id}/{script_id}/{filename}`
* **示例**: `scripts/550e8400.../a1b2c3d4.../my_script_v1.txt`
* **逻辑**:
    1.  **用户隔离**: 第一级目录为 `user_id`，物理隔离不同用户的数据。
    2.  **剧本隔离**: 第二级为 `script_id` (即 `project_id`)，确保每个剧本有独立空间。
    3.  **文件名**: 保留原始文件名或使用 slug 后的安全文件名。

#### 5.2.2 资产文件路径
* **格式**: `assets/{asset_id}/{variant_code}/{filename}`
* **示例**: `assets/CHAR_001/v1/face_ref.png`
* **逻辑**:
    1.  **资产聚合**: 根目录下按 `asset_id` 聚合，所有关于“男主角”的文件都在 `CHAR_001` 下。
    2.  **变体隔离**: 次级目录按 `variant_code` 分组，区分“校服版”与“西装版”的资源。

### 5.3 数据库映射 (Mapping)

数据库表通过 `bucket` + `key` 的组合字段来引用 MinIO 中的对象，而不是存储 URL。

#### `scripts` 表中的引用
```sql
minio_bucket = "anyreason-scripts"
minio_key    = "scripts/user_123/script_abc/draft.txt"
```
* **优势**: 如果 MinIO 迁移或域名变更，数据库无需修改，只需代码层改变 Endpoint 配置。

#### `asset_resources` 表中的引用
```sql
res_type     = "reference_image"
minio_bucket = "anyreason-assets"
minio_key    = "assets/CHAR_001/v1/ref_01.jpg"
```
* **优势**: 允许一个资产变体关联多个资源文件（如三视图、动作参考图），通过 `res_type` 区分用途。

---

## 6. 技术亮点总结

1.  **物理主键 (UUID) 与 业务编码 (Code) 双轨制**：
    *   数据库关联全用 UUID，保证系统健壮性和分布式友好。
    *   URL 和人工交互全用业务编码 (EP01, SC01)，保证可读性和语义清晰。

2.  **JSONB 的战略性使用**：
    *   `Scene.z_depth`: 灵活存储复杂的空间层次。
    *   `Shot.active_assets`: 快速存储多对多关系快照。
    *   `AssetVariant.attributes`: 适应不同类型资产千变万化的视觉特征字段。

3.  **正则驱动的解析引擎**：
    *   通过 `ScriptStructureService` 中的正则表达式，精准识别标准剧本格式，将非结构化文本转化为结构化的 Episode/Scene 数据。

4.  **存算分离的存储策略**：
    *   通过 MinIO 托管大文件，数据库只存“货位号”，实现了存储层与逻辑层的解耦，便于未来扩展到 S3 或 OSS。
