from sqlalchemy import select

from app.config import settings
from app.models import UserCreditAccount


async def test_my_credits_returns_balance(test_client, authenticated_user, db_session):
    user_id = authenticated_user["user"].id
    acc = (await db_session.execute(select(UserCreditAccount).where(UserCreditAccount.user_id == user_id))).scalars().first()
    assert acc is not None
    resp = await test_client.get("/api/v1/credits/my", headers=authenticated_user["headers"])
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["balance"] == settings.DEFAULT_INITIAL_CREDITS


async def test_admin_adjust_user_credits(test_client, authenticated_superuser, authenticated_user):
    user_id = str(authenticated_user["user"].id)
    resp = await test_client.post(
        f"/api/v1/credits/admin/users/{user_id}/adjust",
        headers=authenticated_superuser["headers"],
        json={"delta": 25, "reason": "admin.adjust"},
    )
    assert resp.status_code == 200
    acc = resp.json()["data"]
    assert acc["balance"] == settings.DEFAULT_INITIAL_CREDITS + 25

    resp2 = await test_client.get(
        f"/api/v1/credits/admin/users/{user_id}?limit=5",
        headers=authenticated_superuser["headers"],
    )
    assert resp2.status_code == 200
    payload = resp2.json()["data"]
    assert payload["account"]["balance"] == settings.DEFAULT_INITIAL_CREDITS + 25
    assert len(payload["transactions"]) >= 2
