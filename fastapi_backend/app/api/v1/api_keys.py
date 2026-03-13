import secrets
import string
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppError
from app.database import User, get_async_session
from app.models import APIKey
from app.schemas import APIKeyRead, APIKeyCreateRequest, APIKeyUpdate
from app.schemas_response import ResponseBase
from app.users import current_active_superuser

router = APIRouter()


def generate_secure_key(length: int = 32) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


@router.post("", response_model=ResponseBase[APIKeyRead])
async def create_api_key(
    body: APIKeyCreateRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_superuser),
):
    """
    Admin only: Create a new API key for a user.

    - **user_id**: The UUID of the user who will own the key. Defaults to current user.
    - **name**: A descriptive name for the key (e.g., 'External Worker').
    - **key**: Optional custom key string. If not provided, a secure 32-character key will be generated.

    Returns the created API key details, including the generated key string.
    """
    target_user_id = body.user_id or user.id
    
    # Check if user exists
    res = await db.execute(select(User).where(User.id == target_user_id))
    if not res.scalars().first():
        raise AppError(msg="Target user not found", code=404, status_code=404)

    key_str = body.key or generate_secure_key()
    
    # Check for key collision (unlikely but safe)
    res = await db.execute(select(APIKey).where(APIKey.key == key_str))
    if res.scalars().first():
        raise AppError(msg="API Key collision, please try again", code=400, status_code=400)

    api_key = APIKey(
        user_id=target_user_id,
        key=key_str,
        name=body.name,
        is_active=True,
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)
    return ResponseBase(code=200, msg="OK", data=api_key)


@router.get("", response_model=ResponseBase[list[APIKeyRead]])
async def list_api_keys(
    user_id: UUID | None = Query(None),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_superuser),
):
    """
    Admin only: List all API keys.

    - **user_id**: Optional filter to list keys belonging to a specific user.

    Returns a list of API keys with their associated metadata (creation date, active status, etc.).
    """
    query = select(APIKey)
    if user_id:
        query = query.where(APIKey.user_id == user_id)
    
    res = await db.execute(query.order_by(APIKey.created_at.desc()))
    keys = res.scalars().all()
    return ResponseBase(code=200, msg="OK", data=list(keys))


@router.patch("/{key_id}", response_model=ResponseBase[APIKeyRead])
async def update_api_key(
    key_id: UUID,
    body: APIKeyUpdate,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_superuser),
):
    """
    Admin only: Update an existing API key's metadata or status.

    - **key_id**: The unique UUID of the API key to update.
    - **name**: New descriptive name for the key.
    - **is_active**: Boolean flag to enable or disable the key.

    Returns the updated API key details.
    """
    res = await db.execute(select(APIKey).where(APIKey.id == key_id))
    api_key = res.scalars().first()
    if not api_key:
        raise AppError(msg="API Key not found", code=404, status_code=404)

    if body.name is not None:
        api_key.name = body.name
    if body.is_active is not None:
        api_key.is_active = body.is_active

    await db.commit()
    await db.refresh(api_key)
    return ResponseBase(code=200, msg="OK", data=api_key)


@router.delete("/{key_id}", response_model=ResponseBase[dict])
async def delete_api_key(
    key_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_superuser),
):
    """
    Admin only: Permanently delete an API key.

    - **key_id**: The unique UUID of the API key to remove.

    Returns a success message upon deletion. **Warning**: This action is irreversible.
    """
    res = await db.execute(select(APIKey).where(APIKey.id == key_id))
    api_key = res.scalars().first()
    if not api_key:
        raise AppError(msg="API Key not found", code=404, status_code=404)

    await db.delete(api_key)
    await db.commit()
    return ResponseBase(code=200, msg="OK", data={"deleted": True})
