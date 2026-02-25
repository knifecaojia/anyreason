-- 修复 user 表结构 - 使用 UUID 作为主键
DROP TABLE IF EXISTS "user" CASCADE;

-- 创建 user 表，使用 UUID 作为主键
CREATE TABLE "user" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(320) UNIQUE NOT NULL,
    hashed_password VARCHAR(1024) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_superuser BOOLEAN DEFAULT FALSE NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- 插入管理员用户
-- 密码: IydQ0tGJfDbw (使用 bcrypt 哈希)
INSERT INTO "user" (id, email, hashed_password, is_active, is_superuser, is_verified)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'admin@znxview.com',
    '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
    TRUE,
    TRUE,
    TRUE
)
ON CONFLICT (email) DO UPDATE SET
    hashed_password = EXCLUDED.hashed_password,
    is_active = TRUE,
    is_superuser = TRUE,
    is_verified = TRUE;

-- 验证创建结果
SELECT id, email, is_active, is_superuser, is_verified, created_at 
FROM "user" 
WHERE email = 'admin@znxview.com';
