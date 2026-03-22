from __future__ import annotations

import re
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_tools.apply_plan import ApplyPlan
from app.database import User, get_async_session
from app.models import Episode, FileNode, ImagePrompt, Project, Storyboard, VideoPrompt, Asset, AssetBinding, AssetVariant
from app.repositories import asset_repository
from app.schemas import AIShotDraft
from app.schemas_response import ResponseBase
from app.services.apply_plan_normalize_service import normalize_apply_plan
from app.services.storage.vfs_service import vfs_service
from app.services.asset_service import asset_service
from app.users import current_active_user
from app.vfs_docs import AssetDocV1, AssetDocV2, AssetVariantDocV2, EpisodeBindingsDocV1
from app.vfs_layout import (
    ASSETS_FOLDER_NAME,
    ASSET_TYPE_FOLDER_NAMES,
    BINDINGS_FOLDER_NAME,
    EPISODES_FOLDER_NAME,
    STORYBOARD_FOLDER_NAME,
    asset_doc_filename,
    asset_filename,
    bindings_filename,
    episode_filename,
    safe_filename,
    variant_doc_filename,
    variant_folder_name,
)
from app.vfs_renderers.asset_doc_renderer import render_asset_doc_md
from app.vfs_renderers.asset_variant_doc_renderer import render_asset_variant_doc_md


router = APIRouter(prefix="/apply-plans")


def _render_shot_md(shot_code: str, draft: AIShotDraft) -> str:
    lines = [f"# {shot_code}"]
    lines.append("")
    if draft.shot_type or draft.camera_move:
        st = draft.shot_type or "-"
        cm = draft.camera_move or "-"
        lines.append(f"**景别/视角**: {st} / {cm}")

    if draft.description:
        lines.append(f"**画面内容描述**: {draft.description}")

    if draft.dialogue:
        lines.append(f"**对白/音效**: {draft.dialogue}")

    if draft.active_assets:
        assets_str = " ".join([f"@{a}" for a in draft.active_assets])
        lines.append(f"**资产调用**: {assets_str}")

    if draft.narrative_function:
        lines.append(f"**导演意图**: {draft.narrative_function}")

    return "\n".join(lines) + "\n"


class ApplyExecuteRequest(BaseModel):
    plan: ApplyPlan
    confirm: bool = Field(default=True)


async def _get_or_create_root_folder(*, db: AsyncSession, user_id: UUID, project_id: UUID, name: str) -> UUID:
    res = await db.execute(
        select(FileNode).where(
            FileNode.project_id == project_id,
            FileNode.parent_id.is_(None),
            FileNode.is_folder.is_(True),
            FileNode.name == name,
        )
    )
    found = res.scalars().first()
    if found:
        return found.id
    created = await vfs_service.create_folder(
        db=db,
        user_id=user_id,
        name=name,
        parent_id=None,
        workspace_id=None,
        project_id=project_id,
    )
    return created.id


async def _get_or_create_child_folder(
    *,
    db: AsyncSession,
    user_id: UUID,
    project_id: UUID,
    parent_id: UUID,
    name: str,
) -> UUID:
    res = await db.execute(
        select(FileNode).where(
            FileNode.project_id == project_id,
            FileNode.parent_id == parent_id,
            FileNode.is_folder.is_(True),
            FileNode.name == name,
        )
    )
    found = res.scalars().first()
    if found:
        return found.id
    created = await vfs_service.create_folder(
        db=db,
        user_id=user_id,
        name=name,
        parent_id=parent_id,
        workspace_id=None,
        project_id=project_id,
    )
    return created.id


def _parse_attributes_from_md(text: str) -> dict:
    attrs = {}
    # Match [D{number}-{Key}: {Value}] or [D{number}-{Key}：{Value}]
    # e.g. [D1-核心身份：元印师]
    matches = re.findall(r"\[D(\d+)-([^：:]+)[：:]([^\]]+)\]", text)
    for m in matches:
        key_num = m[0]
        key_name = m[1].strip()
        value = m[2].strip()
        attrs[f"D{key_num}_{key_name}"] = value
    
    # Also parse "补全说明"
    # [补全说明：...]
    m_supp = re.search(r"\[补全说明[：:]([^\]]+)\]", text)
    if m_supp:
        attrs["supplement"] = m_supp.group(1).strip()
        
    # Also parse "指代与风格"
    # [指代与风格：...]
    m_style = re.search(r"\[指代与风格[：:]([^\]]+)\]", text)
    if m_style:
        attrs["style_ref"] = m_style.group(1).strip()
        
    return attrs


def _asset_v1_to_v2(v1: AssetDocV1, *, provenance: dict) -> AssetDocV2:
    pieces: list[str] = []
    if v1.description:
        pieces.append(v1.description.strip())
    if v1.meta:
        pieces.append("```json")
        pieces.append(json.dumps(v1.meta, ensure_ascii=False, indent=2))
        pieces.append("```")
    details_md = "\n\n".join([p for p in pieces if p]).strip() + ("\n" if pieces else "")
    
    attributes = _parse_attributes_from_md(details_md)
    default_variant = AssetVariantDocV2(
        variant_code="V1",
        stage_tag="default",
        attributes=attributes,
        prompt_en="" 
    )
    
    return AssetDocV2(
        type=v1.type,
        name=v1.name,
        keywords=list(v1.keywords or []),
        first_appearance_episode=v1.first_appearance_episode,
        details_md=details_md,
        provenance=dict(provenance or {}),
        variants=[default_variant],
    )


@router.post("/execute", response_model=ResponseBase[dict])
async def api_execute_apply_plan(
    body: ApplyExecuteRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_active_user),
):
    if not body.confirm:
        raise HTTPException(status_code=400, detail="confirm_required")

    plan = body.plan

    project_id_raw = (plan.inputs or {}).get("project_id")
    if not project_id_raw:
        raise HTTPException(status_code=400, detail="project_id_required")
    try:
        project_id = UUID(str(project_id_raw))
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_project_id")

    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="project_not_found")
    if project.owner_id and project.owner_id != user.id:
        raise HTTPException(status_code=404, detail="project_not_found")

    normalized = normalize_apply_plan(plan)
    plan = normalized.plan
    provenance = normalized.provenance
    if provenance:
        merged = dict(plan.preview or {})
        merged["provenance"] = provenance
        plan.preview = merged

    if plan.kind == "episode_save" and plan.tool_id == "episode_save":
        episodes = (plan.inputs or {}).get("episodes") or []
        if not isinstance(episodes, list):
            raise HTTPException(status_code=400, detail="invalid_episodes")

        root_id = await _get_or_create_root_folder(
            db=db,
            user_id=user.id,
            project_id=project_id,
            name=EPISODES_FOLDER_NAME,
        )

        created_nodes: list[dict] = []
        for e in episodes:
            if not isinstance(e, dict):
                continue
            ep_no = int(e.get("episode_number") or 0)
            title = str(e.get("title") or "")
            content_md = str(e.get("content_md") or "")
            if ep_no <= 0:
                continue
            filename = episode_filename(episode_number=ep_no, title=title)
            node = await vfs_service.upsert_text_file(
                db=db,
                user_id=user.id,
                name=filename,
                content=content_md,
                parent_id=root_id,
                workspace_id=None,
                project_id=project_id,
                content_type="text/markdown; charset=utf-8",
            )
            created_nodes.append({"episode_number": ep_no, "node_id": str(node.id), "filename": filename})

            res = await db.execute(
                select(Episode).where(
                    Episode.project_id == project_id,
                    Episode.episode_number == ep_no,
                )
            )
            matched = list(res.scalars().all())
            if len(matched) == 1:
                matched[0].episode_doc_node_id = node.id

        await db.commit()
        return ResponseBase(code=200, msg="OK", data={"plan_id": str(plan.id), "created": created_nodes, "provenance": provenance})

    if plan.kind == "asset_create" and plan.tool_id == "asset_create":
        assets_raw = (plan.inputs or {}).get("assets") or []
        script_id_raw = (plan.inputs or {}).get("script_id")
        script_id = None
        if script_id_raw:
            try:
                script_id = UUID(str(script_id_raw))
            except Exception:
                pass

        if not isinstance(assets_raw, list):
            raise HTTPException(status_code=400, detail="invalid_assets")
        assets_v2: list[AssetDocV2] = []
        assets_json_payloads: list[dict] = []
        for a in assets_raw:
            if not isinstance(a, dict):
                continue
            if int(a.get("version") or 0) == 2 or "details_md" in a:
                v2 = AssetDocV2.model_validate(a)
                if provenance and not v2.provenance:
                    v2.provenance = dict(provenance)
                assets_v2.append(v2)
                assets_json_payloads.append(v2.model_dump())
            else:
                v1 = AssetDocV1.model_validate(a)
                v2 = _asset_v1_to_v2(v1, provenance=provenance)
                assets_v2.append(v2)
                assets_json_payloads.append(v1.model_dump())

        assets_root_id = await _get_or_create_root_folder(
            db=db,
            user_id=user.id,
            project_id=project_id,
            name=ASSETS_FOLDER_NAME,
        )

        created_nodes: list[dict] = []
        for idx, a in enumerate(assets_v2):
            folder_name = ASSET_TYPE_FOLDER_NAMES.get(a.type)
            if not folder_name:
                continue
            type_folder_id = await _get_or_create_child_folder(
                db=db,
                user_id=user.id,
                project_id=project_id,
                parent_id=assets_root_id,
                name=folder_name,
            )
            md_filename = asset_doc_filename(asset_type=a.type, name=a.name, asset_id=None)
            md_content = render_asset_doc_md(doc=a)
            md_node = await vfs_service.upsert_text_file(
                db=db,
                user_id=user.id,
                name=md_filename,
                content=md_content,
                parent_id=type_folder_id,
                workspace_id=None,
                project_id=project_id,
                content_type="text/markdown; charset=utf-8",
            )
            json_payload = assets_json_payloads[idx] if idx < len(assets_json_payloads) else a.model_dump()
            json_filename = asset_filename(asset_type=a.type, name=a.name, asset_id=None)
            json_node = await vfs_service.upsert_text_file(
                db=db,
                user_id=user.id,
                name=json_filename,
                content=json.dumps(json_payload, ensure_ascii=False, indent=2),
                parent_id=type_folder_id,
                workspace_id=None,
                project_id=project_id,
                content_type="application/json; charset=utf-8",
            )
            created_nodes.append(
                {
                    "type": a.type,
                    "name": a.name,
                    "md_node_id": str(md_node.id),
                    "md_filename": md_filename,
                    "json_node_id": str(json_node.id),
                    "json_filename": json_filename,
                }
            )

            # Ensure Asset Entity exists in DB
            db_type = a.type
            if db_type == "location":
                db_type = "scene"
            elif db_type == "effect":
                db_type = "vfx"
            
            existing_asset = (await db.execute(
                select(Asset).where(
                    Asset.project_id == project_id,
                    Asset.name == a.name,
                    Asset.type == db_type
                )
            )).scalars().first()
            
            if not existing_asset:
                 await asset_service.create_asset(
                    db=db,
                    user_id=user.id,
                    name=a.name,
                    type=db_type,
                    project_id=project_id,
                    script_id=script_id,
                    source="ai_agent",
                    category=None,
                    doc_node_id=md_node.id
                 )
                 existing_asset = (await db.execute(
                    select(Asset).where(
                        Asset.project_id == project_id,
                        Asset.name == a.name,
                        Asset.type == db_type
                    )
                 )).scalars().first()

            if existing_asset:
                 if not existing_asset.doc_node_id:
                     # Link existing asset to doc if not linked
                     existing_asset.doc_node_id = md_node.id
                     db.add(existing_asset)
                 
                 # Update tags
                 if a.keywords:
                    await asset_repository.replace_asset_tags(
                        db=db,
                        project_id=project_id,
                        asset_entity_id=existing_asset.id,
                        tags=a.keywords
                    )

            # 4. Handle Variants - create variant doc and bind doc_node_id
            if existing_asset and a.variants:
                existing_variants = await asset_service.get_asset_full(db=db, user_id=user.id, asset_id=existing_asset.id)
                current_vars = existing_variants.variants if existing_variants else []
                
                for v_draft in a.variants:
                    target_tag = (v_draft.stage_tag or "").strip()
                    if not target_tag and not v_draft.variant_code:
                         continue
                    
                    matched_v = None
                    if v_draft.variant_code:
                        for ev in current_vars:
                            if ev.variant_code == v_draft.variant_code:
                                matched_v = ev
                                break

                    if not matched_v and target_tag:
                        for ev in current_vars:
                            if (ev.stage_tag or "").strip() == target_tag:
                                matched_v = ev
                                break
                    
                    variant_key = v_draft.variant_code or target_tag or "default"
                    variant_md_filename = variant_doc_filename(asset_name=a.name, variant_key=variant_key)
                    variant_md_content = render_asset_variant_doc_md(
                        asset_type=a.type,
                        asset_name=a.name,
                        variant_code=v_draft.variant_code or "",
                        stage_tag=target_tag or None,
                        age_range=None,
                        attributes=v_draft.attributes or {},
                        prompt_template=v_draft.prompt_en,
                    )
                    variant_md_node = await vfs_service.upsert_text_file(
                        db=db,
                        user_id=user.id,
                        name=variant_md_filename,
                        content=variant_md_content,
                        parent_id=type_folder_id,
                        workspace_id=None,
                        project_id=project_id,
                        content_type="text/markdown; charset=utf-8",
                    )
                    
                    if matched_v:
                        await asset_service.update_variant(
                            db=db,
                            user_id=user.id,
                            variant_id=matched_v.id,
                            stage_tag=target_tag or None,
                            age_range=None,
                            attributes=v_draft.attributes,
                            prompt_template=v_draft.prompt_en,
                            is_default=None,
                            doc_node_id=variant_md_node.id,
                        )
                    else:
                        new_variant_result = await asset_service.create_variant(
                            db=db,
                            user_id=user.id,
                            asset_id=existing_asset.id,
                            variant_code=v_draft.variant_code,
                            stage_tag=target_tag or None,
                            age_range=None,
                            attributes=v_draft.attributes,
                            prompt_template=v_draft.prompt_en,
                            is_default=False
                        )
                        if new_variant_result and new_variant_result.variants:
                            new_v = new_variant_result.variants[-1]
                            await asset_service.update_variant(
                                db=db,
                                user_id=user.id,
                                variant_id=new_v.id,
                                stage_tag=None,
                                age_range=None,
                                attributes=None,
                                prompt_template=None,
                                is_default=None,
                                doc_node_id=variant_md_node.id,
                            )
                    created_nodes.append({
                        "type": a.type,
                        "name": a.name,
                        "variant": variant_key,
                        "variant_md_node_id": str(variant_md_node.id),
                        "variant_md_filename": variant_md_filename,
                    })
            
            # 5. Handle Episode Binding (Auto-bind based on first_appearance_episode)
            if existing_asset and a.first_appearance_episode:
                # Try to extract episode number from "EP001" or similar
                ep_num = None
                ep_match = re.search(r"(\d+)", str(a.first_appearance_episode))
                if ep_match:
                    try:
                        ep_num = int(ep_match.group(1))
                    except ValueError:
                        pass
                
                if ep_num is not None and ep_num > 0:
                    episode_res = await db.execute(
                        select(Episode).where(
                            Episode.project_id == project_id,
                            Episode.episode_number == ep_num,
                        )
                    )
                    target_episode = episode_res.scalars().first()
                    
                    if target_episode:
                        # Check if binding exists
                        binding_exists = await db.execute(
                            select(AssetBinding).where(
                                AssetBinding.episode_id == target_episode.id,
                                AssetBinding.asset_entity_id == existing_asset.id,
                            )
                        )
                        if not binding_exists.scalars().first():
                            # Create binding
                            new_binding = AssetBinding(
                                episode_id=target_episode.id,
                                asset_entity_id=existing_asset.id,
                                asset_variant_id=None, # Bind asset generally, not specific variant
                            )
                            db.add(new_binding)
                            await db.flush()
                            created_nodes.append({
                                "type": "binding",
                                "asset_name": a.name,
                                "episode": f"EP{ep_num:03d}",
                                "binding_id": str(new_binding.id)
                            })

        await db.commit()
        return ResponseBase(code=200, msg="OK", data={"plan_id": str(plan.id), "created": created_nodes, "provenance": provenance})

    if plan.kind == "asset_bind" and plan.tool_id == "asset_bind":
        episode_number = int((plan.inputs or {}).get("episode_number") or 0)
        bindings_doc = (plan.inputs or {}).get("bindings_doc") or {}
        if episode_number <= 0:
            raise HTTPException(status_code=400, detail="invalid_episode_number")

        doc = EpisodeBindingsDocV1.model_validate(bindings_doc)
        bindings_root_id = await _get_or_create_root_folder(
            db=db,
            user_id=user.id,
            project_id=project_id,
            name=BINDINGS_FOLDER_NAME,
        )
        filename = bindings_filename(episode_number=episode_number)
        content = json.dumps(doc.model_dump(), ensure_ascii=False, indent=2)
        node = await vfs_service.create_text_file(
            db=db,
            user_id=user.id,
            name=filename,
            content=content,
            parent_id=bindings_root_id,
            workspace_id=None,
            project_id=project_id,
            content_type="application/json; charset=utf-8",
        )
        
        episode_res = await db.execute(
            select(Episode).where(
                Episode.project_id == project_id,
                Episode.episode_number == episode_number,
            )
        )
        episode = episode_res.scalars().first()
        
        db_bindings_created = []
        if episode:
            for binding_item in doc.bindings:
                db_type = binding_item.asset_type
                if db_type == "location":
                    db_type = "scene"
                elif db_type == "effect":
                    db_type = "vfx"
                
                asset_res = await db.execute(
                    select(Asset).where(
                        Asset.project_id == project_id,
                        Asset.name == binding_item.asset_name,
                        Asset.type == db_type,
                    )
                )
                asset = asset_res.scalars().first()
                if asset:
                    existing_binding_res = await db.execute(
                        select(AssetBinding).where(
                            AssetBinding.episode_id == episode.id,
                            AssetBinding.asset_entity_id == asset.id,
                        )
                    )
                    existing_binding = existing_binding_res.scalars().first()
                    if existing_binding:
                        db_bindings_created.append({
                            "asset_name": asset.name,
                            "binding_id": str(existing_binding.id),
                            "status": "existing",
                        })
                    else:
                        new_binding = AssetBinding(
                            episode_id=episode.id,
                            asset_entity_id=asset.id,
                            asset_variant_id=None,
                        )
                        db.add(new_binding)
                        await db.flush()
                        db_bindings_created.append({
                            "asset_name": asset.name,
                            "binding_id": str(new_binding.id),
                            "status": "created",
                        })
        
        return ResponseBase(code=200, msg="OK", data={
            "plan_id": str(plan.id),
            "created": [{"episode_number": episode_number, "node_id": str(node.id), "filename": filename}],
            "db_bindings": db_bindings_created,
            "provenance": provenance,
        })

    if plan.kind == "asset_doc_upsert" and plan.tool_id == "asset_doc_upsert":
        raw_type = str((plan.inputs or {}).get("asset_type") or "").strip()
        raw_name = str((plan.inputs or {}).get("asset_name") or "").strip()
        content_md = str((plan.inputs or {}).get("content_md") or "")
        node_id_raw = (plan.inputs or {}).get("node_id")
        match_type = str((plan.inputs or {}).get("match_type") or "").strip()
        confidence = float((plan.inputs or {}).get("confidence") or 0.0)
        reason_md = str((plan.inputs or {}).get("reason_md") or "")
        diff_md = str((plan.inputs or {}).get("diff_md") or "")

        if not raw_type or not raw_name:
            raise HTTPException(status_code=400, detail="invalid_asset_ref")

        assets_root_id = await _get_or_create_root_folder(
            db=db,
            user_id=user.id,
            project_id=project_id,
            name=ASSETS_FOLDER_NAME,
        )
        folder_name = ASSET_TYPE_FOLDER_NAMES.get(raw_type)
        if not folder_name:
            raise HTTPException(status_code=400, detail="invalid_asset_type")
        type_folder_id = await _get_or_create_child_folder(
            db=db,
            user_id=user.id,
            project_id=project_id,
            parent_id=assets_root_id,
            name=folder_name,
        )

        filename = asset_doc_filename(asset_type=raw_type, name=raw_name, asset_id=None)
        parent_id = type_folder_id
        if node_id_raw:
            try:
                node_uuid = UUID(str(node_id_raw))
            except Exception:
                raise HTTPException(status_code=400, detail="invalid_node_id")
            node = await db.get(FileNode, node_uuid)
            if not node or node.is_folder or not node.parent_id:
                raise HTTPException(status_code=404, detail="node_not_found")
            filename = node.name or filename
            parent_id = node.parent_id

        written = await vfs_service.upsert_text_file(
            db=db,
            user_id=user.id,
            name=filename,
            content=(content_md or "").rstrip() + "\n",
            parent_id=parent_id,
            workspace_id=None,
            project_id=project_id,
            content_type="text/markdown; charset=utf-8",
        )
        return ResponseBase(
            code=200,
            msg="OK",
            data={
                "plan_id": str(plan.id),
                "created": [{"node_id": str(written.id), "filename": written.name}],
                "decision": {"match_type": match_type, "confidence": confidence, "reason_md": reason_md, "diff_md": diff_md},
                "provenance": provenance,
            },
        )

    if plan.kind == "storyboard_apply" and plan.tool_id == "storyboard_apply":
        storyboard_id_raw = (plan.inputs or {}).get("storyboard_id")
        episode_id_raw = (plan.inputs or {}).get("episode_id")
        scene_number_raw = (plan.inputs or {}).get("scene_number")
        scene_code_raw = (plan.inputs or {}).get("scene_code")
        mode = str((plan.inputs or {}).get("mode") or "replace").strip() or "replace"
        shots_raw = (plan.inputs or {}).get("shots") or []
        storyboard_id: UUID | None = None
        if storyboard_id_raw:
            try:
                storyboard_id = UUID(str(storyboard_id_raw))
            except Exception:
                raise HTTPException(status_code=400, detail="invalid_storyboard_id")
        if mode not in {"replace", "append"}:
            raise HTTPException(status_code=400, detail="invalid_mode")
        if not isinstance(shots_raw, list) or not shots_raw:
            raise HTTPException(status_code=400, detail="invalid_shots")

        episode: Episode | None = None
        scene_number: int | None = None
        scene_code = str(scene_code_raw or "").strip() or None
        location = None
        location_type = None
        time_of_day = None

        if storyboard_id is not None:
            row = (
                await db.execute(
                    select(Storyboard, Episode)
                    .join(Episode, Storyboard.episode_id == Episode.id)
                    .where(Storyboard.id == storyboard_id, Episode.project_id == project_id)
                )
            ).first()
            if not row:
                raise HTTPException(status_code=404, detail="storyboard_not_found")
            storyboard, episode = row
            if not storyboard.scene_number:
                raise HTTPException(status_code=400, detail="scene_number_required")
            scene_number = int(storyboard.scene_number)
            if not scene_code:
                scene_code = str(storyboard.scene_code or "").strip() or None
            location = storyboard.location
            location_type = storyboard.location_type
            time_of_day = storyboard.time_of_day
        else:
            if not episode_id_raw:
                raise HTTPException(status_code=400, detail="storyboard_id_or_episode_id_required")
            try:
                episode_id = UUID(str(episode_id_raw))
            except Exception:
                raise HTTPException(status_code=400, detail="invalid_episode_id")
            episode = await db.get(Episode, episode_id)
            if episode is None or episode.project_id != project_id:
                raise HTTPException(status_code=404, detail="episode_not_found")

            if scene_number_raw is not None and str(scene_number_raw).strip() != "":
                try:
                    scene_number = int(scene_number_raw)
                except Exception:
                    raise HTTPException(status_code=400, detail="invalid_scene_number")
                if scene_number <= 0:
                    raise HTTPException(status_code=400, detail="invalid_scene_number")
            else:
                max_res = await db.execute(
                    select(func.coalesce(func.max(Storyboard.scene_number), 0)).where(
                        Storyboard.episode_id == episode.id,
                    )
                )
                scene_number = int(max_res.scalar_one() or 0) + 1
            if not scene_code:
                scene_code = f"EP{int(episode.episode_number):03d}_SC{int(scene_number):02d}"
            location = (plan.inputs or {}).get("location")
            location_type = (plan.inputs or {}).get("location_type")
            time_of_day = (plan.inputs or {}).get("time_of_day")

        storyboard_root_id = None
        if episode.storyboard_root_node_id:
            node = await db.get(FileNode, episode.storyboard_root_node_id)
            if node and node.is_folder:
                storyboard_root_id = node.id

        if not storyboard_root_id:
            folder = await vfs_service.create_folder(
                db=db,
                user_id=user.id,
                name=STORYBOARD_FOLDER_NAME,
                parent_id=None,
                workspace_id=None,
                project_id=project_id,
            )
            storyboard_root_id = folder.id
            episode.storyboard_root_node_id = folder.id
            db.add(episode)
            await db.flush()

        if mode == "replace":
            await db.execute(delete(Storyboard).where(Storyboard.episode_id == episode.id, Storyboard.scene_number == scene_number))
            start_num = 1
        else:
            max_res = await db.execute(
                select(func.coalesce(func.max(Storyboard.shot_number), 0)).where(
                    Storyboard.episode_id == episode.id,
                    Storyboard.scene_number == scene_number,
                )
            )
            start_num = int(max_res.scalar_one() or 0) + 1

        created_rows: list[dict] = []
        for idx, item in enumerate(shots_raw, start=0):
            draft = AIShotDraft.model_validate(item)
            shot_number = start_num + idx
            shot_code = f"EP{int(episode.episode_number):03d}_SC{scene_number:02d}_SH{shot_number:02d}"
            r = Storyboard(
                episode_id=episode.id,
                shot_code=shot_code,
                shot_number=shot_number,
                scene_code=scene_code,
                scene_number=scene_number,
                shot_type=(draft.shot_type or "").strip() or None,
                camera_move=(draft.camera_move or "").strip() or None,
                narrative_function=(draft.narrative_function or "").strip() or None,
                location=(str(location).strip() if location is not None else None) or None,
                location_type=(str(location_type).strip() if location_type is not None else None) or None,
                time_of_day=(str(time_of_day).strip() if time_of_day is not None else None) or None,
                description=(draft.description or "").strip() or None,
                dialogue=(draft.dialogue or "").strip() or None,
                duration_estimate=draft.duration_estimate,
                active_assets=list(draft.active_assets or []),
            )
            db.add(r)
            await db.flush()
            created_rows.append({"storyboard_id": str(r.id), "shot_code": r.shot_code, "shot_number": int(r.shot_number)})

            md_content = _render_shot_md(shot_code, draft)
            md_filename = f"{shot_code}.md"
            await vfs_service.upsert_text_file(
                db=db,
                user_id=user.id,
                name=md_filename,
                content=md_content,
                parent_id=storyboard_root_id,
                workspace_id=None,
                project_id=project_id,
                content_type="text/markdown; charset=utf-8",
            )

        await db.commit()
        return ResponseBase(
            code=200,
            msg="OK",
            data={
                "plan_id": str(plan.id),
                "episode_id": str(episode.id),
                "scene_number": int(scene_number or 0),
                "scene_code": scene_code,
                "created": created_rows,
                "provenance": provenance,
            },
        )

    if plan.kind == "image_prompt_upsert" and plan.tool_id == "image_prompt_upsert":
        prompts_raw = (plan.inputs or {}).get("prompts") or []
        if not isinstance(prompts_raw, list) or not prompts_raw:
            raise HTTPException(status_code=400, detail="invalid_prompts")
        created_rows: list[dict] = []
        for p in prompts_raw:
            if not isinstance(p, dict):
                continue
            storyboard_id_raw = p.get("storyboard_id")
            if not storyboard_id_raw:
                continue
            try:
                storyboard_id = UUID(str(storyboard_id_raw))
            except Exception:
                raise HTTPException(status_code=400, detail="invalid_storyboard_id")

            exists = (
                await db.execute(
                    select(Storyboard.id)
                    .join(Episode, Storyboard.episode_id == Episode.id)
                    .where(Storyboard.id == storyboard_id, Episode.project_id == project_id)
                )
            ).first()
            if not exists:
                raise HTTPException(status_code=404, detail="storyboard_not_found")

            await db.execute(delete(ImagePrompt).where(ImagePrompt.storyboard_id == storyboard_id))
            row = ImagePrompt(
                storyboard_id=storyboard_id,
                prompt_main=p.get("prompt_main"),
                negative_prompt=p.get("negative_prompt"),
                style_model=p.get("style_model"),
                aspect_ratio=p.get("aspect_ratio"),
                character_prompts=list(p.get("character_prompts") or []),
                camera_settings=dict(p.get("camera_settings") or {}),
                generation_notes=p.get("generation_notes"),
            )
            db.add(row)
            await db.flush()
            created_rows.append({"image_prompt_id": str(row.id), "storyboard_id": str(storyboard_id)})
        await db.commit()
        return ResponseBase(code=200, msg="OK", data={"plan_id": str(plan.id), "created": created_rows, "provenance": provenance})

    if plan.kind == "video_prompt_upsert" and plan.tool_id == "video_prompt_upsert":
        prompts_raw = (plan.inputs or {}).get("prompts") or []
        if not isinstance(prompts_raw, list) or not prompts_raw:
            raise HTTPException(status_code=400, detail="invalid_prompts")
        created_rows: list[dict] = []
        for p in prompts_raw:
            if not isinstance(p, dict):
                continue
            storyboard_id_raw = p.get("storyboard_id")
            if not storyboard_id_raw:
                continue
            try:
                storyboard_id = UUID(str(storyboard_id_raw))
            except Exception:
                raise HTTPException(status_code=400, detail="invalid_storyboard_id")

            exists = (
                await db.execute(
                    select(Storyboard.id)
                    .join(Episode, Storyboard.episode_id == Episode.id)
                    .where(Storyboard.id == storyboard_id, Episode.project_id == project_id)
                )
            ).first()
            if not exists:
                raise HTTPException(status_code=404, detail="storyboard_not_found")

            await db.execute(delete(VideoPrompt).where(VideoPrompt.storyboard_id == storyboard_id))
            row = VideoPrompt(
                storyboard_id=storyboard_id,
                prompt_main=p.get("prompt_main"),
                negative_prompt=p.get("negative_prompt"),
                style_model=p.get("style_model"),
                aspect_ratio=p.get("aspect_ratio"),
                character_prompts=list(p.get("character_prompts") or []),
                camera_settings=dict(p.get("camera_settings") or {}),
                duration=p.get("duration"),
                generation_notes=p.get("generation_notes"),
            )
            db.add(row)
            await db.flush()
            created_rows.append({"video_prompt_id": str(row.id), "storyboard_id": str(storyboard_id)})
        await db.commit()
        return ResponseBase(code=200, msg="OK", data={"plan_id": str(plan.id), "created": created_rows, "provenance": provenance})

    raise HTTPException(status_code=400, detail="unsupported_plan")
