from __future__ import annotations

import io
import re
from dataclasses import dataclass
from typing import Iterable
from uuid import UUID

from sqlalchemy import delete, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.exceptions import AppError
from app.models import Episode, Project, Storyboard, Script, AssetBinding
from app.storage import get_minio_client

BODY_MARKER = "剧本正文"

UNASSIGNED_EPISODE_CODE = "UNASSIGNED"

_EPISODE_EN_RE = re.compile(
    r"^\s*\*{0,2}\s*(?:EPISODE|Episode)\s*(?P<ep_num>\d+)\s*[:：\-]\s*(?P<ep_title>.*?)\s*\*{0,2}\s*$",
    re.MULTILINE,
)
_EPISODE_CN_RE = re.compile(
    r"^\s*\*{0,2}\s*第(?P<cn_num>[0-9一二三四五六七八九十百千两零〇]+)(?:集|话|章|卷)\s*(?:[:：\-]\s*(?P<cn_title>.*?)|（(?P<cn_title_paren_zh>[^）]+)）|\((?P<cn_title_paren_en>[^)]+)\))?\s*\*{0,2}\s*$",
    re.MULTILINE,
)

_SCENE_EN_RE = re.compile(
    r"^(?:SCENE|Scene)\s*(?P<sc_num>\d+)\s*[:：\-]\s*(?P<sc_title>.*)?$",
    re.MULTILINE,
)
_SCENE_CN_RE = re.compile(
    r"^第(?P<cn_num>[0-9一二三四五六七八九十百千两零〇]+)场\s*(?:[:：\-]\s*(?P<cn_title>.*)|（(?P<cn_title_paren_zh>[^）]+)）|\((?P<cn_title_paren_en>[^)]+)\))?\s*$",
    re.MULTILINE,
)

@dataclass(frozen=True)
class ParsedStoryboard:
    shot_number: int
    shot_code: str
    scene_number: int
    scene_code: str
    title: str | None
    content: str


@dataclass(frozen=True)
class ParsedEpisode:
    episode_number: int
    episode_code: str
    title: str | None
    script_full_text: str
    start_line: int | None
    end_line: int | None
    word_count: int
    storyboards: list[ParsedStoryboard]

def _strip_bom(value: str) -> str:
    return (value or "").lstrip("\ufeff")


def _find_marker_start(text: str) -> int:
    if not text:
        return 0
    lines = text.splitlines(keepends=True)
    pos = 0
    for line in lines:
        if line.strip() == BODY_MARKER:
            pos += len(line)
            return pos
        pos += len(line)
    return 0


def _count_non_whitespace_chars(value: str) -> int:
    return sum(1 for ch in (value or "") if not ch.isspace())


def _iter_headers(regexes: list[re.Pattern[str]], text: str) -> list[re.Match[str]]:
    matches: list[re.Match[str]] = []
    for r in regexes:
        matches.extend(list(r.finditer(text)))
    matches.sort(key=lambda m: m.start())
    return matches


def _parse_cn_int(value: str) -> int | None:
    s = (value or "").strip()
    if not s:
        return None
    if s.isdigit():
        return int(s)

    digits = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    unit_map = {"十": 10, "百": 100, "千": 1000}

    total = 0
    number = 0
    for ch in s:
        if ch in digits:
            number = digits[ch]
            continue
        if ch in unit_map:
            unit = unit_map[ch]
            total += (number or 1) * unit
            number = 0
            continue
        return None

    total += number
    return total if total > 0 else None


def _strip_wrapping_brackets(value: str) -> str:
    v = (value or "").strip()
    pairs = [("(", ")"), ("（", "）"), ("[", "]"), ("【", "】"), ("《", "》")]
    for l, r in pairs:
        if v.startswith(l) and v.endswith(r) and len(v) >= 2:
            return v[1:-1].strip()
    return v


def _episode_code(ep_num: int) -> str:
    return f"EP{ep_num:03d}"


def _scene_code(ep_num: int, sc_num: int) -> str:
    return f"EP{ep_num:03d}_SC{sc_num:02d}"


def _episode_title(ep_num: int, title: str | None) -> str | None:
    t = _strip_wrapping_brackets(title or "").strip()
    return t or None


def _shot_code(ep_num: int, sc_num: int, sh_num: int) -> str:
    return f"EP{ep_num:03d}_SC{sc_num:02d}_SH{sh_num:02d}"


def parse_script_to_episodes(raw_text: str) -> list[ParsedEpisode]:
    text = _strip_bom(raw_text or "")
    base = text[_find_marker_start(text) :]

    matches = _iter_headers([_EPISODE_EN_RE, _EPISODE_CN_RE], base)
    if not matches:
        segment = base.strip("\n")
        word_count = _count_non_whitespace_chars(segment)
        storyboards = parse_episode_to_storyboards(1, segment)
        return [
            ParsedEpisode(
                episode_number=1,
                episode_code=_episode_code(1),
                title=None,
                script_full_text=segment,
                start_line=1,
                end_line=base.count("\n") + 1 if base else 1,
                word_count=word_count,
                storyboards=storyboards,
            )
        ]

    out: list[ParsedEpisode] = []
    for idx, m in enumerate(matches):
        start = m.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(base)
        segment = base[start:end].strip("\n")
        if not segment.strip():
            continue

        num_raw = m.groupdict().get("ep_num") or m.groupdict().get("cn_num")
        if not num_raw:
            continue
        parsed_num = _parse_cn_int(num_raw)
        if parsed_num is None:
            continue
        ep_num = parsed_num
        ep_title = (
            m.groupdict().get("ep_title")
            or m.groupdict().get("cn_title")
            or m.groupdict().get("cn_title_paren_zh")
            or m.groupdict().get("cn_title_paren_en")
        )

        start_line = base[:start].count("\n") + 1
        end_line = base[:end].count("\n") + 1
        word_count = _count_non_whitespace_chars(segment)
        storyboards = parse_episode_to_storyboards(ep_num, segment)

        out.append(
            ParsedEpisode(
                episode_number=ep_num,
                episode_code=_episode_code(ep_num),
                title=_episode_title(ep_num, ep_title),
                script_full_text=segment,
                start_line=start_line,
                end_line=end_line,
                word_count=word_count,
                storyboards=storyboards,
            )
        )

    out.sort(key=lambda e: e.episode_number)
    return out


def parse_episode_to_storyboards(ep_num: int, episode_text: str) -> list[ParsedStoryboard]:
    matches = _iter_headers([_SCENE_EN_RE, _SCENE_CN_RE], episode_text)
    if not matches:
        return []

    storyboards: list[ParsedStoryboard] = []

    for idx, m in enumerate(matches):
        start = m.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(episode_text)
        segment = episode_text[start:end].strip("\n")
        if not segment.strip():
            continue

        num_raw = m.groupdict().get("sc_num") or m.groupdict().get("cn_num")
        if not num_raw:
            continue
        parsed_num = _parse_cn_int(num_raw)
        if parsed_num is None:
            continue
        sc_num = parsed_num
        title_raw = (
            m.groupdict().get("sc_title")
            or m.groupdict().get("cn_title")
            or m.groupdict().get("cn_title_paren_zh")
            or m.groupdict().get("cn_title_paren_en")
            or ""
        )
        title = _strip_wrapping_brackets(title_raw).strip() or None

        storyboards.append(
            ParsedStoryboard(
                shot_number=1,
                shot_code=_shot_code(ep_num, sc_num, 1),
                scene_number=sc_num,
                scene_code=_scene_code(ep_num, sc_num),
                title=title,
                content=segment,
            )
        )

    storyboards.sort(key=lambda s: (s.scene_number, s.shot_number))
    return storyboards


async def _read_script_text_from_minio(script: Script) -> str:
    client = get_minio_client()

    def _op() -> bytes:
        obj = client.get_object(bucket_name=script.minio_bucket, object_name=script.minio_key)
        try:
            return obj.read()
        finally:
            obj.close()
            obj.release_conn()

    data = await run_in_threadpool(_op)
    return data.decode("utf-8", errors="replace")


class ScriptStructureService:
    async def structure_script(self, *, db: AsyncSession, user_id: UUID, script_id: UUID) -> list[Episode]:
        result = await db.execute(
            select(Script).where(
                Script.id == script_id,
                Script.owner_id == user_id,
                Script.is_deleted.is_(False),
            )
        )
        script = result.scalars().first()
        if not script:
            raise AppError(msg="Script not found or not authorized", code=404, status_code=404)

        text = await _read_script_text_from_minio(script)
        parsed = parse_script_to_episodes(text)

        project = await db.get(Project, script_id)
        if not project:
            project = Project(id=script_id, owner_id=user_id, name=script.title)
            db.add(project)
            await db.flush()

        existing_result = await db.execute(select(Episode).where(Episode.project_id == project.id))
        existing = list(existing_result.scalars().all())
        by_code = {e.episode_code: e for e in existing}
        keep_codes = {p.episode_code for p in parsed}

        for ep in existing:
            if ep.episode_code not in keep_codes:
                await db.delete(ep)

        structured: list[Episode] = []
        for p in parsed:
            ep = by_code.get(p.episode_code)
            if not ep:
                ep = Episode(
                    project_id=project.id,
                    episode_code=p.episode_code,
                    episode_number=p.episode_number,
                )
                db.add(ep)
                await db.flush()

            ep.episode_number = p.episode_number
            ep.title = p.title
            ep.word_count = p.word_count
            ep.start_line = p.start_line
            ep.end_line = p.end_line
            ep.script_full_text = p.script_full_text

            # Delete existing storyboards for this episode and re-create
            await db.execute(delete(Storyboard).where(Storyboard.episode_id == ep.id))

            for sb in p.storyboards:
                db.add(
                    Storyboard(
                        episode_id=ep.id,
                        shot_code=sb.shot_code,
                        shot_number=sb.shot_number,
                        scene_code=sb.scene_code,
                        scene_number=sb.scene_number,
                        description=f"[{sb.title}] {sb.content}" if sb.title else sb.content,
                    )
                )

            structured.append(ep)

        await db.commit()
        for ep in structured:
            await db.refresh(ep)
        return structured

    async def structure_script_non_destructive(
        self,
        *,
        db: AsyncSession,
        user_id: UUID,
        script_id: UUID,
        binding_policy: str = "preserve",
    ) -> list[Episode]:
        result = await db.execute(
            select(Script).where(
                Script.id == script_id,
                Script.owner_id == user_id,
                Script.is_deleted.is_(False),
            )
        )
        script = result.scalars().first()
        if not script:
            raise AppError(msg="Script not found or not authorized", code=404, status_code=404)

        text = await _read_script_text_from_minio(script)
        parsed = parse_script_to_episodes(text)

        project = await db.get(Project, script_id)
        if not project:
            project = Project(id=script_id, owner_id=user_id, name=script.title)
            db.add(project)
            await db.flush()

        existing_result = await db.execute(
            select(Episode).where(Episode.project_id == project.id, Episode.episode_code != UNASSIGNED_EPISODE_CODE)
        )
        existing = list(existing_result.scalars().all())
        by_code = {e.episode_code: e for e in existing}
        keep_codes = {p.episode_code for p in parsed}

        unassigned_res = await db.execute(
            select(Episode).where(Episode.project_id == project.id, Episode.episode_code == UNASSIGNED_EPISODE_CODE)
        )
        unassigned_episode = unassigned_res.scalars().first()
        if not unassigned_episode:
            unassigned_episode = Episode(
                project_id=project.id,
                episode_number=0,
                episode_code=UNASSIGNED_EPISODE_CODE,
                title="未分集",
            )
            db.add(unassigned_episode)
            await db.flush()

        for ep in existing:
            if ep.episode_code not in keep_codes:
                bindings_res = await db.execute(
                    select(AssetBinding).where(AssetBinding.episode_id == ep.id)
                )
                orphan_bindings = bindings_res.scalars().all()
                for binding in orphan_bindings:
                    binding.episode_id = unassigned_episode.id
                
                # Mark as orphaned instead of deleting
                ep.status = "orphaned"
                ep.stage_tag = "archived"
                db.add(ep)

        # Handle binding policy for non-orphaned episodes
        if binding_policy in ["clear_episode_bindings", "clear_all_bindings"]:
            kept_episode_ids = [ep.id for ep in existing if ep.episode_code in keep_codes]
            if kept_episode_ids:
                await db.execute(
                    delete(AssetBinding).where(AssetBinding.episode_id.in_(kept_episode_ids))
                )

        structured: list[Episode] = []
        for p in parsed:
            ep = by_code.get(p.episode_code)
            if not ep:
                ep = Episode(
                    project_id=project.id,
                    episode_code=p.episode_code,
                    episode_number=p.episode_number,
                    status="pending",
                )
                db.add(ep)
                await db.flush()
            else:
                # Reactivate if it was orphaned
                if ep.status == "orphaned":
                    ep.status = "pending"
                    ep.stage_tag = None

            ep.episode_number = p.episode_number
            ep.title = p.title
            ep.word_count = p.word_count
            ep.start_line = p.start_line
            ep.end_line = p.end_line
            ep.script_full_text = p.script_full_text

            # Check if storyboards exist
            sb_count_res = await db.execute(
                select(func.count()).select_from(Storyboard).where(Storyboard.episode_id == ep.id)
            )
            sb_count = sb_count_res.scalar() or 0

            # Only reseed if empty (default non-destructive policy)
            if sb_count == 0:
                for sb in p.storyboards:
                    db.add(
                        Storyboard(
                            episode_id=ep.id,
                            shot_code=sb.shot_code,
                            shot_number=sb.shot_number,
                            scene_code=sb.scene_code,
                            scene_number=sb.scene_number,
                            description=f"[{sb.title}] {sb.content}" if sb.title else sb.content,
                        )
                    )

            structured.append(ep)

        await db.commit()
        for ep in structured:
            await db.refresh(ep)
        return structured



script_structure_service = ScriptStructureService()
