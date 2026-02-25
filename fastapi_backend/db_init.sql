-- Create user table
CREATE TABLE IF NOT EXISTS "user" (
    id SERIAL PRIMARY KEY,
    email VARCHAR(320) UNIQUE NOT NULL,
    hashed_password VARCHAR(1024) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_superuser BOOLEAN DEFAULT FALSE NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Insert admin user with bcrypt hashed password
-- Password: IydQ0tGJfDbw
-- This is a bcrypt hash generated with passlib
INSERT INTO "user" (email, hashed_password, is_active, is_superuser, is_verified)
VALUES (
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

-- Verify the user was created
SELECT id, email, is_active, is_superuser, is_verified, created_at FROM "user" WHERE email = 'admin@znxview.com';
