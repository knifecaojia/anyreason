import asyncio
from sqlalchemy import text
from app.database import async_sessionmaker, engine

async def check_assets():
    async with async_sessionmaker(bind=engine)() as db:
        project_id = '652ad21e-97c3-4102-9e96-57236b4709b0'
        
        result = await db.execute(text('''
            SELECT id, name, doc_node_id
            FROM assets
            WHERE project_id = :pid AND lifecycle_status = 'draft'
            LIMIT 1
        '''), {'pid': project_id})
        
        row = result.first()
        if row:
            print(f'Asset: {row.name}')
            print(f'Doc Node ID: {row.doc_node_id}')
        else:
            print('No draft assets found.')

asyncio.run(check_assets())
