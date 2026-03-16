# AI 润色功能改进设计方案

## 1. 现有代码分析

### 1.1 PromptTemplateModal 集成点

**现有组件位置**: `nextjs-frontend/components/canvas/PromptTemplateModal.tsx`

**核心接口**:
```typescript
export interface PromptPreset {
  id: string;
  tool_key: string;  // 当前支持: 'canvas_text_gen', 'canvas_image_gen', 'canvas_video_gen'
  group: string | null;
  name: string;
  provider: string | null;
  model: string | null;
  prompt_template: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface PromptTemplateModalProps {
  open: boolean;
  toolKey: string;
  onClose: () => void;
  onSelect: (preset: PromptPreset) => void;
}
```

**复用方式**:
- 新增 `tool_key: 'batch_video_polish'` 支持批量视频润色场景
- 完全复用现有的 CRUD、分组、搜索功能
- 在 `batch-video/page.tsx` 中通过 state 控制显隐

### 1.2 useAIModelList 集成点

**Hook 位置**: `nextjs-frontend/hooks/useAIModelList.ts`

**使用方式**:
```typescript
const { 
  models, 
  loading, 
  currentConfigId, 
  selectedConfigId, 
  selectModel 
} = useAIModelList('text');
```

**特性**:
- 自动缓存用户选择到 localStorage
- 支持按类别（text/image/video）获取模型
- 自动过滤未启用或无 API key 的模型
- 从目录获取模型能力信息

### 1.3 AI 调用接口

**现有端点**: `/api/ai/text/chat`

**请求格式**:
```typescript
{
  model_config_id: string;
  messages: [
    { role: 'system', content: string },
    { role: 'user', content: string }
  ];
}
```

**响应格式**:
```typescript
{
  code: 200;
  data: {
    output_text: string;
  }
}
```\n
### 1.4 批量视频页面状态分析

**当前状态** (page.tsx):
```typescript
// 润色相关状态
const [isPolishingAssets, setIsPolishingAssets] = useState(false);
const [showPolishTemplateEditor, setShowPolishTemplateEditor] = useState(false);
const [polishTemplate, setPolishTemplate] = useState("...");
const [showPolishModelDialog, setShowPolishModelDialog] = useState(false);
const [polishMismatch, setPolishMismatch] = useState<... | null>(null);

// 模型选择 (已存在)
const { 
  models: textModels, 
  selectedConfigId: selectedTextModelId, 
  selectModel: selectTextModel 
} = useAIModelList("text");
```

**需要替换的部分**:
- `showPolishTemplateEditor` + textarea → `PromptTemplateModal`
- `showPolishModelDialog` → 向导中的模型选择步骤
- `polishTemplate` → 从模板选择获取

---

## 2. 分步向导式交互流程设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    AIPolishWizard 组件                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────┐ │
│  │  步骤导航    │  │   内容区    │  │   内容区    │  │  内容区  │ │
│  │             │  │  (步骤1)    │  │  (步骤2)    │  │ (步骤3)  │ │
│  │ • 模板选择   │  │             │  │             │  │         │ │
│  │ • 模型选择   │  │             │  │             │  │         │ │
│  │ • 确认执行   │  │             │  │             │  │         │ │
│  │ • 结果处置   │  │             │  │             │  │         │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────┘ │
│                              │                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              底部操作栏 (上一步/下一步/取消)               │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 步骤定义

```typescript
type WizardStep = 'template' | 'model' | 'confirm' | 'processing' | 'result';

interface WizardState {
  step: WizardStep;
  selectedTemplate: PromptPreset | null;
  selectedModelId: string | null;
  isProcessing: boolean;
  result: {
    success: boolean;
    originalLines: string[];
    outputLines: string[];
    mismatch?: { expected: number; actual: number };
  } | null;
}
```

### 2.3 各步骤详细设计

#### Step 1: 模板选择

**组件**: `PromptTemplateModal` (复用)

**布局**:
- 左侧边栏：分组导航（全部/未分组/自定义分组）
- 右侧面板：
  - 顶部：搜索框 + 新建按钮
  - 中部：模板卡片网格
  - 底部：分页（如需要）

**模板卡片内容**:
```
┌────────────────────────────────────┐
│ ⭐ [默认]  模板名称                   │
│ 分组：通用                          │
│                                    │
│ 请根据以下分镜提示词逐行润色...      │
│ 保持与输入行数一致...               │
│                                    │
│ provider/model    更新于 2024-01-15 │
└────────────────────────────────────┘
```

**操作**:
- 点击卡片 → 选中并显示"下一步"按钮高亮
- 点击编辑图标 → 打开编辑表单
- 点击新建 → 打开创建表单

**选中后**:
```typescript
setWizardState(prev => ({
  ...prev,
  selectedTemplate: preset,
  // 允许进入下一步
}));
```

#### Step 2: 模型选择

**布局**: 模型卡片网格

**模型卡片**:
```
┌────────────────────────────────────┐
│  🤖                                │
│  GPT-4                             │
│  OpenAI                           │
│  ─────────────────────────────    │
│  上下文: 128k                      │
│  [选中] ✓                          │
└────────────────────────────────────┘
```

**数据来源**:
```typescript
const { models, selectedConfigId, selectModel } = useAIModelList('text');
```

**交互**:
- 点击卡片 → 选中模型，更新 `selectedModelId`
- 默认选中 localStorage 缓存的模型或第一个
- 显示模型能力标签（上下文长度、支持功能等）

#### Step 3: 确认与执行

**布局**: 三栏预览

```
┌────────────────────────────────────────────────────────────────┐
│  确认润色配置                                                   │
├────────────────────────────────────────────────────────────────┤
│  模板: 【精选】分镜提示词润色模板    [查看详情]                  │
│  模型: GPT-4 (OpenAI)                                          │
│  待处理: 10 个分镜                                              │
├────────────────────────────────────────────────────────────────┤
│  输入预览（前 3 条）：                                          │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ 1. 夕阳下的海滩，金色的阳光洒在波光粼粼的海面上...        │   │
│  │ 2. 海浪轻轻拍打着沙滩，留下一串串白色的泡沫...            │   │
│  │ 3. 一个女孩站在海边，长发随风飘扬...                      │   │
│  │ ... 还有 7 条                                             │   │
│  └────────────────────────────────────────────────────────┘   │
├────────────────────────────────────────────────────────────────┤
│  [返回修改]              [开始 AI 润色]                         │
└────────────────────────────────────────────────────────────────┘
```

**执行逻辑**:
```typescript
const handleExecute = async () => {
  setWizardState(prev => ({ ...prev, step: 'processing' }));
  
  const input = selectedAssets.map(a => a.prompt).join('\n');
  const userPrompt = selectedTemplate.prompt_template.replace(/\{input\}/g, input);
  
  try {
    const response = await fetch('/api/ai/text/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_config_id: selectedModelId,
        messages: [
          { role: 'system', content: '你是一个专业的分镜提示词润色助手。' },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    
    const result = await response.json();
    const outputLines = result.data.output_text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const originalLines = selectedAssets.map(a => a.prompt || '');
    
    const mismatch = outputLines.length !== originalLines.length 
      ? { expected: originalLines.length, actual: outputLines.length }
      : undefined;
    
    setWizardState(prev => ({
      ...prev,
      step: 'result',
      result: {
        success: !mismatch,
        originalLines,
        outputLines,
        mismatch
      }
    }));
  } catch (error) {
    // 错误处理
  }
};
```

#### Step 4: 处理中

**UI**:
```
┌────────────────────────────────────────────────────────────────┐
│                                                                 │
│                     ⟳ 润色处理中...                             │
│                                                                 │
│              正在使用 GPT-4 润色 10 个分镜...                    │
│                                                                 │
│                     [取消]                                      │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

**特性**:
- 显示旋转加载动画
- 支持取消操作（AbortController）
- 显示模型名称和分镜数量

---

## 3. 结果处置界面设计

### 3.1 场景 A：行数完全匹配

**UI**:
```
┌────────────────────────────────────────────────────────────────┐
│  ✅ 润色完成                                                    │
├────────────────────────────────────────────────────────────────┤
│  成功润色 10 个分镜，已全部替换。                                │
├────────────────────────────────────────────────────────────────┤
│  前后对比（点击展开）                                          │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ ▶ 第 1 个分镜                                           │   │
│  │   原：夕阳下的海滩，金色的阳光洒在波光粼粼的海面上...      │   │
│  │   新：落日余晖下的金色海滩，璀璨阳光洒在波光潋滟的海面...   │   │
│  │ ▶ 第 2 个分镜                                           │   │
│  │   ...                                                   │   │
│  └────────────────────────────────────────────────────────┘   │
├────────────────────────────────────────────────────────────────┤
│  [撤销替换]            [完成]                                   │
└────────────────────────────────────────────────────────────────┘
```

**操作**:
- **完成**: 关闭向导，返回 AssetGrid
- **撤销**: 恢复原始提示词（需要缓存原始数据）
- **展开对比**: 查看每个分镜的前后变化

### 3.2 场景 B：行数不匹配

**UI - 可视化对比编辑器**:
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ⚠️ 行数不匹配                                                               │
│  AI 返回 8 行，但你选择了 10 个分镜。请手动对齐或编辑。                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                     │
│  │  原始提示词  │ ↔  │  AI 润色结果 │    │   操作栏    │                     │
│  │  (可编辑)   │    │  (可编辑)   │    │             │                     │
│  └─────────────┘    └─────────────┘    └─────────────┘                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ #  │ 原始提示词                          │ AI 润色结果               │   │
│  ├────┼─────────────────────────────────────┼───────────────────────────┤   │
│  │ 1  │ 夕阳下的海滩...                      │ 落日余晖下的金色海滩...    │   │
│  │    │ [编辑图标]                          │ [编辑图标]                │   │
│  ├────┼─────────────────────────────────────┼───────────────────────────┤   │
│  │ 2  │ 海浪拍打着沙滩...                    │ 波涛汹涌地拍打着沙滩...    │   │
│  ├────┼─────────────────────────────────────┼───────────────────────────┤   │
│  │ 3  │ 一个女孩站在海边...                  │                           │   │
│  │    │                                     │ [+ 插入行] [× 删除行]      │   │
│  ├────┼─────────────────────────────────────┼───────────────────────────┤   │
│  │ 4  │ 远处有帆船缓缓驶过...                │ 远处帆船缓缓驶过...        │   │
│  │    │ [+ 从AI插入]                        │                           │   │
│  ├────┼─────────────────────────────────────┼───────────────────────────┤   │
│  │ ...│ ...                                 │ ...                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  智能匹配建议：                                                              │
│  • AI 的第 3-4 行可能对应你的第 3 行，建议合并                                 │
│                                                                             │
│  [放弃]  [重置]  [确认替换]                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**交互功能**:

1. **行编辑**:
   - 双击任意单元格进入编辑模式
   - 支持多行文本编辑
   - 实时保存到临时状态

2. **行操作**:
   - 插入行：在指定位置插入空行
   - 删除行：删除该行（保留原始）
   - 从 AI 插入：将 AI 的某一行复制到指定位置
   - 合并行：将多行合并为一行

3. **智能匹配建议**:
   - 基于文本相似度计算建议匹配
   - 显示相似度百分比
   - 一键应用建议

4. **操作按钮**:
   - **放弃**: 放弃所有修改，返回 AssetGrid
   - **重置**: 恢复到 AI 原始输出状态
   - **确认替换**: 将编辑后的结果应用到分镜

**数据结构**:
```typescript
interface LineMapping {
  id: string;              // 唯一标识
  originalIndex: number;   // 原始分镜索引
  originalText: string;    // 原始提示词
  outputIndex: number | null;  // AI 输出行索引（可能为 null）
  outputText: string;      // AI 输出内容（或手动编辑）
  isManualEdit: boolean;   // 是否手动编辑过
  status: 'matched' | 'unmatched' | 'edited' | 'inserted' | 'deleted';
}

interface MappingState {
  mappings: LineMapping[];
  unmatchedOutputs: Array<{ index: number; text: string }>;
}
```

**匹配算法建议**:
```typescript
function suggestMappings(
  originals: string[], 
  outputs: string[]
): LineMapping[] {
  // 简单的基于包含关系的匹配
  const mappings: LineMapping[] = [];
  
  for (let i = 0; i < originals.length; i++) {
    const original = originals[i];
    let bestMatch = { index: -1, score: 0 };
    
    for (let j = 0; j < outputs.length; j++) {
      const output = outputs[j];
      // 计算相似度（可使用简单的关键词重叠或更复杂的算法）
      const score = calculateSimilarity(original, output);
      if (score > bestMatch.score) {
        bestMatch = { index: j, score };
      }
    }
    
    if (bestMatch.score > 0.5) {
      mappings.push({
        id: `line-${i}`,
        originalIndex: i,
        originalText: original,
        outputIndex: bestMatch.index,
        outputText: outputs[bestMatch.index],
        isManualEdit: false,
        status: 'matched'
      });
    } else {
      mappings.push({
        id: `line-${i}`,
        originalIndex: i,
        originalText: original,
        outputIndex: null,
        outputText: '',
        isManualEdit: false,
        status: 'unmatched'
      });
    }
  }
  
  return mappings;
}
```

---

## 4. 组件架构

### 4.1 文件结构

```
app/(aistudio)/batch-video/
├── components/
│   ├── AIPolishWizard/                    # 新增：向导主组件
│   │   ├── index.tsx                      # 主入口
│   │   ├── steps/
│   │   │   ├── TemplateStep.tsx           # 步骤1：模板选择
│   │   │   ├── ModelStep.tsx              # 步骤2：模型选择
│   │   │   ├── ConfirmStep.tsx            # 步骤3：确认执行
│   │   │   ├── ProcessingStep.tsx         # 步骤4：处理中
│   │   │   └── ResultStep.tsx             # 步骤5：结果处置
│   │   └── components/
│   │       ├── ModelCard.tsx              # 模型卡片
│   │       ├── ComparisonTable.tsx        # 对比表格（结果处置）
│   │       └── LineEditor.tsx             # 行编辑器
│   └── ... (existing components)
└── page.tsx                               # 集成点
```

### 4.2 主组件接口

```typescript
// AIPolishWizard/index.tsx
interface AIPolishWizardProps {
  open: boolean;
  selectedAssets: BatchVideoAsset[];
  onClose: () => void;
  onComplete: (updates: Array<{ asset_id: string; prompt: string }>) => void;
  onCancel: () => void;
}

// 使用示例 (page.tsx)
<AIPolishWizard
  open={showPolishWizard}
  selectedAssets={assets.filter(a => selectedAssets.has(a.id))}
  onClose={() => setShowPolishWizard(false)}
  onComplete={(updates) => {
    // 应用更新到 assets
    setAssets(prev => prev.map(asset => {
      const update = updates.find(u => u.asset_id === asset.id);
      return update ? { ...asset, prompt: update.prompt } : asset;
    }));
    // 持久化到后端
    fetch('/api/batch-video/cards/batch-update-prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
    setShowPolishWizard(false);
  }}
/>
```

### 4.3 状态管理

```typescript
// 使用 useReducer 管理复杂状态
interface WizardState {
  step: WizardStep;
  selectedTemplate: PromptPreset | null;
  selectedModelId: string | null;
  isProcessing: boolean;
  processingAbort: AbortController | null;
  result: {
    success: boolean;
    originalLines: string[];
    outputLines: string[];
    mismatch?: { expected: number; actual: number };
    mappings?: LineMapping[];
  } | null;
  error: string | null;
}

type WizardAction =
  | { type: 'SELECT_TEMPLATE'; payload: PromptPreset }
  | { type: 'SELECT_MODEL'; payload: string }
  | { type: 'GO_TO_STEP'; payload: WizardStep }
  | { type: 'START_PROCESSING' }
  | { type: 'SET_PROCESSING_ABORT'; payload: AbortController }
  | { type: 'PROCESSING_COMPLETE'; payload: WizardState['result'] }
  | { type: 'PROCESSING_ERROR'; payload: string }
  | { type: 'UPDATE_MAPPINGS'; payload: LineMapping[] }
  | { type: 'RESET' };
```

---

## 5. 与现有代码集成方案

### 5.1 替换现有润色逻辑

**现有代码** (page.tsx):
```typescript
const [showPolishTemplateEditor, setShowPolishTemplateEditor] = useState(false);
const [showPolishModelDialog, setShowPolishModelDialog] = useState(false);
const [polishTemplate, setPolishTemplate] = useState("...");
const [isPolishingAssets, setIsPolishingAssets] = useState(false);

const handleOpenAIPolish = () => {
  if (selectedAssets.size === 0) {
    toast.error("请先选择要润色的分镜");
    return;
  }
  setShowPolishTemplateEditor(true);
};
```

**替换后**:
```typescript
const [showPolishWizard, setShowPolishWizard] = useState(false);

const handleOpenAIPolish = () => {
  if (selectedAssets.size === 0) {
    toast.error("请先选择要润色的分镜");
    return;
  }
  setShowPolishWizard(true);
};
```

### 5.2 新增 API 支持

需要后端新增 `tool_key: 'batch_video_polish'` 的模板支持：

```python
# fastapi_backend/app/api/v1/ai_prompt_presets.py
# 已存在，只需在创建/查询时支持新的 tool_key
```

### 5.3 本地缓存策略

```typescript
// 缓存用户的选择
const POLISH_CACHE_KEY = 'batch_video_polish_prefs';

interface PolishPrefs {
  lastTemplateId: string | null;
  lastModelId: string | null;
}

// 在向导关闭时保存
useEffect(() => {
  if (!open && selectedTemplate && selectedModelId) {
    localStorage.setItem(POLISH_CACHE_KEY, JSON.stringify({
      lastTemplateId: selectedTemplate.id,
      lastModelId: selectedModelId
    }));
  }
}, [open, selectedTemplate, selectedModelId]);

// 在向导打开时恢复
useEffect(() => {
  if (open) {
    const cached = localStorage.getItem(POLISH_CACHE_KEY);
    if (cached) {
      const prefs = JSON.parse(cached);
      // 恢复选择...
    }
  }
}, [open]);
```

---

## 6. 实施计划

### 阶段 1: 基础复用 (1-2 天)
- [ ] 复用 `PromptTemplateModal` 替换现有的 textarea 编辑器
- [ ] 新增 `tool_key: 'batch_video_polish'` 支持
- [ ] 保持现有的模型选择和执行逻辑

### 阶段 2: 统一向导 (2-3 天)
- [ ] 创建 `AIPolishWizard` 组件框架
- [ ] 实现步骤导航和状态管理
- [ ] 整合模板选择、模型选择、确认执行三个步骤
- [ ] 替换 page.tsx 中的分散状态

### 阶段 3: 结果处置增强 (2-3 天)
- [ ] 实现 `ComparisonTable` 对比编辑组件
- [ ] 实现行级别的编辑和映射功能
- [ ] 实现智能匹配建议
- [ ] 添加撤销功能

### 阶段 4: 优化和测试 (1-2 天)
- [ ] 添加加载状态和错误处理
- [ ] 优化性能和用户体验
- [ ] 测试各种边界情况（大量分镜、空提示词、超长文本等）

---

## 7. 关键设计决策

### 7.1 为什么选择复用 PromptTemplateModal？

**优势**:
1. **一致性**: 用户在不同功能中使用相同的模板管理体验
2. **功能完整**: 已包含分组、搜索、CRUD 等完整功能
3. **维护成本低**: 一处修改，全局生效
4. **熟悉度高**: 用户已在无限画布中熟悉该组件

**调整点**:
- 新增 `tool_key` 区分业务场景
- 可能需要调整尺寸以适应 batch-video 页面

### 7.2 为什么使用分步向导？

**优势**:
1. **清晰性**: 每个步骤职责单一，用户不易迷失
2. **容错性**: 可以在确认前返回修改
3. **可扩展性**: 未来可轻松添加更多步骤（如参数调优）
4. **状态管理**: 便于管理复杂的状态流转

### 7.3 行数不匹配时的处理策略

**方案对比**:

| 方案 | 优点 | 缺点 |
|------|------|------|
| A. 直接拒绝 | 简单明确 | 用户需重新操作，体验差 |
| B. 自动截断/填充 | 无需用户干预 | 可能丢失数据或引入空内容 |
| C. 可视化对比编辑 | 灵活可控 | 实现复杂度高 |

**选择 C 的原因**:
- AI 输出不稳定，自动处理风险高
- 用户需要知道具体哪里出了问题
- 允许用户灵活调整，而不是强制接受

---

## 8. 风险与应对

| 风险 | 影响 | 应对策略 |
|------|------|----------|
| PromptTemplateModal 尺寸不适配 | 中 | 调整 modal 尺寸或创建适配 wrapper |
| AI 输出质量不稳定 | 高 | 提供示例模板引导用户；支持重新生成 |
| 大量分镜（100+）性能问题 | 中 | 虚拟滚动；分批处理；后端异步任务 |
| 用户误操作替换 | 中 | 添加撤销功能；二次确认；操作日志 |
| 浏览器兼容性问题 | 低 | 使用标准 API；充分测试 |

---

## 9. 附录

### 9.1 PromptPreset API 端点

```
GET    /api/ai/prompt-presets?tool_key={toolKey}
POST   /api/ai/prompt-presets
PUT    /api/ai/prompt-presets/{id}
DELETE /api/ai/prompt-presets/{id}
```

### 9.2 AI Chat API 端点

```
POST /api/ai/text/chat
Body: {
  model_config_id: string;
  messages: Array<{ role: string; content: string }>;
}
```

### 9.3 批量更新 API 端点

```
POST /api/batch-video/cards/batch-update-prompts
Body: {
  updates: Array<{ asset_id: string; prompt: string }>;
}
```

---

**文档版本**: 1.0
**创建日期**: 2026-03-16
**状态**: 设计完成，待实施
