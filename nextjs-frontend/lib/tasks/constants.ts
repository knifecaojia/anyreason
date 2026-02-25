export const TASK_TYPES = {
  aiSceneTestChat: "ai_scene_test_chat",
  episodeSceneStructurePreview: "episode_scene_structure_preview",
  episodeAssetExtractionPreview: "episode_asset_extraction_preview",
  sceneStoryboardPreview: "scene_storyboard_preview",
  freeformAssetExtractionComparePreview: "freeform_asset_extraction_compare_preview",
  modelTestImageGenerate: "model_test_image_generate",
  modelTestVideoGenerate: "model_test_video_generate",
} as const;

export const TASK_ENTITY_TYPES = {
  episode: "episode",
  scene: "scene",
} as const;
