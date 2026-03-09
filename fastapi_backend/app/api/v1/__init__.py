from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.asset_bindings import router as asset_bindings_router
from app.api.v1.assets import router as assets_router
from app.api.v1.ai_asset_extraction import router as ai_asset_extraction_router
from app.api.v1.ai_catalog import router as ai_catalog_router
from app.api.v1.ai_image import router as ai_image_router
from app.api.v1.ai_media import router as ai_media_router
from app.api.v1.ai_text import router as ai_text_router
from app.api.v1.ai_video import router as ai_video_router
from app.api.v1.ai_prompt_presets import router as ai_prompt_presets_router
from app.api.v1.ai_model_configs import router as ai_model_configs_router
from app.api.v1.ai_model_import_export import router as ai_model_import_export_router
from app.api.v1.ai_model_test_sessions import router as ai_model_test_sessions_router
from app.api.v1.ai_generate_sessions import router as ai_generate_sessions_router
from app.api.v1.ai_scenes import router as ai_scenes_router
from app.api.v1.ai_scene_catalog import router as ai_scene_catalog_router
from app.api.v1.ai_scene_test import router as ai_scene_test_router
from app.api.v1.ai_scene_runner import router as ai_scene_runner_router
from app.api.v1.ai_scene_structure import router as ai_scene_structure_router
from app.api.v1.ai_storyboard import router as ai_storyboard_router
from app.api.v1.ai_context import router as ai_context_router
from app.api.v1.items import router as items_router
from app.api.v1.credits import router as credits_router
from app.api.v1.agents import router as agents_router
from app.api.v1.episodes import router as episodes_router
from app.api.v1.scripts import router as scripts_router
from app.api.v1.tasks import router as tasks_router
from app.api.v1.users import router as users_router
from app.api.v1.storage.vfs import router as vfs_router
from app.api.v1.scenes import router as scenes_router
from app.api.v1.admin_builtin_agents import router as admin_builtin_agents_router
from app.api.v1.user_agents import router as user_agents_router
from app.api.v1.user_apps import router as user_apps_router
from app.api.v1.apply_plans import router as apply_plans_router
from app.api.v1.ai_chat_sessions import router as ai_chat_sessions_router
from app.api.v1.storyboards import router as storyboards_router
from app.api.v1.canvases import router as canvases_router
from app.api.v1.ai_video_models import router as ai_video_models_router


v1_router = APIRouter()
v1_router.include_router(items_router, prefix="/items", tags=["item"])
v1_router.include_router(scripts_router, prefix="/scripts", tags=["scripts"])
v1_router.include_router(assets_router, tags=["assets"])
v1_router.include_router(asset_bindings_router, tags=["asset_bindings"])
v1_router.include_router(ai_scene_structure_router, tags=["ai"])
v1_router.include_router(ai_storyboard_router, tags=["ai"])
v1_router.include_router(ai_asset_extraction_router, tags=["ai"])
v1_router.include_router(ai_image_router, tags=["ai"])
v1_router.include_router(ai_media_router, tags=["ai"])
v1_router.include_router(ai_text_router, tags=["ai"])
v1_router.include_router(ai_video_router, tags=["ai"])
v1_router.include_router(ai_prompt_presets_router, tags=["ai"])
v1_router.include_router(ai_model_configs_router, tags=["ai"])
v1_router.include_router(ai_model_import_export_router, tags=["ai"])
v1_router.include_router(ai_model_test_sessions_router, tags=["ai"])
v1_router.include_router(ai_generate_sessions_router, tags=["ai"])
v1_router.include_router(ai_catalog_router, tags=["ai"])
v1_router.include_router(ai_scenes_router, tags=["ai"])
v1_router.include_router(ai_scene_catalog_router, tags=["ai"])
v1_router.include_router(ai_scene_test_router, tags=["ai"])
v1_router.include_router(ai_scene_runner_router, tags=["ai"])
v1_router.include_router(ai_context_router, tags=["ai"])
v1_router.include_router(tasks_router, prefix="/tasks", tags=["tasks"])
v1_router.include_router(admin_router, tags=["admin"])
v1_router.include_router(users_router, prefix="/users", tags=["users"])
v1_router.include_router(credits_router, tags=["credits"])
v1_router.include_router(agents_router, tags=["agents"])
v1_router.include_router(episodes_router, tags=["episodes"])
v1_router.include_router(storyboards_router, prefix="/storyboards", tags=["storyboards"])
v1_router.include_router(vfs_router, prefix="/vfs", tags=["vfs"])
v1_router.include_router(scenes_router, tags=["scenes"])
v1_router.include_router(apply_plans_router, tags=["apply_plans"])
v1_router.include_router(admin_builtin_agents_router, tags=["admin"])
v1_router.include_router(user_agents_router, tags=["user_agents"])
v1_router.include_router(user_apps_router, tags=["user_apps"])
v1_router.include_router(ai_chat_sessions_router, tags=["ai_chat"])
v1_router.include_router(canvases_router, prefix="/canvases", tags=["canvases"])
v1_router.include_router(ai_video_models_router, tags=["ai"])

__all__ = ["v1_router"]
