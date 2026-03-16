# 批量视频功能实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在创作工坊下新建"批量视频"路由，实现基于Tab导航的完整分镜视频生成工作流：图片切割→分镜Card管理→Excel导入匹配→提示词润色→批量视频生成。

**Architecture:** 复用现有AI Gateway、任务系统、VFS存储和提示词库。前端采用Tab导航控制工作流状态，分镜Card为核心数据单元，每个Card独立跟踪生成状态。

**Tech Stack:** Next.js + ReactFlow + shadcn/ui + FastAPI + Celery + PostgreSQL + MinIO

---

## 概述

本计划将批量视频功能分解为7个阶段、35个具体任务。每个任务包含：文件路径、实现代码、测试命令、验证步骤。

## 数据模型

```typescript
// 核心类型定义
interface BatchVideoProject {
  id: string;
  name: string;
  status: 'draft' | 'processing' | 'completed';
  gridMode: '16:9' | '9:16';
  createdAt: string;
  updatedAt: string;
}

interface StoryboardCard {
  id: string;
  projectId: string;
  index: number;           // 序号，用于Excel匹配
  sourceImageUrl: string;  // 原图
  croppedImageUrl?: string; // 切割后的图（如需要）
  prompt: string;          // 视频生成提示词
  duration: number;        // 默认3秒
  selected: boolean;       // 是否选中生成
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultUrl?: string;      // 生成结果
  taskId?: string;         // 关联的任务ID
}

interface ExcelMapping {
  indexColumn: string;     // 序号列名
  promptColumn: string;    // 提示词列名
}
```

---

## 阶段1: 基础路由与布局

### Task 1.1: 创建批量视频项目列表页

**Files:**
- Create: `nextjs-frontend/app/(studio)/batch-video/page.tsx`

**Implementation:**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BatchVideoProject {
  id: string;
  name: string;
  status: string;
  created_at: string;
  card_count: number;
}

export default function BatchVideoListPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<BatchVideoProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/batch-video/projects');
      const data = await res.json();
      if (data.data) {
        setProjects(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    const name = prompt('请输入项目名称:', `批量视频项目 ${new Date().toLocaleDateString()}`);
    if (!name) return;
    
    try {
      const res = await fetch('/api/batch-video/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.data?.id) {
        router.push(`/batch-video/${data.data.id}`);
      }
    } catch (err) {
      console.error('Failed to create project:', err);
      alert('创建项目失败');
    }
  };

  return (
    <div className="container mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif italic">批量视频</h1>
          <p className="text-sm text-muted-foreground mt-1">
            批量生成分镜视频，支持图片切割、Excel导入、提示词润色
          </p>
        </div>
        <Button onClick={createProject} className="gap-2">
          <Plus size={18} />
          新建项目
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-20 text-muted-foreground">加载中...</div>
      ) : projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <Folder className="w-16 h-16 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground mb-4">暂无项目</p>
            <Button onClick={createProject} variant="outline">
              创建第一个项目
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => router.push(`/batch-video/${project.id}`)}
            >
              <CardHeader>
                <CardTitle className="text-lg truncate">{project.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{project.card_count} 个分镜</span>
                  <span className={project.status === 'completed' ? 'text-green-600' : ''}>
                    {project.status === 'draft' ? '草稿' : 
                     project.status === 'processing' ? '生成中' : '已完成'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {new Date(project.created_at).toLocaleDateString('zh-CN')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 1: 创建文件**

**Step 2: 验证路由可访问**

访问: `http://localhost:3000/batch-video`
Expected: 页面显示"批量视频"标题和"新建项目"按钮

---

### Task 1.2: 创建项目详情页框架（Tab导航）

**Files:**
- Create: `nextjs-frontend/app/(studio)/batch-video/[projectId]/page.tsx`

**Implementation:**

```typescript
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { 
  Images, 
  FileSpreadsheet, 
  Play, 
  History,
  Settings 
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TabId = 'cards' | 'script' | 'generate' | 'history';

const tabs: { id: TabId; label: string; icon: typeof Images }[] = [
  { id: 'cards', label: '分镜管理', icon: Images },
  { id: 'script', label: '脚本导入', icon: FileSpreadsheet },
  { id: 'generate', label: '视频生成', icon: Play },
  { id: 'history', label: '生成历史', icon: History },
];

export default function BatchVideoProjectPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [activeTab, setActiveTab] = useState<TabId>('cards');

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4 flex items-center justify-between bg-background">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-serif italic">批量视频项目</h1>
          <span className="text-xs text-muted-foreground font-mono">{projectId.slice(0, 8)}</span>
        </div>
        
        {/* Tab Navigation */}
        <nav className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
                activeTab === id
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* Tab Content */}
      <main className="flex-1 overflow-auto p-6">
        {activeTab === 'cards' && <CardsTab projectId={projectId} />}
        {activeTab === 'script' && <ScriptTab projectId={projectId} />}
        {activeTab === 'generate' && <GenerateTab projectId={projectId} />}
        {activeTab === 'history' && <HistoryTab projectId={projectId} />}
      </main>
    </div>
  );
}

// Placeholder components
function CardsTab({ projectId }: { projectId: string }) {
  return <div className="text-center py-20 text-muted-foreground">分镜管理 Tab (Task 2.x 实现)</div>;
}

function ScriptTab({ projectId }: { projectId: string }) {
  return <div className="text-center py-20 text-muted-foreground">脚本导入 Tab (Task 3.x 实现)</div>;
}

function GenerateTab({ projectId }: { projectId: string }) {
  return <div className="text-center py-20 text-muted-foreground">视频生成 Tab (Task 5.x 实现)</div>;
}

function HistoryTab({ projectId }: { projectId: string }) {
  return <div className="text-center py-20 text-muted-foreground">生成历史 Tab (Task 6.x 实现)</div>;
}
```

**Step 1: 创建文件**

**Step 2: 验证Tab切换**

访问: `http://localhost:3000/batch-video/{任意ID}`
Expected: 显示4个Tab，点击可切换

---

### Task 1.3: 创建后端API路由

**Files:**
- Create: `fastapi_backend/app/api/v1/batch_video.py`

**Implementation:**

```python
from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_async_session, User
from app.schemas_response import ResponseBase
from app.users import current_active_user

router = APIRouter(prefix="/batch-video", tags=["batch-video"])


@router.get("/projects", response_model=ResponseBase[list[dict]])
async def list_projects(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """List all batch video projects for current user."""
    # TODO: Implement in Task 1.4
    return ResponseBase(code=200, msg="OK", data=[])


@router.post("/projects", response_model=ResponseBase[dict])
async def create_project(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Create a new batch video project."""
    # TODO: Implement in Task 1.4
    return ResponseBase(code=200, msg="OK", data={"id": "temp-id", "name": payload.get("name", "")})


@router.get("/projects/{project_id}", response_model=ResponseBase[dict])
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Get project details."""
    # TODO: Implement in Task 1.4
    return ResponseBase(code=200, msg="OK", data={})


@router.get("/projects/{project_id}/cards", response_model=ResponseBase[list[dict]])
async def list_cards(
    project_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """List all cards in a project."""
    # TODO: Implement in Task 2.2
    return ResponseBase(code=200, msg="OK", data=[])


@router.post("/projects/{project_id}/cards", response_model=ResponseBase[dict])
async def create_cards(
    project_id: UUID,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Create cards from uploaded images."""
    # TODO: Implement in Task 2.2
    return ResponseBase(code=200, msg="OK", data={})


@router.put("/cards/{card_id}", response_model=ResponseBase[dict])
async def update_card(
    card_id: UUID,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Update a card (prompt, duration, etc.)."""
    # TODO: Implement in Task 2.3
    return ResponseBase(code=200, msg="OK", data={})


@router.post("/projects/{project_id}/import-excel", response_model=ResponseBase[dict])
async def import_excel(
    project_id: UUID,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Import prompts from Excel file."""
    # TODO: Implement in Task 3.2
    return ResponseBase(code=200, msg="OK", data={})


@router.post("/projects/{project_id}/generate", response_model=ResponseBase[dict])
async def start_generation(
    project_id: UUID,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Start batch video generation."""
    # TODO: Implement in Task 5.2
    return ResponseBase(code=200, msg="OK", data={})
```

**Step 1: 创建文件**

**Step 2: 注册路由**

Modify: `fastapi_backend/app/api/v1/__init__.py`

```python
# Add import
from app.api.v1 import batch_video

# Add router
router.include_router(batch_video.router)
```

**Step 3: 验证API**

访问: `http://localhost:8000/docs`
Expected: 显示 `/batch-video` 相关端点

---

### Task 1.4: 实现后端项目CRUD

**Files:**
- Modify: `fastapi_backend/app/api/v1/batch_video.py`

**Implementation:**

```python
from uuid import uuid4
from datetime import datetime, timezone

from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import JSONB

from app.models import BatchVideoJob, BatchVideoAsset


@router.get("/projects", response_model=ResponseBase[list[dict]])
async def list_projects(
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """List all batch video projects for current user."""
    result = await db.execute(
        select(
            BatchVideoJob.id,
            BatchVideoJob.name,
            BatchVideoJob.status,
            BatchVideoJob.created_at,
            func.count(BatchVideoAsset.id).label("card_count")
        )
        .outerjoin(BatchVideoAsset, BatchVideoAsset.job_id == BatchVideoJob.id)
        .where(BatchVideoJob.user_id == user.id)
        .group_by(BatchVideoJob.id)
        .order_by(BatchVideoJob.created_at.desc())
    )
    
    projects = []
    for row in result:
        projects.append({
            "id": str(row.id),
            "name": row.name,
            "status": row.status,
            "created_at": row.created_at.isoformat(),
            "card_count": row.card_count or 0,
        })
    
    return ResponseBase(code=200, msg="OK", data=projects)


@router.post("/projects", response_model=ResponseBase[dict])
async def create_project(
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Create a new batch video project."""
    project = BatchVideoJob(
        id=uuid4(),
        user_id=user.id,
        name=payload.get("name", "未命名项目"),
        status="draft",
        config={"grid_mode": "16:9", "default_duration": 3},
    )
    db.add(project)
    await db.commit()
    
    return ResponseBase(code=200, msg="OK", data={
        "id": str(project.id),
        "name": project.name,
        "status": project.status,
    })


@router.get("/projects/{project_id}", response_model=ResponseBase[dict])
async def get_project(
    project_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Get project details."""
    result = await db.execute(
        select(BatchVideoJob).where(
            BatchVideoJob.id == project_id,
            BatchVideoJob.user_id == user.id
        )
    )
    project = result.scalar_one_or_none()
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Count cards
    cards_result = await db.execute(
        select(func.count(BatchVideoAsset.id)).where(
            BatchVideoAsset.job_id == project_id
        )
    )
    card_count = cards_result.scalar() or 0
    
    return ResponseBase(code=200, msg="OK", data={
        "id": str(project.id),
        "name": project.name,
        "status": project.status,
        "config": project.config or {},
        "card_count": card_count,
        "created_at": project.created_at.isoformat(),
    })
```

**Step 1: 修改文件**

**Step 2: 测试API**

```bash
curl -X POST http://localhost:8000/api/batch-video/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"name": "测试项目"}'
```
Expected: 返回创建的项目ID

---

## 阶段2: 分镜Card管理

### Task 2.1: 创建图片上传+切割组件

**Files:**
- Create: `nextjs-frontend/components/batch-video/ImageUploader.tsx`

**Implementation:**

```typescript
'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, Grid3X3, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

type GridMode = '16:9' | '9:16' | 'original';

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  mode: GridMode;
}

interface ImageUploaderProps {
  onImagesProcessed: (images: Array<{ id: string; dataUrl: string; index: number }>) => void;
  projectId: string;
}

export default function ImageUploader({ onImagesProcessed, projectId }: ImageUploaderProps) {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [processing, setProcessing] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newImages = acceptedFiles.map((file) => ({
      id: Math.random().toString(36).substr(2, 9),
      file,
      preview: URL.createObjectURL(file),
      mode: '16:9' as GridMode,
    }));
    setImages((prev) => [...prev, ...newImages]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    multiple: true,
  });

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const updateMode = (id: string, mode: GridMode) => {
    setImages((prev) =>
      prev.map((img) => (img.id === id ? { ...img, mode } : img))
    );
  };

  const splitImage = async (image: UploadedImage): Promise<Array<{ id: string; dataUrl: string; index: number }>> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve([]);

        let cols = 1, rows = 1;
        if (image.mode === '16:9') { cols = 3; rows = 3; }
        else if (image.mode === '9:16') { cols = 2; rows = 2; }

        const cellWidth = img.width / cols;
        const cellHeight = img.height / rows;
        canvas.width = cellWidth;
        canvas.height = cellHeight;

        const splits: Array<{ id: string; dataUrl: string; index: number }> = [];
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            ctx.clearRect(0, 0, cellWidth, cellHeight);
            ctx.drawImage(
              img,
              c * cellWidth, r * cellHeight, cellWidth, cellHeight,
              0, 0, cellWidth, cellHeight
            );
            splits.push({
              id: Math.random().toString(36).substr(2, 9),
              dataUrl: canvas.toDataURL('image/jpeg', 0.9),
              index: r * cols + c,
            });
          }
        }
        resolve(splits);
      };
      img.src = image.preview;
    });
  };

  const processImages = async () => {
    if (images.length === 0) return;
    setProcessing(true);

    try {
      const allCards: Array<{ id: string; dataUrl: string; index: number }> = [];
      
      for (const image of images) {
        if (image.mode === 'original') {
          // 直接导入，不切割
          const dataUrl = await fileToDataUrl(image.file);
          allCards.push({
            id: Math.random().toString(36).substr(2, 9),
            dataUrl,
            index: 0,
          });
        } else {
          // 切割
          const splits = await splitImage(image);
          allCards.push(...splits);
        }
      }

      onImagesProcessed(allCards);
      setImages([]);
    } catch (err) {
      console.error('Processing failed:', err);
      alert('处理图片失败');
    } finally {
      setProcessing(false);
    }
  };

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    });
  };

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
          isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
        )}
      >
        <input {...getInputProps()} />
        <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-lg font-medium">拖拽图片到此处</p>
        <p className="text-sm text-muted-foreground mt-1">
          或点击选择文件，支持批量上传
        </p>
      </div>

      {/* Image List */}
      {images.length > 0 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {images.map((image) => (
              <div key={image.id} className="relative group">
                <div className="aspect-video rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={image.preview}
                    alt="Preview"
                    className="w-full h-full object-cover"
                  />
                </div>
                <button
                  onClick={() => removeImage(image.id)}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={14} />
                </button>
                <ToggleGroup
                  type="single"
                  value={image.mode}
                  onValueChange={(v) => v && updateMode(image.id, v as GridMode)}
                  className="mt-2 justify-center"
                >
                  <ToggleGroupItem value="16:9" size="sm" className="text-xs">
                    <Grid3X3 size={14} className="mr-1" />
                    3×3
                  </ToggleGroupItem>
                  <ToggleGroupItem value="9:16" size="sm" className="text-xs">
                    <Grid3X3 size={14} className="mr-1" />
                    2×2
                  </ToggleGroupItem>
                  <ToggleGroupItem value="original" size="sm" className="text-xs">
                    <ImageIcon size={14} className="mr-1" />
                    原图
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setImages([])}>
              清空
            </Button>
            <Button onClick={processImages} disabled={processing}>
              {processing ? '处理中...' : `导入 ${images.length} 张图片`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Dependencies:**

```bash
cd nextjs-frontend
npm install react-dropzone
```

**Step 1: 安装依赖**

**Step 2: 创建组件**

**Step 3: 测试图片上传**

在分镜管理Tab中引入组件，测试拖拽上传和切割功能。

---

### Task 2.2: 实现后端Card创建API

**Files:**
- Modify: `fastapi_backend/app/api/v1/batch_video.py`

**Implementation:**

```python
import base64
import re
from io import BytesIO

from app.services.storage.vfs_service import vfs_service
from app.models import FileNode

DATA_URL_PATTERN = re.compile(r'^data:image/([^;]+);base64,(.+)$')


def parse_data_url(data_url: str) -> tuple[str, bytes] | None:
    """Parse data URL and return (mime_type, bytes)."""
    match = DATA_URL_PATTERN.match(data_url)
    if not match:
        return None
    mime_type = f"image/{match.group(1)}"
    try:
        data = base64.b64decode(match.group(2))
        return mime_type, data
    except Exception:
        return None


@router.post("/projects/{project_id}/cards", response_model=ResponseBase[dict])
async def create_cards(
    project_id: UUID,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Create cards from uploaded images."""
    # Verify project exists and belongs to user
    result = await db.execute(
        select(BatchVideoJob).where(
            BatchVideoJob.id == project_id,
            BatchVideoJob.user_id == user.id
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    images = payload.get("images", [])
    if not images:
        raise HTTPException(status_code=400, detail="No images provided")
    
    # Get or create project folder in VFS
    vfs_result = await db.execute(
        select(FileNode).where(
            FileNode.name == f"batch-video-{project_id}",
            FileNode.is_folder.is_(True),
        )
    )
    folder = vfs_result.scalar_one_or_none()
    
    if not folder:
        from app.services.storage.vfs_service import get_or_create_user_ai_folder
        user_ai_folder = await get_or_create_user_ai_folder(db=db, user_id=user.id)
        folder = await vfs_service.create_folder(
            db=db,
            user_id=user.id,
            name=f"batch-video-{project_id}",
            parent_id=user_ai_folder.id,
        )
    
    # Get current max index
    index_result = await db.execute(
        select(func.coalesce(func.max(BatchVideoAsset.index), -1)).where(
            BatchVideoAsset.job_id == project_id
        )
    )
    start_index = index_result.scalar() + 1
    
    created_cards = []
    
    for i, img_data in enumerate(images):
        data_url = img_data.get("dataUrl")
        if not data_url:
            continue
        
        parsed = parse_data_url(data_url)
        if not parsed:
            continue
        
        mime_type, image_bytes = parsed
        ext = mime_type.split('/')[-1] or 'jpg'
        
        # Save to VFS
        filename = f"card-{start_index + i}.{ext}"
        file_node = await vfs_service.create_bytes_file(
            db=db,
            user_id=user.id,
            name=filename,
            data=image_bytes,
            content_type=mime_type,
            parent_id=folder.id,
        )
        
        # Create card record
        card = BatchVideoAsset(
            id=uuid4(),
            job_id=project_id,
            index=start_index + i,
            source_url=f"/api/vfs/nodes/{file_node.id}/content",
            prompt="",
            duration=3,
            status="pending",
        )
        db.add(card)
        
        created_cards.append({
            "id": str(card.id),
            "index": card.index,
            "source_url": card.source_url,
        })
    
    # Update project status
    project.status = "draft"
    project.updated_at = datetime.now(timezone.utc)
    
    await db.commit()
    
    return ResponseBase(code=200, msg="OK", data={
        "created_count": len(created_cards),
        "cards": created_cards,
    })
```

**Step 1: 修改文件**

**Step 2: 测试API**

```bash
curl -X POST http://localhost:8000/api/batch-video/projects/{project_id}/cards \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {token}" \
  -d '{"images": [{"dataUrl": "data:image/jpeg;base64,/9j/4AAQ..."}]}'
```
Expected: 返回创建的card列表

---

### Task 2.3: 创建Card网格组件

**Files:**
- Create: `nextjs-frontend/components/batch-video/CardGrid.tsx`

**Implementation:**

```typescript
'use client';

import { useState, useCallback } from 'react';
import { Check, Trash2, Clock, Play, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface StoryboardCard {
  id: string;
  index: number;
  source_url: string;
  prompt: string;
  duration: number;
  selected: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result_url?: string;
}

interface CardGridProps {
  cards: StoryboardCard[];
  onUpdateCard: (id: string, updates: Partial<StoryboardCard>) => void;
  onDeleteCard: (id: string) => void;
  onSelectionChange: (ids: string[]) => void;
}

export default function CardGrid({
  cards,
  onUpdateCard,
  onDeleteCard,
  onSelectionChange,
}: CardGridProps) {
  const [editingCard, setEditingCard] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    const card = cards.find((c) => c.id === id);
    if (card) {
      onUpdateCard(id, { selected: !card.selected });
    }
  };

  const selectAll = () => {
    cards.forEach((card) => {
      if (!card.selected) onUpdateCard(card.id, { selected: true });
    });
  };

  const deselectAll = () => {
    cards.forEach((card) => {
      if (card.selected) onUpdateCard(card.id, { selected: false });
    });
  };

  const selectedCount = cards.filter((c) => c.selected).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            共 {cards.length} 个分镜
          </span>
          {selectedCount > 0 && (
            <span className="text-sm text-primary">
              已选择 {selectedCount} 个
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={selectAll}>
            全选
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>
            取消全选
          </Button>
        </div>
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {cards.map((card) => (
          <CardItem
            key={card.id}
            card={card}
            isEditing={editingCard === card.id}
            onToggleSelect={() => toggleSelect(card.id)}
            onStartEdit={() => setEditingCard(card.id)}
            onEndEdit={() => setEditingCard(null)}
            onUpdate={(updates) => onUpdateCard(card.id, updates)}
            onDelete={() => onDeleteCard(card.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface CardItemProps {
  card: StoryboardCard;
  isEditing: boolean;
  onToggleSelect: () => void;
  onStartEdit: () => void;
  onEndEdit: () => void;
  onUpdate: (updates: Partial<StoryboardCard>) => void;
  onDelete: () => void;
}

function CardItem({
  card,
  isEditing,
  onToggleSelect,
  onStartEdit,
  onEndEdit,
  onUpdate,
  onDelete,
}: CardItemProps) {
  const [localPrompt, setLocalPrompt] = useState(card.prompt);
  const [localDuration, setLocalDuration] = useState(card.duration);

  const saveChanges = () => {
    onUpdate({ prompt: localPrompt, duration: localDuration });
    onEndEdit();
  };

  const getStatusIcon = () => {
    switch (card.status) {
      case 'completed':
        return <Check size={14} className="text-green-600" />;
      case 'processing':
        return <Clock size={14} className="text-blue-600 animate-pulse" />;
      case 'failed':
        return <Play size={14} className="text-red-600" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        'relative border rounded-xl overflow-hidden bg-card transition-all',
        card.selected && 'ring-2 ring-primary',
        card.status === 'completed' && 'border-green-500/30',
        card.status === 'processing' && 'border-blue-500/30'
      )}
    >
      {/* Selection Checkbox */}
      <button
        onClick={onToggleSelect}
        className={cn(
          'absolute top-2 left-2 z-10 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
          card.selected
            ? 'bg-primary border-primary text-primary-foreground'
            : 'bg-background/80 border-border hover:border-primary'
        )}
      >
        {card.selected && <Check size={14} />}
      </button>

      {/* Delete Button */}
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-background/80 border border-border opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-destructive"
      >
        <Trash2 size={14} />
      </button>

      {/* Index Badge */}
      <div className="absolute bottom-2 left-2 z-10 px-2 py-1 rounded-full bg-background/90 text-xs font-mono">
        #{card.index + 1}
      </div>

      {/* Status Icon */}
      {getStatusIcon() && (
        <div className="absolute bottom-2 right-2 z-10 w-6 h-6 rounded-full bg-background/90 flex items-center justify-center">
          {getStatusIcon()}
        </div>
      )}

      {/* Image */}
      <div className="aspect-video bg-muted">
        {card.result_url ? (
          <video
            src={card.result_url}
            className="w-full h-full object-cover"
            controls
          />
        ) : (
          <img
            src={card.source_url}
            alt={`Card ${card.index + 1}`}
            className="w-full h-full object-cover"
          />
        )}
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {isEditing ? (
          <>
            <Textarea
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
              placeholder="输入视频生成提示词..."
              className="min-h-[80px] text-xs"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={localDuration}
                onChange={(e) => setLocalDuration(parseInt(e.target.value) || 3)}
                min={1}
                max={10}
                className="w-20 text-xs"
              />
              <span className="text-xs text-muted-foreground">秒</span>
              <Button size="sm" className="ml-auto" onClick={saveChanges}>
                保存
              </Button>
            </div>
          </>
        ) : (
          <>
            <p
              className="text-xs text-muted-foreground line-clamp-3 min-h-[60px] cursor-pointer hover:text-foreground"
              onClick={onStartEdit}
            >
              {card.prompt || <span className="italic">点击编辑提示词...</span>}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {card.duration}秒
              </span>
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={onStartEdit}>
                编辑
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

**Step 1: 创建组件**

**Step 2: 集成到CardsTab**

---

### Task 2.4: 实现完整的分镜管理Tab

**Files:**
- Modify: `nextjs-frontend/app/(studio)/batch-video/[projectId]/page.tsx`

**Implementation:**

```typescript
// 在 page.tsx 中替换 CardsTab 组件

function CardsTab({ projectId }: { projectId: string }) {
  const [cards, setCards] = useState<StoryboardCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploader, setShowUploader] = useState(false);

  useEffect(() => {
    fetchCards();
  }, [projectId]);

  const fetchCards = async () => {
    try {
      const res = await fetch(`/api/batch-video/projects/${projectId}/cards`);
      const data = await res.json();
      if (data.data) {
        setCards(data.data.map((c: any) => ({ ...c, selected: false })));
      }
    } catch (err) {
      console.error('Failed to fetch cards:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleImagesProcessed = async (images: Array<{ id: string; dataUrl: string; index: number }>) => {
    try {
      const res = await fetch(`/api/batch-video/projects/${projectId}/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      });
      if (res.ok) {
        fetchCards();
        setShowUploader(false);
      }
    } catch (err) {
      console.error('Failed to create cards:', err);
      alert('创建分镜失败');
    }
  };

  const updateCard = async (id: string, updates: Partial<StoryboardCard>) => {
    // Optimistic update
    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );

    // Persist to backend
    try {
      await fetch(`/api/batch-video/cards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (err) {
      console.error('Failed to update card:', err);
    }
  };

  const deleteCard = async (id: string) => {
    if (!confirm('确定删除此分镜?')) return;
    
    try {
      await fetch(`/api/batch-video/cards/${id}`, { method: 'DELETE' });
      setCards((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Failed to delete card:', err);
    }
  };

  if (loading) {
    return <div className="text-center py-20">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      {!showUploader && cards.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-xl">
          <ImageIcon className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground mb-4">暂无分镜，请先导入图片</p>
          <Button onClick={() => setShowUploader(true)}>
            <Upload className="w-4 h-4 mr-2" />
            导入图片
          </Button>
        </div>
      ) : (
        <>
          {showUploader && (
            <div className="border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">导入图片</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowUploader(false)}>
                  完成
                </Button>
              </div>
              <ImageUploader
                projectId={projectId}
                onImagesProcessed={handleImagesProcessed}
              />
            </div>
          )}

          {cards.length > 0 && (
            <CardGrid
              cards={cards}
              onUpdateCard={updateCard}
              onDeleteCard={deleteCard}
              onSelectionChange={(ids) => console.log('Selected:', ids)}
            />
          )}
        </>
      )}
    </div>
  );
}
```

**Step 1: 修改文件并添加必要的imports**

**Step 2: 验证分镜管理功能**

Expected: 可以上传图片、切割、显示Card网格、编辑提示词

---

## 阶段3: Excel脚本导入

### Task 3.1: 安装Excel解析库

**Files:**
- Modify: `nextjs-frontend/package.json`

**Step 1: 安装依赖**

```bash
cd nextjs-frontend
npm install xlsx
```

---

### Task 3.2: 创建Excel导入组件

**Files:**
- Create: `nextjs-frontend/components/batch-video/ExcelImporter.tsx`

**Implementation:**

```typescript
'use client';

import { useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileSpreadsheet, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface ExcelImporterProps {
  onImport: (mapping: { indexColumn: string; promptColumn: string; data: any[] }) => void;
  cardCount: number;
}

export default function ExcelImporter({ onImport, cardCount }: ExcelImporterProps) {
  const [columns, setColumns] = useState<string[]>([]);
  const [data, setData] = useState<any[]>([]);
  const [indexColumn, setIndexColumn] = useState('');
  const [promptColumn, setPromptColumn] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Get raw data with headers
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (rawData.length < 2) {
          alert('Excel文件至少需要包含标题行和一行数据');
          return;
        }

        const headers = rawData[0].map((h, i) => String(h || `列 ${i + 1}`));
        const rows = rawData.slice(1).map((row, rowIndex) => {
          const obj: any = { '系统序号': rowIndex + 1 };
          headers.forEach((h, i) => {
            obj[h] = row[i] !== undefined ? row[i] : '';
          });
          return obj;
        });

        setColumns(['系统序号', ...headers]);
        setData(rows);
        
        // Auto-detect columns
        const indexCol = headers.find(h => h.includes('序号') || h.includes('Index') || h.includes('编号')) || '系统序号';
        const promptCol = headers.find(h => h.includes('提示词') || h.includes('Prompt') || h.includes('描述')) || headers[0];
        
        setIndexColumn(indexCol);
        setPromptColumn(promptCol);
        setPreviewOpen(true);
      } catch (err) {
        console.error('Failed to parse Excel:', err);
        alert('解析Excel失败');
      }
    };
    reader.readAsBinaryString(file);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false,
  });

  const handleApply = () => {
    if (!indexColumn || !promptColumn) {
      alert('请选择序号列和提示词列');
      return;
    }
    onImport({ indexColumn, promptColumn, data });
    setPreviewOpen(false);
    setData([]);
    setColumns([]);
  };

  const matchedCount = data.filter(row => {
    const idx = parseInt(String(row[indexColumn]));
    return idx >= 1 && idx <= cardCount;
  }).length;

  return (
    <div className="space-y-4">
      {!previewOpen ? (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
            isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
          )}
        >
          <input {...getInputProps()} />
          <FileSpreadsheet className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-lg font-medium">拖拽Excel文件到此处</p>
          <p className="text-sm text-muted-foreground mt-1">
            支持 .xlsx 和 .xls 格式
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              系统将根据"序号列"的值匹配分镜（从1开始）。当前有 {cardCount} 个分镜，可匹配 {matchedCount} 条数据。
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">序号列</label>
              <Select value={indexColumn} onValueChange={setIndexColumn}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((col) => (
                    <SelectItem key={col} value={col}>{col}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">提示词列</label>
              <Select value={promptColumn} onValueChange={setPromptColumn}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((col) => (
                    <SelectItem key={col} value={col}>{col}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {columns.slice(0, 5).map((col) => (
                    <TableHead key={col}>{col}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.slice(0, 10).map((row, idx) => (
                  <TableRow key={idx}>
                    {columns.slice(0, 5).map((col) => (
                      <TableCell key={col} className="max-w-[200px] truncate">
                        {String(row[col])}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {data.length > 10 && (
              <div className="p-2 text-center text-sm text-muted-foreground">
                还有 {data.length - 10} 行数据...
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              重新选择
            </Button>
            <Button onClick={handleApply}>
              <Check className="w-4 h-4 mr-2" />
              应用导入 ({matchedCount} 条)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 1: 创建组件**

---

### Task 3.3: 实现后端Excel导入API

**Files:**
- Modify: `fastapi_backend/app/api/v1/batch_video.py`

**Implementation:**

```python
@router.post("/projects/{project_id}/import-excel", response_model=ResponseBase[dict])
async def import_excel(
    project_id: UUID,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Import prompts from Excel mapping."""
    # Verify project
    result = await db.execute(
        select(BatchVideoJob).where(
            BatchVideoJob.id == project_id,
            BatchVideoJob.user_id == user.id
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    index_column = payload.get("indexColumn")
    prompt_column = payload.get("promptColumn")
    data = payload.get("data", [])
    
    if not index_column or not prompt_column:
        raise HTTPException(status_code=400, detail="Missing column mapping")
    
    # Get all cards for this project
    result = await db.execute(
        select(BatchVideoAsset).where(
            BatchVideoAsset.job_id == project_id
        )
    )
    cards = {card.index: card for card in result.scalars().all()}
    
    updated_count = 0
    
    for row in data:
        try:
            # Excel序号通常是1-based
            idx = int(str(row.get(index_column, ''))) - 1
            prompt = str(row.get(prompt_column, ''))
            
            if idx in cards and prompt:
                card = cards[idx]
                card.prompt = prompt
                updated_count += 1
        except (ValueError, TypeError):
            continue
    
    await db.commit()
    
    return ResponseBase(code=200, msg="OK", data={
        "updated_count": updated_count,
        "total_rows": len(data),
    })
```

**Step 1: 添加API端点**

**Step 2: 测试Excel导入**

---

### Task 3.4: 实现脚本导入Tab

**Files:**
- Modify: `nextjs-frontend/app/(studio)/batch-video/[projectId]/page.tsx`

**Implementation:**

```typescript
function ScriptTab({ projectId }: { projectId: string }) {
  const [cards, setCards] = useState<StoryboardCard[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    fetchCards();
  }, [projectId]);

  const fetchCards = async () => {
    const res = await fetch(`/api/batch-video/projects/${projectId}/cards`);
    const data = await res.json();
    if (data.data) {
      setCards(data.data);
    }
  };

  const handleImport = async (mapping: { indexColumn: string; promptColumn: string; data: any[] }) => {
    setImporting(true);
    try {
      const res = await fetch(`/api/batch-video/projects/${projectId}/import-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapping),
      });
      const data = await res.json();
      if (data.data) {
        alert(`成功更新 ${data.data.updated_count} 个分镜的提示词`);
        fetchCards();
      }
    } catch (err) {
      console.error('Import failed:', err);
      alert('导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-medium mb-2">导入分镜脚本</h2>
        <p className="text-sm text-muted-foreground">
          上传包含分镜描述的Excel文件，系统将自动匹配到对应的分镜
        </p>
      </div>

      <ExcelImporter onImport={handleImport} cardCount={cards.length} />

      {cards.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium mb-2">当前分镜</h3>
          <p className="text-sm text-muted-foreground">
            共 {cards.length} 个分镜，序号从 1 到 {cards.length}
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 1: 修改文件**

**Step 2: 验证Excel导入流程**

Expected: 可以上传Excel、选择列映射、预览数据、应用导入

---

## 阶段4: 提示词润色

### Task 4.1: 复用提示词库组件

**Files:**
- 复用: `nextjs-frontend/components/canvas/PromptTemplateModal.tsx`

**说明:**
该组件已完全满足需求，支持：
- 双面板布局（左侧分组、右侧模板）
- 搜索、筛选、CRUD操作
- tool_key过滤

**使用方式:**

```typescript
import PromptTemplateModal from '@/components/canvas/PromptTemplateModal';

// 在润色功能中使用
<PromptTemplateModal
  open={showPolishModal}
  toolKey="batch_video_polish"
  onClose={() => setShowPolishModal(false)}
  onSelect={(preset) => applyPolishMode(preset)}
/>
```

---

### Task 4.2: 创建批量润色组件

**Files:**
- Create: `nextjs-frontend/components/batch-video/BatchPolish.tsx`

**Implementation:**

```typescript
'use client';

import { useState } from 'react';
import { Wand2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PromptTemplateModal from '@/components/canvas/PromptTemplateModal';

interface BatchPolishProps {
  selectedCards: Array<{ id: string; prompt: string }>;
  onPolishComplete: (results: Array<{ id: string; prompt: string }>) => void;
}

export default function BatchPolish({ selectedCards, onPolishComplete }: BatchPolishProps) {
  const [polishing, setPolishing] = useState(false);
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(
    '你是一个专业的视频提示词润色专家。请将以下描述润色，使其更加生动、具有电影感。'
  );
  const [progress, setProgress] = useState(0);

  const handlePolish = async () => {
    if (selectedCards.length === 0) return;
    
    setPolishing(true);
    setProgress(0);
    
    const results: Array<{ id: string; prompt: string }> = [];
    
    for (let i = 0; i < selectedCards.length; i++) {
      const card = selectedCards[i];
      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `请润色以下视频描述：\n\n${card.prompt || '默认视频描述'}` }
            ],
            model: 'gemini-3-flash-preview',
          }),
        });
        
        const data = await res.json();
        const polishedPrompt = data.data?.content || card.prompt;
        
        results.push({ id: card.id, prompt: polishedPrompt });
      } catch (err) {
        console.error('Polish failed for card:', card.id, err);
        results.push({ id: card.id, prompt: card.prompt });
      }
      
      setProgress(Math.round(((i + 1) / selectedCards.length) * 100));
    }
    
    setPolishing(false);
    onPolishComplete(results);
  };

  if (selectedCards.length === 0) {
    return null;
  }

  return (
    <>
      <div className="flex items-center gap-4 p-4 border rounded-xl bg-muted/50">
        <div className="flex-1">
          <h4 className="font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            批量润色 ({selectedCards.length} 个分镜)
          </h4>
          <p className="text-sm text-muted-foreground mt-1">
            使用AI润色选中的分镜提示词
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setShowPresetModal(true)}
          disabled={polishing}
        >
          选择润色模式
        </Button>
        <Button
          onClick={handlePolish}
          disabled={polishing}
          className="gap-2"
        >
          {polishing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {progress}%
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4" />
              开始润色
            </>
          )}
        </Button>
      </div>

      <PromptTemplateModal
        open={showPresetModal}
        toolKey="batch_video_polish"
        onClose={() => setShowPresetModal(false)}
        onSelect={(preset) => {
          setSystemPrompt(preset.prompt_template);
          setShowPresetModal(false);
        }}
      />
    </>
  );
}
```

**Step 1: 创建组件**

---

### Task 4.3: 后端创建润色提示词API

**Files:**
- 复用现有: `fastapi_backend/app/api/v1/ai_prompt_presets.py`

**说明:**
前端使用 `tool_key = 'batch_video_polish'` 即可，无需后端修改。
用户可以在设置中创建和管理润色模板。

---

## 阶段5: 视频生成

### Task 5.1: 创建生成配置弹窗

**Files:**
- Create: `nextjs-frontend/components/batch-video/GenerateConfigModal.tsx`

参考UI图片设计（圆角、简洁风格）

```typescript
'use client';

import { useState } from 'react';
import { X, Play, Sliders } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface GenerateConfig {
  model: string;
  resolution: '540p' | '720p' | '1080p';
  duration: number;
  offPeak: boolean;
  bgm: boolean;
  watermark: boolean;
}

interface GenerateConfigModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: GenerateConfig) => void;
  selectedCount: number;
}

const MODELS = [
  { id: 'vidu-q3-pro', name: 'Vidu Q3 Pro' },
  { id: 'vidu-q3-turbo', name: 'Vidu Q3 Turbo' },
  { id: 'vidu-q2-pro', name: 'Vidu Q2 Pro' },
];

export default function GenerateConfigModal({
  open,
  onClose,
  onConfirm,
  selectedCount,
}: GenerateConfigModalProps) {
  const [config, setConfig] = useState<GenerateConfig>({
    model: 'vidu-q3-pro',
    resolution: '720p',
    duration: 3,
    offPeak: false,
    bgm: false,
    watermark: false,
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sliders className="w-5 h-5" />
            批量生成配置
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Selected Cards Preview */}
          <div className="bg-muted/50 rounded-lg p-4">
            <p className="text-sm text-muted-foreground">已选择</p>
            <p className="text-2xl font-semibold">{selectedCount} 个分镜</p>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium">视频模型</label>
            <Select
              value={config.model}
              onValueChange={(v) => setConfig({ ...config, model: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Resolution */}
          <div className="space-y-2">
            <label className="text-sm font-medium">输出分辨率</label>
            <div className="flex gap-2">
              {(['540p', '720p', '1080p'] as const).map((res) => (
                <button
                  key={res}
                  onClick={() => setConfig({ ...config, resolution: res })}
                  className={cn(
                    'flex-1 py-2 rounded-lg border text-sm font-medium transition-colors',
                    config.resolution === res
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted'
                  )}
                >
                  {res}
                </button>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">生成时长</label>
              <span className="text-sm font-semibold">{config.duration}s</span>
            </div>
            <Slider
              value={[config.duration]}
              onValueChange={([v]) => setConfig({ ...config, duration: v })}
              min={1}
              max={10}
              step={1}
            />
            <p className="text-xs text-muted-foreground">
              范围: 1s - 10s (默认 3s)
            </p>
          </div>

          {/* Advanced Options */}
          <div className="space-y-4 border-t pt-4">
            <h4 className="text-sm font-medium text-muted-foreground">高级选项</h4>
            
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">错峰模式</p>
                <p className="text-xs text-muted-foreground">非高峰时段生成，成本更低</p>
              </div>
              <Switch
                checked={config.offPeak}
                onCheckedChange={(v) => setConfig({ ...config, offPeak: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">背景音乐</p>
                <p className="text-xs text-muted-foreground">自动生成匹配的背景音乐</p>
              </div>
              <Switch
                checked={config.bgm}
                onCheckedChange={(v) => setConfig({ ...config, bgm: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">添加水印</p>
                <p className="text-xs text-muted-foreground">在视频角落添加水印</p>
              </div>
              <Switch
                checked={config.watermark}
                onCheckedChange={(v) => setConfig({ ...config, watermark: v })}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              取消
            </Button>
            <Button
              className="flex-1 gap-2"
              onClick={() => onConfirm(config)}
            >
              <Play className="w-4 h-4" />
              确认并开始批量生成
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 1: 创建组件**

---

### Task 5.2: 实现后端生成API

**Files:**
- Modify: `fastapi_backend/app/api/v1/batch_video.py`

**Implementation:**

```python
from app.services.task_service import task_service
from app.schemas import TaskCreateRequest


@router.post("/projects/{project_id}/generate", response_model=ResponseBase[dict])
async def start_generation(
    project_id: UUID,
    payload: dict[str, Any],
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Start batch video generation."""
    # Verify project
    result = await db.execute(
        select(BatchVideoJob).where(
            BatchVideoJob.id == project_id,
            BatchVideoJob.user_id == user.id
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    card_ids = payload.get("cardIds", [])
    config = payload.get("config", {})
    
    if not card_ids:
        raise HTTPException(status_code=400, detail="No cards selected")
    
    # Get cards
    result = await db.execute(
        select(BatchVideoAsset).where(
            BatchVideoAsset.job_id == project_id,
            BatchVideoAsset.id.in_(card_ids)
        )
    )
    cards = result.scalars().all()
    
    # Update project status
    project.status = "processing"
    project.updated_at = datetime.now(timezone.utc)
    await db.commit()
    
    # Create tasks for each card
    created_tasks = []
    for card in cards:
        task = await task_service.create_task(
            db=db,
            user_id=user.id,
            payload=TaskCreateRequest(
                type="batch_video_asset_generate",
                entity_type="batch_video_asset",
                entity_id=card.id,
                input_json={
                    "job_id": str(project_id),
                    "asset_id": str(card.id),
                    "source_url": card.source_url,
                    "prompt": card.prompt or "High quality cinematic video",
                    "config": {
                        "duration": config.get("duration", 3),
                        "resolution": config.get("resolution", "720p"),
                        "model": config.get("model", "vidu-q3-pro"),
                        "off_peak": config.get("offPeak", False),
                        "bgm": config.get("bgm", False),
                        "watermark": config.get("watermark", False),
                    }
                }
            )
        )
        
        # Update card status
        card.status = "processing"
        card.task_id = task.id
        
        created_tasks.append({
            "card_id": str(card.id),
            "task_id": str(task.id),
        })
    
    await db.commit()
    
    return ResponseBase(code=200, msg="OK", data={
        "created_tasks": len(created_tasks),
        "tasks": created_tasks,
    })
```

**Step 1: 实现生成API**

---

### Task 5.3: 实现视频生成Tab

**Files:**
- Modify: `nextjs-frontend/app/(studio)/batch-video/[projectId]/page.tsx`

**Implementation:**

```typescript
function GenerateTab({ projectId }: { projectId: string }) {
  const [cards, setCards] = useState<StoryboardCard[]>([]);
  const [showConfig, setShowConfig] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchCards();
  }, [projectId]);

  const fetchCards = async () => {
    const res = await fetch(`/api/batch-video/projects/${projectId}/cards`);
    const data = await res.json();
    if (data.data) {
      setCards(data.data.map((c: any) => ({ ...c, selected: false })));
    }
  };

  const selectedCards = cards.filter((c) => c.selected);

  const handleGenerate = async (config: any) => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/batch-video/projects/${projectId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardIds: selectedCards.map((c) => c.id),
          config,
        }),
      });
      const data = await res.json();
      if (data.data) {
        alert(`已成功创建 ${data.data.created_tasks} 个生成任务`);
        setShowConfig(false);
        fetchCards();
      }
    } catch (err) {
      console.error('Generation failed:', err);
      alert('生成失败');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Card Selection */}
      <CardGrid
        cards={cards}
        onUpdateCard={(id, updates) => {
          setCards((prev) =>
            prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
          );
        }}
        onDeleteCard={() => {}}
        onSelectionChange={() => {}}
      />

      {/* Batch Actions */}
      {selectedCards.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-background border rounded-full px-6 py-3 shadow-lg">
          <span className="text-sm font-medium">
            已选择 {selectedCards.length} 个分镜
          </span>
          <BatchPolish
            selectedCards={selectedCards}
            onPolishComplete={(results) => {
              setCards((prev) =>
                prev.map((c) => {
                  const result = results.find((r) => r.id === c.id);
                  return result ? { ...c, prompt: result.prompt } : c;
                })
              );
            }}
          />
          <Button
            onClick={() => setShowConfig(true)}
            className="gap-2"
            disabled={generating}
          >
            <Play className="w-4 h-4" />
            开始生成
          </Button>
        </div>
      )}

      <GenerateConfigModal
        open={showConfig}
        onClose={() => setShowConfig(false)}
        onConfirm={handleGenerate}
        selectedCount={selectedCards.length}
      />
    </div>
  );
}
```

**Step 1: 修改文件**

**Step 2: 验证生成流程**

---

## 阶段6: 生成历史

### Task 6.1: 创建历史查看组件

**Files:**
- Create: `nextjs-frontend/components/batch-video/HistoryPanel.tsx`

**Implementation:**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, Check, X, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface VideoHistoryItem {
  id: string;
  asset_id: string;
  task_id: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result_url?: string;
  created_at: string;
  completed_at?: string;
}

interface HistoryPanelProps {
  projectId: string;
}

export default function HistoryPanel({ projectId }: HistoryPanelProps) {
  const [history, setHistory] = useState<VideoHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      const res = await fetch(`/api/batch-video/projects/${projectId}/history`);
      const data = await res.json();
      if (data.data) {
        setHistory(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [projectId]);

  // Poll for updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (history.some((h) => h.status === 'processing')) {
        fetchHistory();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [history]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <Check className="w-4 h-4 text-green-600" />;
      case 'failed':
        return <X className="w-4 h-4 text-red-600" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-blue-600 animate-pulse" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return <div className="text-center py-20">加载中...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">生成历史</h3>
        <Button variant="outline" size="sm" onClick={fetchHistory}>
          <RefreshCw className="w-4 h-4 mr-2" />
          刷新
        </Button>
      </div>

      {history.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          暂无生成历史
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {history.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(item.status)}
                    <span className={cn(
                      'text-sm font-medium',
                      item.status === 'completed' && 'text-green-600',
                      item.status === 'failed' && 'text-red-600',
                    )}>
                      {item.status === 'completed' ? '已完成' :
                       item.status === 'failed' ? '失败' :
                       item.status === 'processing' ? '生成中' : '等待中'}
                    </span>
                  </div>
                  {item.result_url && (
                    <a
                      href={item.result_url}
                      download
                      className="p-2 hover:bg-muted rounded-full"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  )}
                </div>

                {item.result_url && item.status === 'completed' ? (
                  <video
                    src={item.result_url}
                    className="w-full aspect-video rounded-lg bg-muted"
                    controls
                  />
                ) : (
                  <div className="w-full aspect-video rounded-lg bg-muted flex items-center justify-center">
                    {item.status === 'processing' ? (
                      <div className="flex flex-col items-center gap-2">
                        <Clock className="w-8 h-8 text-muted-foreground animate-pulse" />
                        <span className="text-sm text-muted-foreground">生成中...</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">视频预览</span>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground line-clamp-2">
                  {item.prompt}
                </p>

                <p className="text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString('zh-CN')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 1: 创建组件**

---

### Task 6.2: 实现后端历史API

**Files:**
- Modify: `fastapi_backend/app/api/v1/batch_video.py`

**Implementation:**

```python
@router.get("/projects/{project_id}/history", response_model=ResponseBase[list[dict]])
async def get_history(
    project_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    """Get generation history for a project."""
    # Verify project
    result = await db.execute(
        select(BatchVideoJob).where(
            BatchVideoJob.id == project_id,
            BatchVideoJob.user_id == user.id
        )
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Get all assets with their tasks
    result = await db.execute(
        select(
            BatchVideoAsset.id,
            BatchVideoAsset.task_id,
            BatchVideoAsset.prompt,
            BatchVideoAsset.status,
            BatchVideoAsset.result_url,
            BatchVideoAsset.created_at,
            Task.finished_at,
        )
        .outerjoin(Task, Task.id == BatchVideoAsset.task_id)
        .where(BatchVideoAsset.job_id == project_id)
        .order_by(BatchVideoAsset.created_at.desc())
    )
    
    history = []
    for row in result:
        history.append({
            "id": str(row.id),
            "asset_id": str(row.id),
            "task_id": str(row.task_id) if row.task_id else None,
            "prompt": row.prompt,
            "status": row.status,
            "result_url": row.result_url,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "completed_at": row.finished_at.isoformat() if row.finished_at else None,
        })
    
    return ResponseBase(code=200, msg="OK", data=history)
```

**Step 1: 添加API**

**Step 2: 实现HistoryTab**

```typescript
function HistoryTab({ projectId }: { projectId: string }) {
  return <HistoryPanel projectId={projectId} />;
}
```

---

## 阶段7: 集成与测试

### Task 7.1: 添加导航链接

**Files:**
- Modify: `nextjs-frontend/components/aistudio/AppLayout.tsx`

**Implementation:**

在创作工坊导航下添加批量视频入口：

```typescript
// 在导航菜单中添加
{
  label: '批量视频',
  href: '/batch-video',
  icon: Film,
}
```

---

### Task 7.2: 完整功能测试

**测试清单:**

1. **项目列表**
   - [ ] 创建项目
   - [ ] 查看项目列表
   - [ ] 点击进入项目

2. **分镜管理**
   - [ ] 上传图片
   - [ ] 3x3切割
   - [ ] 2x2切割
   - [ ] 原图导入
   - [ ] Card网格显示
   - [ ] 编辑提示词
   - [ ] 编辑时长
   - [ ] 选择/取消选择

3. **脚本导入**
   - [ ] 上传Excel
   - [ ] 列映射
   - [ ] 数据预览
   - [ ] 应用导入

4. **提示词润色**
   - [ ] 选择润色模式
   - [ ] 批量润色
   - [ ] 查看结果

5. **视频生成**
   - [ ] 选择分镜
   - [ ] 配置生成参数
   - [ ] 提交生成任务
   - [ ] 查看任务状态

6. **历史查看**
   - [ ] 查看生成历史
   - [ ] 视频预览
   - [ ] 下载视频

---

## 总结

本计划包含 **7个阶段、35个任务**，预计开发时间 **3-5天**。

**关键依赖:**
- 复用 `PromptTemplateModal` 组件
- 复用 `BatchVideoAssetGenerateHandler` 任务处理器
- 复用现有AI Gateway和任务系统

**下一步行动:**
1. 创建 worktree 开始实施
2. 使用 `superpowers:executing-plans` 按任务执行
3. 每个Task完成后立即测试验证

---

*Plan generated by writing-plans skill*
*Target: docs/plans/2026-03-15-batch-video-implementation.md*
