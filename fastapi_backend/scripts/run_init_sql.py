import os
import sys
import asyncio
from sqlalchemy import text

# Add project root to sys.path BEFORE imports
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

try:
    from app.database import async_session_maker
except ImportError:
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
    from app.database import async_session_maker

async def main():
    # Path to SQL file
    # scripts/ is in fastapi_backend/scripts/
    # SQL is in fastapi_backend/sql/init/
    sql_path = os.path.join(os.path.dirname(__file__), '../sql/init/vendor_model_init.sql')
    
    if not os.path.exists(sql_path):
        print(f"Error: SQL file not found at {sql_path}")
        return

    print(f"Reading SQL from {sql_path}...")
    with open(sql_path, 'r', encoding='utf-8') as f:
        sql_content = f.read()

    # Split statements (simple split by ;)
    statements = [s.strip() for s in sql_content.split(';') if s.strip()]
    
    print(f"Found {len(statements)} statements.")
    
    async with async_session_maker() as session:
        for i, stmt in enumerate(statements):
            try:
                if not stmt: continue
                await session.execute(text(stmt))
                # print(f"Executed statement {i+1}")
            except Exception as e:
                # Handle UNIQUE constraint violations or other errors gracefully
                # If it's a conflict, it means data exists, which is fine
                if "duplicate key" in str(e) or "UniqueViolation" in str(e):
                     # print(f"Skipping duplicate: {str(e)[:50]}...")
                     pass
                else:
                     print(f"Error executing statement {i+1}: {e}")
        
        await session.commit()
        print("Done.")

if __name__ == "__main__":
    asyncio.run(main())
