from fastapi_pagination import add_pagination

from app.ai_gateway.openai_compat_patch import ensure_openai_compat_patched
from app.core.init_app import create_app

ensure_openai_compat_patched()
from app.schemas import UserCreate, UserRead, UserUpdate
from app.users import AUTH_URL_PATH, auth_backend, fastapi_users


app = create_app()

app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix=f"/{AUTH_URL_PATH}/jwt",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
    prefix=f"/{AUTH_URL_PATH}",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_reset_password_router(),
    prefix=f"/{AUTH_URL_PATH}",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix=f"/{AUTH_URL_PATH}",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate),
    prefix="/users",
    tags=["users"],
)
add_pagination(app)
