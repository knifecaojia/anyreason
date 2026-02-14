from __future__ import annotations

from app.ai_scene_test.tools import _parse_markdown_card, _split_markdown_cards


def test_split_markdown_cards_by_hr() -> None:
    md = """
### 角色资产卡片：@叶辰_常态
Name: 叶辰
Keywords: 复仇者, 元印师
FirstAppearanceEpisode: 2

---

### 角色资产卡片：@古荒_常态
Name: 古荒
Keywords: 反派, 天才元印师
"""
    parts = _split_markdown_cards(md)
    assert len(parts) == 2
    assert "叶辰" in parts[0]
    assert "古荒" in parts[1]


def test_split_markdown_cards_by_heading_fallback() -> None:
    md = """
### 角色资产卡片：@叶辰_常态
Name: 叶辰

### 角色资产卡片：@古荒_常态
Name: 古荒
"""
    parts = _split_markdown_cards(md)
    assert len(parts) == 2
    assert parts[0].lstrip().startswith("###")
    assert parts[1].lstrip().startswith("###")


def test_parse_markdown_card_extracts_fields() -> None:
    md = """
### 角色资产卡片：@叶辰_常态

Name: 叶辰
Keywords: 复仇者, 黄阶元印师
FirstAppearanceEpisode: 2

**AI绘画提示词**
> best quality, a-pose
""".strip()
    out = _parse_markdown_card(md, default_episode=None)
    assert out["call_name"] == "@叶辰_常态"
    assert out["name"] == "叶辰"
    assert out["keywords"] == ["复仇者", "黄阶元印师"]
    assert out["first_appearance_episode"] == 2
    assert out["details_md"].endswith("\n")
    assert "AI绘画提示词" in out["details_md"]


def test_parse_markdown_card_falls_back_to_default_episode() -> None:
    md = """
### 角色资产卡片：@云木_常态
Name: 云木
Keywords: 师父
""".strip()
    out = _parse_markdown_card(md, default_episode=7)
    assert out["first_appearance_episode"] == 7

