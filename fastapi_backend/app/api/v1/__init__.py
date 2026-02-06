from fastapi import APIRouter

from app.api.v1.admin import router as admin_router
from app.api.v1.items import router as items_router
from app.api.v1.users import router as users_router


v1_router = APIRouter()
v1_router.include_router(items_router, prefix="/items", tags=["item"])
v1_router.include_router(admin_router, tags=["admin"])
v1_router.include_router(users_router, prefix="/users", tags=["users"])

__all__ = ["v1_router"]
