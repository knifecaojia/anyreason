import uuid
import re

from typing import Optional

from fastapi import Depends, Request
from fastapi_users import (
    BaseUserManager,
    FastAPIUsers,
    UUIDIDMixin,
    InvalidPasswordException,
)

from fastapi_users.authentication import (
    AuthenticationBackend,
    BearerTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase

from .config import settings
from .database import get_user_db
from .email import send_reset_password_email
from .models import User
from .schemas import UserCreate
from app.log import logger
from app.services.credit_service import credit_service

AUTH_URL_PATH = "auth"


class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.RESET_PASSWORD_SECRET_KEY
    verification_token_secret = settings.VERIFICATION_SECRET_KEY

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        logger.bind(context={"user_id": str(user.id)}).info("user_registered")
        await credit_service.ensure_account(
            db=self.user_db.session,
            user_id=user.id,
            initial_balance=settings.DEFAULT_INITIAL_CREDITS,
            reason="init",
        )
        await self.user_db.session.commit()

    async def on_after_forgot_password(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        await send_reset_password_email(user, token)

    async def on_after_request_verify(
        self, user: User, token: str, request: Optional[Request] = None
    ):
        logger.bind(context={"user_id": str(user.id)}).info("user_verify_requested")

    async def validate_password(
        self,
        password: str,
        user: UserCreate,
    ) -> None:
        errors = []

        if len(password) < 8:
            errors.append("Password should be at least 8 characters.")
        if user.email in password:
            errors.append("Password should not contain e-mail.")
        if not any(char.isupper() for char in password):
            errors.append("Password should contain at least one uppercase letter.")
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            errors.append("Password should contain at least one special character.")

        if errors:
            raise InvalidPasswordException(reason=errors)

    async def authenticate(self, credentials):
        user = await super().authenticate(credentials)
        if user is None:
            return None
        if not getattr(user, "is_active", True):
            return None
        if getattr(user, "is_disabled", False):
            return None
        return user


async def get_user_manager(user_db: SQLAlchemyUserDatabase = Depends(get_user_db)):
    yield UserManager(user_db)


from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from .database import get_async_session
from .models import APIKey

bearer_transport = BearerTransport(tokenUrl=f"{AUTH_URL_PATH}/jwt/login")


def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(
        secret=settings.ACCESS_SECRET_KEY,
        lifetime_seconds=settings.ACCESS_TOKEN_EXPIRE_SECONDS,
    )


auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)
current_active_superuser = fastapi_users.current_user(active=True, superuser=True)


# --- API Key Authentication ---

api_key_header = APIKeyHeader(name="X-API-KEY", auto_error=False)


async def get_current_api_user(
    api_key: str | None = Depends(api_key_header),
    db: AsyncSession = Depends(get_async_session),
) -> User | None:
    if not api_key:
        return None

    res = await db.execute(
        select(User)
        .join(APIKey)
        .where(APIKey.key == api_key, APIKey.is_active.is_(True))
    )
    user = res.scalars().first()
    if user and not user.is_active:
        return None
    if user and getattr(user, "is_disabled", False):
        return None
    return user


async def current_user_via_any(
    user_jwt: User | None = Depends(fastapi_users.current_user(active=True, optional=True)),
    user_api: User | None = Depends(get_current_api_user),
) -> User:
    user = user_jwt or user_api
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    return user
