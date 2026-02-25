-- Complete database initialization for AnyReason
-- This script creates all required tables and the admin user

-- Create user table with all required fields
CREATE TABLE IF NOT EXISTS "user" (
    id SERIAL PRIMARY KEY,
    email VARCHAR(320) UNIQUE NOT NULL,
    hashed_password VARCHAR(1024) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    is_superuser BOOLEAN DEFAULT FALSE NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE NOT NULL,
    is_disabled BOOLEAN DEFAULT FALSE,
    avatar_content_type VARCHAR(255),
    avatar_data BYTEA,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);

-- Create index on email
CREATE INDEX IF NOT EXISTS ix_user_email ON "user"(email);

-- Insert admin user
-- Password: IydQ0tGJfDbw (bcrypt hash)
INSERT INTO "user" (
    email, 
    hashed_password, 
    is_active, 
    is_superuser, 
    is_verified,
    is_disabled,
    avatar_content_type,
    avatar_data
) VALUES (
    'admin@znxview.com',
    '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
    TRUE,
    TRUE,
    TRUE,
    FALSE,
    NULL,
    NULL
)
ON CONFLICT (email) DO UPDATE SET
    hashed_password = EXCLUDED.hashed_password,
    is_active = TRUE,
    is_superuser = TRUE,
    is_verified = TRUE,
    is_disabled = FALSE;

-- Verify the user was created
SELECT id, email, is_active, is_superuser, is_verified, created_at 
FROM "user" 
WHERE email = 'admin@znxview.com';
