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
}
