export type UserRole = "ADMIN" | "DIRECTOR" | "ARTIST" | "EDITOR";

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: UserRole;
}

export type AssetType = "CHARACTER" | "SCENE" | "PROP" | "EFFECT";

export interface AssetVariant {
  id: string;
  name: string;
  thumbnail: string;
}

export interface AssetResourceThumb {
  id: string;
  thumbnail: string;
}

export interface Asset {
  id: string;
  assetId?: string;
  name: string;
  type: AssetType;
  thumbnail: string;
  tags: string[];
  createdAt: string;
  variants?: AssetVariant[];
  resources?: AssetResourceThumb[];
  source?: "manual" | "script_extraction";
}

export type ProjectStatus =
  | "CONCEPT"
  | "SCRIPTING"
  | "PRODUCTION"
  | "POST_PROD"
  | "PUBLISHED";

export interface Project {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  status: ProjectStatus;
  updatedAt: string;
  teamSize: number;
  assetsCount: number;
  episodes: number;
}

export type NodeType = "START" | "LLM_SCRIPT" | "SD_IMAGE" | "TTS_AUDIO" | "VIDEO_GEN";

export interface NodeData {
  label: string;
  description?: string;
  model?: string;
  prompt?: string;
  output?: string;
  status?: "idle" | "running" | "success" | "error";
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: NodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export type ProviderType = "openai" | "anthropic" | "gemini" | "stability" | "custom";
export type ModelCapability = "text" | "image" | "video" | "audio" | "multimodal";

export interface ModelProvider {
  id: string;
  name: string;
  type: ProviderType;
  icon: string;
  description: string;
  enabled: boolean;
  config: {
    apiKey?: string;
    baseUrl?: string;
    organizationId?: string;
  };
  supportedModels: string[];
  capabilities: ModelCapability[];
}

export interface GlobalModelConfig {
  scriptModel: string;
  imageModel: string;
  visionModel: string;
}
