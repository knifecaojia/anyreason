from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.exceptions import AppError
from app.models import Episode, Project, Scene, Script
from app.storage import get_minio_client


_BODY_MARKER_RE = re.compile(r"剧本正文")

_EPISODE_HEADER_RE = re.compile(
    r"^\s*(?:#{1,6}\s*)?(?:"
    r"(?:(?:EPISODE|EP)\s*(?P<ep_num>\d{1,4})(?:\s*(?:[:：\-—]\s*(?P<ep_title>.*?))|\s*(?P<ep_title_paren>[（(].*?[）)]))?)"
    r"|(?:第\s*(?P<cn_num>[\d一二三四五六七八九十百千两零〇]{1,8})\s*(?:集|话|章)(?:\s*(?:[:：\-—]\s*(?P<cn_title>.*?))|\s*(?P<cn_title_paren>[（(].*?[）)]))?)"
    r")\s*$",
    re.IGNORECASE | re.MULTILINE,
)

_SCENE_HEADER_RE = re.compile(
    r"^\s*(?:#{1,6}\s*)?(?:"
    r"(?:(?:SCENE|Scene)\s*(?P<sc_num>\d{1,4})(?:\s*(?:[:：\-—]\s*(?P<sc_title>.*?))|\s*(?P<sc_title_paren>[（(].*?[）)]))?)"
    r"|(?:第\s*(?P<cn_num>[\d一二三四五六七八九十百千两零〇]{1,8})\s*(?:场|幕)(?:\s*(?:[:：\-—]\s*(?P<cn_title>.*?))|\s*(?P<cn_title_paren>[（(].*?[）)]))?)"
    r")\s*$",
    re.MULTILINE,
)


@dataclass(frozen=True)
class ParsedScene:
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
    scenes: list[ParsedScene]


def _strip_bom(value: str) -> str:
    if value.startswith("\ufeff"):
        return value.lstrip("\ufeff")
    return value


def _count_non_whitespace_chars(value: str) -> int:
    return len(re.findall(r"\S", value))


def _find_marker_start(text: str) -> int:
    m = _BODY_MARKER_RE.search(text)
    return m.end() if m else 0


def _iter_headers(pattern: re.Pattern[str], text: str) -> Iterable[re.Match[str]]:
    return pattern.finditer(text)


def _strip_wrapping_brackets(value: str) -> str:
    v = (value or "").strip()
    pairs = {
        ("(", ")"),
        ("（", "）"),
        ("[", "]"),
        ("【", "】"),
        ("{", "}"),
    }
    for left, right in pairs:
        if v.startswith(left) and v.endswith(right) and len(v) >= 2:
            inner = v[1:-1].strip()
            return inner or v
    return v


def _parse_cn_int(value: str) -> int | None:
    s = (value or "").strip()
    if not s:
        return None
    if s.isdigit():
        return int(s)

    s = s.replace("两", "二").replace("〇", "零")
    digit = {"零": 0, "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    unit = {"十": 10, "百": 100, "千": 1000}

    total = 0
    current = 0
    seen = False
    for ch in s:
        if ch in digit:
            current = digit[ch]
            seen = True
            continue
        if ch in unit:
            seen = True
            u = unit[ch]
            if current == 0:
                current = 1
            total += current * u
            current = 0
            continue
        return None
    if not seen:
        return None
    return total + current


def _episode_title(num: int, raw: str | None) -> str | None:
    title = _strip_wrapping_brackets(raw or "")
    if title:
        return title
    return None

def _episode_code(num: int) -> str:
    return f"EP{num:03d}"



def _scene_code(ep_num: int, sc_num: int) -> str:
    return f"EP{ep_num:03d}_SC{sc_num:02d}"


def parse_script_to_episodes(raw_text: str) -> list[ParsedEpisode]:
    text = _strip_bom(raw_text or "")
    base = text[_find_marker_start(text) :]

    matches = list(_iter_headers(_EPISODE_HEADER_RE, base))
    if not matches:
        segment = base.strip("\n")
        word_count = _count_non_whitespace_chars(segment)
        scenes = parse_episode_to_scenes(1, segment)
        return [
            ParsedEpisode(
                episode_number=1,
                episode_code=_episode_code(1),
                title=None,
                script_full_text=segment,
                start_line=1,
                end_line=base.count("\n") + 1 if base else 1,
                word_count=word_count,
                scenes=scenes,
            )
        ]

    out: list[ParsedEpisode] = []
    for idx, m in enumerate(matches):
        start = m.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(base)
        segment = base[start:end].strip("\n")
        if not segment.strip():
            continue

        num_raw = m.group("ep_num") or m.group("cn_num")
        if not num_raw:
            continue
        parsed_num = _parse_cn_int(num_raw)
        if parsed_num is None:
            continue
        ep_num = parsed_num
        ep_title = (
            m.group("ep_title")
            or m.group("ep_title_paren")
            or m.group("cn_title")
            or m.group("cn_title_paren")
        )

        start_line = base[:start].count("\n") + 1
        end_line = base[:end].count("\n") + 1
        word_count = _count_non_whitespace_chars(segment)
        scenes = parse_episode_to_scenes(ep_num, segment)

        out.append(
            ParsedEpisode(
                episode_number=ep_num,
                episode_code=_episode_code(ep_num),
                title=_episode_title(ep_num, ep_title),
                script_full_text=segment,
                start_line=start_line,
                end_line=end_line,
                word_count=word_count,
                scenes=scenes,
            )
        )

    out.sort(key=lambda e: e.episode_number)
    return out


def parse_episode_to_scenes(ep_num: int, episode_text: str) -> list[ParsedScene]:
    matches = list(_iter_headers(_SCENE_HEADER_RE, episode_text))
    if not matches:
        return []

    scenes: list[ParsedScene] = []
    for idx, m in enumerate(matches):
        start = m.start()
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(episode_text)
        segment = episode_text[start:end].strip("\n")
        if not segment.strip():
            continue

        num_raw = m.group("sc_num") or m.group("cn_num")
        if not num_raw:
            continue
        parsed_num = _parse_cn_int(num_raw)
        if parsed_num is None:
            continue
        sc_num = parsed_num
        title_raw = (
            m.group("sc_title")
            or m.group("sc_title_paren")
            or m.group("cn_title")
            or m.group("cn_title_paren")
            or ""
        )
        title = _strip_wrapping_brackets(title_raw).strip() or None

        scenes.append(
            ParsedScene(
                scene_number=sc_num,
                scene_code=_scene_code(ep_num, sc_num),
                title=title,
                content=segment,
            )
        )

    scenes.sort(key=lambda s: s.scene_number)
    return scenes


async def _read_script_text_from_minio(script: Script) -> str:
    client = get_minio_client()

    def _op():
        obj = client.get_object(script.minio_bucket, script.minio_key)
        try:
            payload = b"".join(obj.stream(32 * 1024))
        finally:
            obj.close()
            obj.release_conn()
        return payload

    raw = await run_in_threadpool(_op)
    return raw.decode("utf-8", errors="replace")


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

            await db.execute(delete(Scene).where(Scene.episode_id == ep.id))
            for sc in p.scenes:
                db.add(
                    Scene(
                        episode_id=ep.id,
                        scene_code=sc.scene_code,
                        scene_number=sc.scene_number,
                        title=sc.title,
                        content=sc.content,
                    )
                )

            structured.append(ep)

        await db.commit()
        for ep in structured:
            await db.refresh(ep)
        return structured


script_structure_service = ScriptStructureService()
