-- Fix database schema by adding missing columns

-- Add missing columns if they don't exist
DO $$
BEGIN
    -- Add is_disabled column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='user' AND column_name='is_disabled') THEN
        ALTER TABLE "user" ADD COLUMN is_disabled BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added is_disabled column';
    END IF;

    -- Add avatar_content_type column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='user' AND column_name='avatar_content_type') THEN
        ALTER TABLE "user" ADD COLUMN avatar_content_type VARCHAR(255);
        RAISE NOTICE 'Added avatar_content_type column';
    END IF;

    -- Add avatar_data column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='user' AND column_name='avatar_data') THEN
        ALTER TABLE "user" ADD COLUMN avatar_data BYTEA;
        RAISE NOTICE 'Added avatar_data column';
    END IF;
END $$;

-- Update admin user if exists
UPDATE "user" 
SET is_active = TRUE, 
    is_superuser = TRUE, 
    is_verified = TRUE,
    is_disabled = FALSE
WHERE email = 'admin@znxview.com';

-- If admin doesn't exist, insert it
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

-- Verify the user
SELECT id, email, is_active, is_superuser, is_verified, is_disabled 
FROM "user" 
WHERE email = 'admin@znxview.com';
