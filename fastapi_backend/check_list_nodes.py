import asyncio
from sqlalchemy import select, text
from app.database import async_sessionmaker, engine
from app.models import FileNode
from uuid import UUID

async def simulate_list_nodes():
    async with async_sessionmaker(bind=engine)() as db:
        project_id = '652ad21e-97c3-4102-9e96-57236b4709b0'
        
        # 模拟后端 list_nodes 的查询逻辑
        stmt = select(FileNode).where(FileNode.parent_id.is_(None))
        stmt = stmt.where(FileNode.project_id == project_id)
        
        result = await db.execute(stmt)
        nodes = result.scalars().all()
        
        print(f'=== Nodes for project {project_id} ===')
        for node in nodes:
            print(f'id={node.id} | name={node.name} | project_id={node.project_id}')

asyncio.run(simulate_list_nodes())
