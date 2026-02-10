from app.tasks.handlers.noop import NoopTaskHandler
from app.tasks.handlers.episode_asset_extraction_preview import EpisodeAssetExtractionPreviewHandler
from app.tasks.handlers.episode_scene_structure_preview import EpisodeSceneStructurePreviewHandler
from app.tasks.handlers.freeform_asset_extraction_compare_preview import FreeformAssetExtractionComparePreviewHandler
from app.tasks.handlers.scene_storyboard_preview import SceneStoryboardPreviewHandler

TASK_HANDLER_REGISTRY = {
    NoopTaskHandler.task_type: NoopTaskHandler(),
    EpisodeAssetExtractionPreviewHandler.task_type: EpisodeAssetExtractionPreviewHandler(),
    EpisodeSceneStructurePreviewHandler.task_type: EpisodeSceneStructurePreviewHandler(),
    FreeformAssetExtractionComparePreviewHandler.task_type: FreeformAssetExtractionComparePreviewHandler(),
    SceneStoryboardPreviewHandler.task_type: SceneStoryboardPreviewHandler(),
}
