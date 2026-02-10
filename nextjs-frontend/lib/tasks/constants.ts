export const TASK_TYPES = {
  episodeSceneStructurePreview: "episode_scene_structure_preview",
  episodeAssetExtractionPreview: "episode_asset_extraction_preview",
  sceneStoryboardPreview: "scene_storyboard_preview",
  freeformAssetExtractionComparePreview: "freeform_asset_extraction_compare_preview",
} as const;

export const TASK_ENTITY_TYPES = {
  episode: "episode",
  scene: "scene",
} as const;
