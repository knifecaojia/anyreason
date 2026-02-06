import pytest


@pytest.mark.asyncio
async def test_admin_endpoints_require_permissions(test_client, authenticated_user):
    r = await test_client.get(
        "/api/v1/admin/roles",
        headers=authenticated_user["headers"],
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_role_permission_user_assignment_and_audit(test_client, authenticated_superuser, authenticated_user):
    p_users = await test_client.post(
        "/api/v1/admin/permissions",
        headers=authenticated_superuser["headers"],
        json={"code": "system.users", "description": "用户管理"},
    )
    assert p_users.status_code == 201
    p_users_id = p_users.json()["id"]

    p_roles = await test_client.post(
        "/api/v1/admin/permissions",
        headers=authenticated_superuser["headers"],
        json={"code": "system.roles", "description": "角色权限管理"},
    )
    assert p_roles.status_code == 201
    p_roles_id = p_roles.json()["id"]

    p_audit = await test_client.post(
        "/api/v1/admin/permissions",
        headers=authenticated_superuser["headers"],
        json={"code": "system.audit", "description": "审计日志查看"},
    )
    assert p_audit.status_code == 201
    p_audit_id = p_audit.json()["id"]

    role = await test_client.post(
        "/api/v1/admin/roles",
        headers=authenticated_superuser["headers"],
        json={"name": "ops", "description": "运营管理员"},
    )
    assert role.status_code == 201
    role_id = role.json()["id"]

    set_perms = await test_client.put(
        f"/api/v1/admin/roles/{role_id}/permissions",
        headers=authenticated_superuser["headers"],
        json=[p_users_id, p_roles_id, p_audit_id],
    )
    assert set_perms.status_code == 200
    assert sorted([p["code"] for p in set_perms.json()["permissions"]]) == [
        "system.audit",
        "system.roles",
        "system.users",
    ]

    target_user_id = str(authenticated_user["user"].id)
    set_roles = await test_client.put(
        f"/api/v1/admin/users/{target_user_id}/roles",
        headers=authenticated_superuser["headers"],
        json=[role_id],
    )
    assert set_roles.status_code == 200
    assert [r["name"] for r in set_roles.json()["roles"]] == ["ops"]

    new_user = await test_client.post(
        "/api/v1/admin/users",
        headers=authenticated_superuser["headers"],
        json={"email": "new.user@example.com", "password": "TempPassword123#", "role_ids": [role_id]},
    )
    assert new_user.status_code == 201
    assert new_user.json()["email"] == "new.user@example.com"

    can_list_users = await test_client.get(
        "/api/v1/admin/users",
        headers=authenticated_user["headers"],
    )
    assert can_list_users.status_code == 200
    emails = [u["email"] for u in can_list_users.json()]
    assert "test@example.com" in emails
    assert "new.user@example.com" in emails

    audit_logs = await test_client.get(
        "/api/v1/admin/audit-logs?limit=200&offset=0",
        headers=authenticated_user["headers"],
    )
    assert audit_logs.status_code == 200
    actions = {row["action"] for row in audit_logs.json()}
    assert "permission.create" in actions
    assert "role.create" in actions
    assert "role.permissions.set" in actions
    assert "user.roles.set" in actions
    assert "user.create" in actions
