# Refactoring Plan for Large Files (2026-02-23)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Reduce line count of identified large files (>500 lines) by extracting components, hooks, and modules, improving maintainability without changing behavior.

**Architecture:**
- **Frontend:** Extract UI sections into `_components/`, logic into `hooks/`, and types into `types.ts`.
- **Backend:** Split `models.py` into a package `app/models/` with domain-specific modules. Split `apply_plans.py` into handlers. Group `tools.py` logic.

**Tech Stack:** Next.js (React), FastAPI (Python), SQLAlchemy.

---

## Part 1: Backend Refactoring

### Task 1: Split `app/models.py` (1471 lines)

**Goal:** Break monolithic `models.py` into `app/models/` package.

**Files:**
- Create: `app/models/__init__.py` (exports all models)
- Create: `app/models/base.py` (Base, User, common mixins)
- Create: `app/models/auth.py` (User, Role, Permission)
- Create: `app/models/ai.py` (AIModelConfig, Binding, UsageEvent)
- Create: `app/models/assets.py` (Asset, Variant, Resource)
- Create: `app/models/core.py` (Workspace, Project, FileNode)
- Create: `app/models/content.py` (Script, Episode, Scene, Storyboard)
- Modify: `app/models.py` (Delete content, make it re-export from `app/models/__init__.py` or just redirect imports if possible, but keeping `app/models.py` as a facade is safer for now, or replace it with a directory)

**Step 1: Create directory structure**
- Rename `app/models.py` to `app/models_legacy.py`
- Create `app/models/` directory.

**Step 2: Extract Base and User**
- Create `app/models/base.py` with `Base` and `User` (and `Item` if simple).
- Imports: `sqlalchemy`, `fastapi_users`.

**Step 3: Extract Domains**
- `app/models/ai.py`: `AIModelConfig`, `AIModelBinding`, `AIUsageEvent`, `AIPromptPreset`.
- `app/models/assets.py`: `Asset`, `AssetVariant`, `AssetResource`, `AssetBinding`.
- `app/models/core.py`: `Workspace`, `Project`, `FileNode`, `Task`.
- `app/models/content.py`: `Script`, `Episode`, `Scene`, `Storyboard`.
- `app/models/auth.py`: `Role`, `Permission` (if they exist in models).

**Step 4: Create `__init__.py`**
- Import all models in `app/models/__init__.py`.
- `from .base import Base, User`
- `from .ai import ...`
- Expose `__all__`.

**Step 5: Verify Imports**
- Grep codebase for `from app.models import` and ensure they still work (they should if `__init__.py` exposes them).
- Run server to verify no circular import errors (SQLAlchemy relationships might need string references).

**Step 6: Cleanup**
- Remove `app/models_legacy.py`.

### Task 2: Refactor `app/api/v1/apply_plans.py` (818 lines)

**Goal:** Split plan execution logic into separate handlers.

**Files:**
- Create: `app/services/plan_handlers/`
- Create: `app/services/plan_handlers/base.py`
- Create: `app/services/plan_handlers/asset.py` (asset_create, asset_bind)
- Create: `app/services/plan_handlers/storyboard.py` (episode_save, scene_save)
- Modify: `app/api/v1/apply_plans.py` (delegate to handlers)

**Step 1: Create Handler Structure**
- Define interface for plan handlers if needed, or just functions.

**Step 2: Move Logic**
- Move `asset_create` and `asset_bind` logic to `asset.py`.
- Move `episode_save`, `scene_save` logic to `storyboard.py`.

**Step 3: Update `apply_plans.py`**
- Import handlers.
- `apply_plans.py` becomes a router/dispatcher.

### Task 3: Refactor `app/ai_scene_test/tools.py` (905 lines)

**Goal:** Group tools by category.

**Files:**
- Create: `app/ai_scene_test/tools_lib/`
- Create: `app/ai_scene_test/tools_lib/vfs.py`
- Create: `app/ai_scene_test/tools_lib/browser.py`
- Create: `app/ai_scene_test/tools_lib/image.py`
- Modify: `app/ai_scene_test/tools.py` (re-export or use registry)

**Step 1: Identify Categories**
- VFS tools, Browser/Page tools, Image analysis tools.

**Step 2: Extract**
- Move functions to respective files.

**Step 3: Re-export**
- Update `tools.py` to import from new locations and register them.

---

## Part 2: Frontend Refactoring

### Task 4: Refactor `settings/page.tsx` (2861 lines)

**Goal:** Extract tabs into separate components.

**Files:**
- Create: `app/(aistudio)/settings/_tabs/ModelsTab.tsx`
- Create: `app/(aistudio)/settings/_tabs/UsersTab.tsx`
- Create: `app/(aistudio)/settings/_tabs/RolesTab.tsx`
- Create: `app/(aistudio)/settings/_tabs/PermissionsTab.tsx`
- Create: `app/(aistudio)/settings/_tabs/AuditTab.tsx`
- Create: `app/(aistudio)/settings/_tabs/CreditsTab.tsx`
- Create: `app/(aistudio)/settings/_tabs/AgentsTab.tsx`
- Modify: `app/(aistudio)/settings/page.tsx`

**Step 1: Extract Models Tab**
- Move `ModelsSection` usage and related state (`aiModelConfigs`, `activeModelTab` etc.) to `ModelsTab.tsx`.
- Note: Some state might need to be passed down or fetched inside the tab. *Fetching inside the tab is better for performance.*

**Step 2: Extract Other Tabs**
- Repeat for Users, Roles, etc.
- `UsersSection` is already a component, but `page.tsx` holds the state. Move state *into* `UsersSection` or `UsersTab` wrapper.

**Step 3: Simplify `page.tsx`**
- `page.tsx` should only handle Tab switching logic (URL state) and render the active tab component.

### Task 5: Refactor `scripts/page.tsx` (2753 lines)

**Goal:** Extract "Script Editor" and "Script List" views.

**Files:**
- Create: `components/scripts/ScriptList.tsx`
- Create: `components/scripts/ScriptEditor.tsx`
- Create: `components/scripts/ScriptStats.tsx`
- Modify: `app/(aistudio)/scripts/page.tsx`

**Step 1: Analyze State**
- Identify state used for List vs Editor.

**Step 2: Extract ScriptList**
- Move the table/grid of scripts to `ScriptList.tsx`.

**Step 3: Extract ScriptEditor**
- Move the complex editor view (when a script is selected) to `ScriptEditor.tsx`.
- This is likely the bulk of the file.

**Step 4: Extract Sub-components of Editor**
- If `ScriptEditor` is still huge, extract `EpisodeList`, `SceneList`, `DetailPane`.

### Task 6: Refactor `ai-scenes/page.tsx` (2330 lines)

**Goal:** Extract the Chat Interface and Scene Rendering.

**Files:**
- Create: `components/ai-scenes/ChatInterface.tsx`
- Create: `components/ai-scenes/ScenePreview.tsx`
- Create: `components/ai-scenes/SceneList.tsx`
- Modify: `app/(aistudio)/ai-scenes/page.tsx`

**Step 1: Extract Chat**
- Move the chat message list and input area to `ChatInterface.tsx`.

**Step 2: Extract Preview**
- Move the right-side preview/canvas to `ScenePreview.tsx`.

**Step 3: Update Page**
- Compose the components.

---

## Execution Handoff

**Plan complete and saved to `docs/plans/2026-02-23-refactoring-large-files.md`.**

**Recommended Approach:**
1. **Subagent-Driven**: I will execute these tasks one by one, verifying after each.
2. **Start with Backend**: `models.py` is the most critical dependency. Refactoring it first ensures stability.
3. **Then Frontend**: Tackle `settings/page.tsx` as it's the largest and most modular (tabs are easy to split).
