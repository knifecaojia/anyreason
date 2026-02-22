from app.tasks.handlers.noop import NoopTaskHandler
from app.tasks.handlers.episode_asset_agent_apply import EpisodeAssetAgentApplyHandler
from app.tasks.handlers.episode_asset_extraction_preview import EpisodeAssetExtractionPreviewHandler
from app.tasks.handlers.episode_character_agent_apply import EpisodeCharacterAgentApplyHandler
from app.tasks.handlers.episode_prop_agent_apply import EpisodePropAgentApplyHandler
from app.tasks.handlers.episode_scene_agent_apply import EpisodeSceneAgentApplyHandler
from app.tasks.handlers.episode_storyboard_agent_apply import EpisodeStoryboardAgentApplyHandler
from app.tasks.handlers.episode_scene_structure_preview import EpisodeSceneStructurePreviewHandler
from app.tasks.handlers.freeform_asset_extraction_compare_preview import FreeformAssetExtractionComparePreviewHandler
from app.tasks.handlers.scene_storyboard_preview import SceneStoryboardPreviewHandler
from app.tasks.handlers.episode_vfx_agent_apply import EpisodeVfxAgentApplyHandler
from app.tasks.handlers.user_app_run import UserAppRunHandler
from app.tasks.handlers.ai_scene_test_chat import AiSceneTestChatHandler
from app.tasks.handlers.episode_doc_backfill import EpisodeDocBackfillHandler
from app.tasks.handlers.asset_image_generate import AssetImageGenerateHandler
from app.tasks.handlers.shot_video_generate import ShotVideoGenerateHandler
from app.tasks.handlers.apply_plan_execute import ApplyPlanExecuteHandler

TASK_HANDLER_REGISTRY = {
    NoopTaskHandler.task_type: NoopTaskHandler(),
    EpisodeStoryboardAgentApplyHandler.task_type: EpisodeStoryboardAgentApplyHandler(),
    EpisodeAssetAgentApplyHandler.task_type: EpisodeAssetAgentApplyHandler(),
    EpisodeSceneAgentApplyHandler.task_type: EpisodeSceneAgentApplyHandler(),
    EpisodeCharacterAgentApplyHandler.task_type: EpisodeCharacterAgentApplyHandler(),
    EpisodePropAgentApplyHandler.task_type: EpisodePropAgentApplyHandler(),
    EpisodeVfxAgentApplyHandler.task_type: EpisodeVfxAgentApplyHandler(),
    EpisodeAssetExtractionPreviewHandler.task_type: EpisodeAssetExtractionPreviewHandler(),
    EpisodeSceneStructurePreviewHandler.task_type: EpisodeSceneStructurePreviewHandler(),
    FreeformAssetExtractionComparePreviewHandler.task_type: FreeformAssetExtractionComparePreviewHandler(),
    SceneStoryboardPreviewHandler.task_type: SceneStoryboardPreviewHandler(),
    UserAppRunHandler.task_type: UserAppRunHandler(),
    AiSceneTestChatHandler.task_type: AiSceneTestChatHandler(),
    "ai_assistant_chat": AiSceneTestChatHandler(),
    EpisodeDocBackfillHandler.task_type: EpisodeDocBackfillHandler(),
    AssetImageGenerateHandler.task_type: AssetImageGenerateHandler(),
    ShotVideoGenerateHandler.task_type: ShotVideoGenerateHandler(),
    ApplyPlanExecuteHandler.task_type: ApplyPlanExecuteHandler(),
}
