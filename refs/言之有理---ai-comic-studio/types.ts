
// RBAC Roles
export type UserRole = 'ADMIN' | 'DIRECTOR' | 'ARTIST' | 'EDITOR';

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: UserRole;
}

// Asset Management
export type AssetType = 'CHARACTER' | 'SCENE' | 'PROP' | 'EFFECT';

export interface AssetVariant {
  id: string;
  name: string; // e.g., "Battle Damage", "Young Version", "Winter Outfit"
  thumbnail: string;
}

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  thumbnail: string;
  tags: string[];
  createdAt: string;
  variants?: AssetVariant[]; // Support multiple visual forms
}

// Project Lifecycle
export type ProjectStatus = 'CONCEPT' | 'SCRIPTING' | 'PRODUCTION' | 'POST_PROD' | 'PUBLISHED';

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

// Canvas / Workflow
export type NodeType = 'START' | 'LLM_SCRIPT' | 'SD_IMAGE' | 'TTS_AUDIO' | 'VIDEO_GEN';

export interface NodeData {
  label: string;
  description?: string;
  model?: string;
  prompt?: string;
  output?: string;
  status?: 'idle' | 'running' | 'success' | 'error';
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

// --- Model Providers ---
export type ProviderType = 'openai' | 'anthropic' | 'gemini' | 'stability' | 'custom';
export type ModelCapability = 'text' | 'image' | 'video' | 'audio' | 'multimodal';

export interface ModelProvider {
  id: string;
  name: string;
  type: ProviderType;
  icon: string; // URL or Lucide icon name mapping
  description: string;
  enabled: boolean;
  config: {
    apiKey?: string;
    baseUrl?: string;
    organizationId?: string;
  };
  supportedModels: string[]; // List of model IDs (e.g. 'gpt-4', 'gemini-pro')
  capabilities: ModelCapability[];
}

export interface GlobalModelConfig {
  scriptModel: string; // ID of the model used for scripting
  imageModel: string;  // ID of the model used for image gen
  visionModel: string; // ID of the model used for vision/multimodal
}
