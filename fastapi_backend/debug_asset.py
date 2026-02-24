
import asyncio
from app.database import async_session_maker
from app.models import Asset, AssetVariant
from sqlalchemy import select

async def main():
    async with async_session_maker() as db:
        # Check for asset '叶辰'
        stmt = select(Asset).where(Asset.name == '叶辰')
        res = await db.execute(stmt)
        asset = res.scalars().first()
        
        if asset:
            print(f"Asset Found: {asset.name}")
            print(f"  ID: {asset.id}")
            print(f"  Type: {asset.type}")
            print(f"  Status: {asset.lifecycle_status}")
            print(f"  Thumbnail: {asset.thumbnail}")
            print(f"  ProjectID: {asset.project_id}")
            print(f"  ScriptID: {asset.script_id}")
            print(f"  DocNodeID: {asset.doc_node_id}")
            print(f"  CreatedAt: {asset.created_at}")
            
            stmt_v = select(AssetVariant).where(AssetVariant.asset_entity_id == asset.id)
            res_v = await db.execute(stmt_v)
            variants = res_v.scalars().all()
            print(f"  Variants count: {len(variants)}")
            for v in variants:
                print(f"    Variant: {v.variant_code}, ID: {v.id}, DocID: {v.doc_node_id}")
        else:
            print("Asset '叶辰' NOT FOUND in database.")

if __name__ == "__main__":
    asyncio.run(main())
