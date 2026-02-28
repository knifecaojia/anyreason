import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID
from pydantic_ai import RunContext
from app.ai_scene_test.deps import SceneTestDeps
from app.ai_scene_test.tools import preview_storyboard_apply, _preview_asset_extraction
from app.schemas import AIShotDraft
from app.models import Episode, Storyboard

# Mock _run_structured_agent to avoid actual LLM calls
async def mock_run_structured_agent(*args, **kwargs):
    output_type = kwargs.get("output_type")
    if output_type.__name__ == "_StoryboardShotsOutput":
        # Return a DICT that matches the schema, which model_validate can consume
        return {
            "shots": [
                {"description": "Shot 1", "shot_type": "Full", "active_assets": [], "camera_angle": "Eye-level", "camera_move": "Static", "dialogue": None, "dialogue_speaker": None, "duration_estimate": 2.0},
                {"description": "Shot 2", "shot_type": "Close-up", "active_assets": [], "camera_angle": "Low", "camera_move": "Pan", "dialogue": None, "dialogue_speaker": None, "duration_estimate": 3.0}
            ]
        }
    return MagicMock()

# Mock _run_markdown_agent
async def mock_run_markdown_agent(*args, **kwargs):
    return """
### 角色资产卡片：@古荒
- Name: 古荒
- Keywords: 主角, 反派
- FirstAppearanceEpisode: 1
"""

@pytest.fixture
def mock_ctx():
    # Setup dependencies
    deps = MagicMock(spec=SceneTestDeps)
    deps.project_id = uuid4()
    deps.script_text = "剧本内容..."
    deps.db = AsyncMock()
    deps.trace_events = []
    deps.plans = []
    deps.trace_queue = None
    deps.agent_versions = {}
    
    # Create context
    ctx = MagicMock(spec=RunContext)
    ctx.deps = deps
    return ctx

@pytest.mark.asyncio
async def test_preview_storyboard_apply_with_storyboard_id(mock_ctx):
    """Test Case A: Replace existing storyboard"""
    storyboard_id = uuid4()
    episode_id = uuid4()
    
    # Mock DB response for storyboard lookup
    mock_row = MagicMock()
    mock_row.Storyboard = MagicMock(spec=Storyboard)
    mock_row.Storyboard.id = storyboard_id
    mock_row.Storyboard.description = "Old description"
    mock_row.Storyboard.scene_number = 5
    
    mock_row.Episode = MagicMock(spec=Episode)
    mock_row.Episode.id = episode_id
    mock_row.Episode.project_id = mock_ctx.deps.project_id
    mock_row.Episode.episode_number = 1
    
    # Mock db.execute().first()
    mock_result = MagicMock()
    mock_result.first.return_value = (mock_row.Storyboard, mock_row.Episode)
    mock_ctx.deps.db.execute.return_value = mock_result

    with patch("app.ai_scene_test.tools._run_structured_agent", side_effect=mock_run_structured_agent):
        plan = await preview_storyboard_apply(
            ctx=mock_ctx,
            storyboard_id=str(storyboard_id),
            episode_id=str(episode_id) # Should be ignored/consistent
        )

    assert plan.kind == "storyboard_apply"
    assert plan.inputs["storyboard_id"] == str(storyboard_id)
    assert plan.inputs["episode_id"] == str(episode_id)
    assert len(plan.inputs["shots"]) == 2
    assert plan.preview["episode_number"] == 1
    assert plan.preview["virtual"] is False

@pytest.mark.asyncio
async def test_preview_storyboard_apply_new_shots(mock_ctx):
    """Test Case B: Create new shots under episode"""
    episode_id = uuid4()
    
    with patch("app.ai_scene_test.tools._run_structured_agent", side_effect=mock_run_structured_agent):
        plan = await preview_storyboard_apply(
            ctx=mock_ctx,
            storyboard_id="", # Empty
            episode_id=str(episode_id)
        )

    assert plan.kind == "storyboard_apply"
    assert plan.inputs["storyboard_id"] is None
    assert plan.inputs["episode_id"] == str(episode_id)
    assert len(plan.inputs["shots"]) == 2
    assert plan.preview["virtual"] is True
    # Should use 0 as default if episode lookup not performed (or implement lookup if needed)
    # In current implementation, target_episode_number is 0 if no storyboard found
    assert plan.preview["episode_number"] == 0 

@pytest.mark.asyncio
async def test_preview_asset_extraction_with_episode_id(mock_ctx):
    """Test asset extraction with explicit episode_id and fallback logic"""
    episode_id = uuid4()
    
    # Mock DB to return episode info
    mock_result = MagicMock()
    mock_episode = MagicMock(spec=Episode)
    mock_episode.episode_number = 5
    mock_result.scalar_one_or_none.return_value = mock_episode
    mock_ctx.deps.db.execute.return_value = mock_result

    # Mock agent output that DOES NOT specify episode, forcing fallback to episode_id
    async def mock_agent_no_ep(*args, **kwargs):
        return """
### 角色资产卡片：@古荒
- Name: 古荒
- Keywords: 主角
"""

    with patch("app.ai_scene_test.tools._run_markdown_agent", side_effect=mock_agent_no_ep):
        plan = await _preview_asset_extraction(
            ctx=mock_ctx,
            agent_code="test_agent",
            asset_type="character",
            episode_id=str(episode_id)
        )

    assert plan.kind == "asset_create"
    assert plan.inputs["episode_id"] == str(episode_id)
    
    assets = plan.inputs["assets"]
    assert len(assets) >= 1
    # Should be 5 because agent output didn't specify it, so it used default_episode from DB
    assert assets[0]["first_appearance_episode"] == 5 

@pytest.mark.asyncio
async def test_preview_asset_extraction_fallback_episode(mock_ctx):
    """Test fallback when agent output doesn't specify episode"""
    episode_id = uuid4()
    
    # Mock DB to return episode info
    mock_result = MagicMock()
    mock_episode = MagicMock(spec=Episode)
    mock_episode.episode_number = 8
    mock_result.scalar_one_or_none.return_value = mock_episode
    mock_ctx.deps.db.execute.return_value = mock_result

    # Agent output WITHOUT episode info
    async def mock_agent_no_ep(*args, **kwargs):
        return """
### 角色资产卡片：@路人甲
- Name: 路人甲
- Keywords: 路人
"""
    
    with patch("app.ai_scene_test.tools._run_markdown_agent", side_effect=mock_agent_no_ep):
        plan = await _preview_asset_extraction(
            ctx=mock_ctx,
            agent_code="test_agent",
            asset_type="character",
            episode_id=str(episode_id)
        )

    assets = plan.inputs["assets"]
    assert len(assets) >= 1
    # Should fallback to default_episode resolved from episode_id
    assert assets[0]["first_appearance_episode"] == 8
