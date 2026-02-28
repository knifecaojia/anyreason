import asyncio
from sqlalchemy import text
from app.database import async_sessionmaker, engine

async def check_ai_folder():
    async with async_sessionmaker(bind=engine)() as db:
        project_id = '652ad21e-97c3-4102-9e96-57236b4709b0'
        
        # 1. 检查 AI_Generated 文件夹
        result = await db.execute(text('''
            SELECT id, name, project_id, parent_id
            FROM file_nodes
            WHERE name = 'AI_Generated' AND is_folder = true
        '''))
        
        print('=== AI_Generated Folders ===')
        for row in result:
            print(f'id={row.id} | project_id={row.project_id} | parent={row.parent_id}')
            
        # 2. 检查资产的项目 ID
        asset_id = '32882c7b-1d14-4667-a09d-7dda7ed2d94c'
        result = await db.execute(text('''
            SELECT id, name, project_id
            FROM assets
            WHERE id = :aid
        '''), {'aid': asset_id})
        
        row = result.first()
        if row:
            print(f'\n=== Asset ===')
            print(f'id={row.id} | name={row.name} | project_id={row.project_id}')

asyncio.run(check_ai_folder())
