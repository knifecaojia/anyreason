from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.asset_bindings import router as asset_bindings_router
from app.api.v1.assets import router as assets_router
from app.api.v1.ai_asset_extraction import router as ai_asset_extraction_router
from app.api.v1.ai_prompt_presets import router as ai_prompt_presets_router
from app.api.v1.ai_scene_structure import router as ai_scene_structure_router
from app.api.v1.ai_storyboard import router as ai_storyboard_router
from app.api.v1.items import router as items_router
from app.api.v1.llm import router as llm_router
from app.api.v1.scenes import router as scenes_router
from app.api.v1.shots import router as shots_router
from app.api.v1.scripts import router as scripts_router
from app.api.v1.users import router as users_router


v1_router = APIRouter()
v1_router.include_router(items_router, prefix="/items", tags=["item"])
v1_router.include_router(scripts_router, prefix="/scripts", tags=["scripts"])
v1_router.include_router(scenes_router, tags=["scenes"])
v1_router.include_router(shots_router, tags=["shots"])
v1_router.include_router(assets_router, tags=["assets"])
v1_router.include_router(asset_bindings_router, tags=["asset_bindings"])
v1_router.include_router(ai_scene_structure_router, tags=["ai"])
v1_router.include_router(ai_storyboard_router, tags=["ai"])
v1_router.include_router(ai_asset_extraction_router, tags=["ai"])
v1_router.include_router(ai_prompt_presets_router, tags=["ai"])
v1_router.include_router(admin_router, tags=["admin"])
v1_router.include_router(users_router, prefix="/users", tags=["users"])
v1_router.include_router(llm_router, prefix="/llm", tags=["llm"])

__all__ = ["v1_router"]
