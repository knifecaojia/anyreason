from app.services.script_structure_service import parse_script_to_episodes


def test_parse_uses_body_marker_and_splits_episodes():
    text = "\n".join(
        [
            "封面",
            "前言",
            "剧本正文",
            "EPISODE 2: 第二集标题",
            "内容A",
            "EPISODE 3: 第三集标题",
            "内容B",
        ]
    )
    episodes = parse_script_to_episodes(text)
    assert [e.episode_number for e in episodes] == [2, 3]
    assert episodes[0].title == "第二集标题"
    assert episodes[0].start_line == 1
    assert "EPISODE 2" in episodes[0].script_full_text


def test_parse_supports_chinese_episode_headers():
    text = "\n".join(
        [
            "第2集：风起",
            "内容A",
            "第3卷：新篇",
            "内容X",
            "第10话 - 终章",
            "内容B",
        ]
    )
    episodes = parse_script_to_episodes(text)
    assert [e.episode_number for e in episodes] == [2, 3, 10]
    assert episodes[0].title == "风起"
    assert episodes[1].title == "新篇"
    assert episodes[2].title == "终章"


def test_parse_fallback_when_no_episode_header():
    text = "\n".join(["这是一个没有分集标题的文本", "只有内容"])
    episodes = parse_script_to_episodes(text)
    assert len(episodes) == 1
    assert episodes[0].episode_code == "EP001"
    assert "这是一个没有分集标题的文本" in episodes[0].script_full_text


def test_parse_splits_scenes_within_episode():
    text = "\n".join(
        [
            "EPISODE 1: 测试",
            "SCENE 1: 第一场",
            "内容A",
            "SCENE 2: 第二场",
            "内容B",
        ]
    )
    episodes = parse_script_to_episodes(text)
    assert len(episodes) == 1
    assert [s.scene_number for s in episodes[0].storyboards] == [1, 2]
    assert episodes[0].storyboards[0].scene_code == "EP001_SC01"


def test_parse_supports_chinese_numerals_and_paren_suffix_for_last_episode():
    text = "\n".join(
        [
            "第1集：开场",
            "内容A",
            "第十二集（完）",
            "内容B",
        ]
    )
    episodes = parse_script_to_episodes(text)
    assert [e.episode_number for e in episodes] == [1, 12]
    assert episodes[-1].title == "完"
    assert "内容B" in episodes[-1].script_full_text


def test_parse_supports_chinese_numerals_and_paren_suffix_for_scenes():
    text = "\n".join(
        [
            "EPISODE 1: 测试",
            "第十场（终）",
            "内容A",
            "第十一场：收尾",
            "内容B",
        ]
    )
    episodes = parse_script_to_episodes(text)
    assert len(episodes) == 1
    assert [s.scene_number for s in episodes[0].storyboards] == [10, 11]
    assert episodes[0].storyboards[0].title == "终"


def test_parse_supports_markdown_bold_wrapping_for_episode_headers():
    text = "\n".join(
        [
            "**第二集：**",
            "内容A",
            " **　　第三集：** ",
            "内容B",
            "**第5章：收尾**",
            "内容C",
        ]
    )
    episodes = parse_script_to_episodes(text)
    assert [e.episode_number for e in episodes] == [2, 3, 5]
    assert "内容A" in episodes[0].script_full_text
    assert "内容B" in episodes[1].script_full_text
    assert "内容C" in episodes[2].script_full_text
