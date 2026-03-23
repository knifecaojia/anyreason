"""
Cleanup script to truncate all business data tables while preserving account and AI model config tables.

Usage:
    python fastapi_backend/scripts/cleanup_business_data.py

This script will:
1. Show current row counts for all tables
2. Ask for confirmation before truncation
3. Truncate all CLEAR_TABLES using CASCADE
4. Verify the truncation was successful
5. Show before/after row counts for verification

NOTE: Uses SET session_replication_role = 'replica' to bypass FK constraints during truncate.
"""

import sys
from sqlalchemy import create_engine, text
from typing import List

# Database connection - using synchronous psycopg2 driver
DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/anyreason"

# Tables to truncate (business data)
CLEAR_TABLES: List[str] = [
    # Leaf tables first (nothing else references these)
    "task_events",
    "shot_asset_relations",
    "asset_tag_relations",
    "asset_resources",
    "video_prompts",
    "image_prompts",
    # Mid-level
    "asset_bindings",
    "asset_variants",
    "qc_reports",
    "storyboards",
    "asset_tags",
    # Higher level
    "assets",
    "episodes",
    "scripts",
    "projects",
    "file_nodes",
    "items",
    "workspace_members",
    "tasks",
    "ai_usage_events",
    "user_agents",
    "user_apps",
    # Root-level (other tables depend on these)
    "workspaces",
    "scenes",
]

# Tables to preserve (account and AI model config)
KEEP_TABLES: List[str] = [
    # Accounts
    "user",
    # RBAC
    "roles",
    "permissions",
    "user_roles",
    "role_permissions",
    # Billing
    "user_credit_accounts",
    "credit_transactions",
    # AI model configuration
    "ai_model_configs",
    "ai_model_bindings",
    # AI agents
    "agents",
    "agent_prompt_versions",
    "builtin_agents",
    "builtin_agent_prompt_versions",
    "builtin_agent_user_overrides",
    # Other
    "ai_prompt_presets",
    "audit_logs",
]


def get_table_counts(engine, tables: List[str]) -> dict:
    """Get row counts for specified tables."""
    counts = {}
    with engine.connect() as conn:
        for table in tables:
            try:
                result = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"'))
                counts[table] = result.scalar()
            except Exception as e:
                counts[table] = f"ERROR: {e}"
    return counts


def truncate_tables(engine, tables: List[str]) -> dict:
    """Truncate specified tables with CASCADE."""
    results = {}
    with engine.begin() as conn:
        # Disable FK constraints by setting replication role to replica
        conn.execute(text("SET session_replication_role = 'replica'"))
        
        for table in tables:
            try:
                conn.execute(text(f'TRUNCATE TABLE "{table}" CASCADE'))
                results[table] = "SUCCESS"
            except Exception as e:
                results[table] = f"ERROR: {e}"
        
        # Re-enable FK constraints
        conn.execute(text("SET session_replication_role = 'origin'"))
    
    return results


def format_counts(counts: dict) -> str:
    """Format counts for display."""
    return ", ".join(f"{k}: {v}" for k, v in counts.items())


def main() -> None:
    print("=" * 60)
    print("Business Data Cleanup Script")
    print("=" * 60)
    print()
    
    # Create engine
    engine = create_engine(DATABASE_URL)
    
    # Get before counts
    print("Collecting current row counts...")
    all_tables = CLEAR_TABLES + KEEP_TABLES
    before_counts = get_table_counts(engine, all_tables)
    
    # Separate into clear and keep
    clear_before = {k: v for k, v in before_counts.items() if k in CLEAR_TABLES}
    keep_before = {k: v for k, v in before_counts.items() if k in KEEP_TABLES}
    
    print()
    print("TABLES TO BE CLEARED (before):")
    for table, count in clear_before.items():
        print(f"  {table}: {count}")
    
    print()
    print("TABLES TO BE PRESERVED (before):")
    for table, count in keep_before.items():
        print(f"  {table}: {count}")
    
    print()
    print("-" * 60)
    
    # Check for auto-confirm flag
    auto_confirm = "--yes" in sys.argv or "-y" in sys.argv
    
    if auto_confirm:
        print("Auto-confirm enabled, proceeding...")
    else:
        response = input("Are you sure you want to truncate all business data tables? (yes/no): ")
        if response.lower() != "yes":
            print("Aborted. No changes made.")
            return
    
    print()
    print("Executing truncation...")
    truncate_results = truncate_tables(engine, CLEAR_TABLES)
    
    # Verify results
    print()
    print("Verifying results...")
    after_counts = get_table_counts(engine, all_tables)
    
    clear_after = {k: v for k, v in after_counts.items() if k in CLEAR_TABLES}
    keep_after = {k: v for k, v in after_counts.items() if k in KEEP_TABLES}
    
    print()
    print("=" * 60)
    print("VERIFICATION RESULTS")
    print("=" * 60)
    
    print()
    print("CLEARED TABLES (should all be 0):")
    all_clear = True
    for table, count in clear_after.items():
        status = "OK" if count == 0 else "FAIL"
        if count != 0:
            all_clear = False
        print(f"  [{status}] {table}: {count}")
    
    print()
    print("PRESERVED TABLES (should retain data):")
    all_preserved = True
    for table, count in keep_after.items():
        before_count = keep_before.get(table, 0)
        status = "OK" if count == before_count else "FAIL"
        if count != before_count:
            all_preserved = False
        print(f"  [{status}] {table}: {before_count} -> {count}")
    
    print()
    print("-" * 60)
    if all_clear and all_preserved:
        print("SUCCESS: All business data truncated, account tables preserved!")
    else:
        print("WARNING: Some tables may not have been processed correctly.")
        print(f"Truncate results: {truncate_results}")


if __name__ == "__main__":
    main()