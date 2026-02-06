import pytest
from sqlalchemy import select

from app.models import (
    Asset,
    AssetResource,
    AssetTag,
    AssetTagRelation,
    AssetVariant,
    Episode,
    Project,
    QCReport,
    Scene,
    Shot,
    ShotAssetRelation,
    VideoPrompt,
)


@pytest.mark.asyncio(loop_scope="function")
async def test_manju_hierarchy_roundtrip(db_session, authenticated_user):
    project = Project(name="demo", owner_id=authenticated_user["user"].id)
    db_session.add(project)
    await db_session.commit()
    await db_session.refresh(project)

    asset = Asset(
        project_id=project.id,
        asset_id="CHAR_001",
        name="Alice",
        type="character",
        category="主角",
        lifecycle_status="published",
    )
    db_session.add(asset)
    await db_session.commit()
    await db_session.refresh(asset)

    variant = AssetVariant(
        asset_entity_id=asset.id,
        variant_code="V1",
        stage_tag="present",
        attributes={"hair": "black"},
        prompt_template="base prompt",
        is_default=True,
    )
    db_session.add(variant)
    await db_session.commit()
    await db_session.refresh(variant)

    resource = AssetResource(
        variant_id=variant.id,
        res_type="image",
        minio_bucket="anyreason-assets",
        minio_key="assets/CHAR_001/V1/face_ref.jpg",
        meta_data={"sha256": "x", "width": 1024, "height": 1024},
    )
    db_session.add(resource)

    episode = Episode(
        project_id=project.id,
        episode_code="EP001",
        episode_number=1,
        title="t",
        summary="s",
        word_count=10,
        start_line=1,
        end_line=2,
        status="parsed",
        stage_tag="present",
    )
    db_session.add(episode)
    await db_session.commit()
    await db_session.refresh(episode)

    scene = Scene(
        episode_id=episode.id,
        scene_code="EP001_SC01",
        scene_number=1,
        location="街道",
        location_type="内",
        time_of_day="日",
        z_depth={"foreground": ["栏杆"], "midground": ["人物"], "background": ["夕阳"]},
        key_events=["A遇见B"],
        content="...",
    )
    db_session.add(scene)
    await db_session.commit()
    await db_session.refresh(scene)

    shot = Shot(
        scene_id=scene.id,
        shot_code="EP001_SC01_SH01",
        shot_number=1,
        shot_type="特写",
        camera_angle="平视",
        narrative_function="建立",
        active_assets=["CHAR_001"],
        duration_estimate=1.5,
    )
    db_session.add(shot)
    await db_session.commit()
    await db_session.refresh(shot)

    rel = ShotAssetRelation(
        shot_id=shot.id,
        asset_entity_id=asset.id,
        asset_variant_id=variant.id,
        state={"is_damaged": False},
    )
    db_session.add(rel)

    tag = AssetTag(project_id=project.id, name="主角")
    db_session.add(tag)
    await db_session.commit()
    await db_session.refresh(tag)

    tag_rel = AssetTagRelation(asset_entity_id=asset.id, tag_id=tag.id)
    db_session.add(tag_rel)

    video_prompt = VideoPrompt(
        shot_id=shot.id,
        prompt_main="[xxx]",
        negative_prompt="",
        style_model="anime",
        aspect_ratio="9:16",
        character_prompts=[{"character": "A", "action": "run"}],
        camera_settings={"move": "push"},
        duration=1.5,
        generation_notes="ok",
    )
    db_session.add(video_prompt)

    qc = QCReport(
        project_id=project.id,
        iteration=1,
        status="passed",
        total_issues=0,
        critical_issues=0,
        report_content={"checks": []},
    )
    db_session.add(qc)
    await db_session.commit()

    fetched = (
        await db_session.execute(select(Project).where(Project.id == project.id))
    ).scalar_one()
    assert fetched.name == "demo"

    fetched_asset = (
        await db_session.execute(
            select(Asset).where(Asset.project_id == project.id, Asset.asset_id == "CHAR_001")
        )
    ).scalar_one()
    assert fetched_asset.type == "character"

    fetched_variant = (
        await db_session.execute(
            select(AssetVariant).where(AssetVariant.asset_entity_id == asset.id)
        )
    ).scalar_one()
    assert fetched_variant.stage_tag == "present"

    fetched_tag = (
        await db_session.execute(
            select(AssetTag).where(AssetTag.project_id == project.id, AssetTag.name == "主角")
        )
    ).scalar_one()
    assert fetched_tag.name == "主角"
