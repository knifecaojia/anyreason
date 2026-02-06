#!/usr/bin/env sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v litellm_db="$LITELLM_DB_NAME" \
  -v litellm_user="$LITELLM_DB_USER" \
  -v litellm_password="$LITELLM_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'litellm_user', :'litellm_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'litellm_user');
\gexec

SELECT format('CREATE DATABASE %I OWNER %I', :'litellm_db', :'litellm_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'litellm_db');
\gexec
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$LITELLM_DB_NAME" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL
