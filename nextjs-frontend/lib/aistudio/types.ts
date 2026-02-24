
// Media Generation Types

export interface MediaParamSchema {
  type: "object";
  properties: Record<string, MediaParamProperty>;
  required?: string[];
  "ui:order"?: string[];
}

export interface MediaParamProperty {
  type: "string" | "integer" | "number" | "boolean";
  title?: string;
  description?: string;
  default?: any;
  minimum?: number;
  maximum?: number;
  enum?: (string | number)[];
  "ui:widget"?: "text" | "textarea" | "select" | "slider" | "switch" | "color";
  "ui:order"?: number;
}

export interface MediaModelConfig {
  id: string;
  manufacturer: string;
  model: string; // The unique key, e.g. "volcengine-v2"
  name: string;
  category: "image" | "video";
  param_schema: MediaParamSchema;
  model_metadata?: Record<string, any>;
  doc_url?: string;
}

export interface MediaGenerationRequest {
  model_key: string;
  prompt: string;
  negative_prompt?: string;
  param_json: Record<string, any>;
  category: "image" | "video";
}

export interface MediaGenerationResponse {
  url: string;
  usage_id: string;
  cost?: number;
  duration?: number;
  meta?: any;
}

export type AssetType = "CHARACTER" | "SCENE" | "PROP" | "EFFECT";

export interface AssetResource {
  id: string;
  thumbnail: string;
  is_cover?: boolean;
  meta_data?: any;
  minio_bucket?: string;
  minio_key?: string;
  res_type?: string;
}

export interface AssetVariant {
  id: string;
  variant_code: string;
  thumbnail: string;
  resources?: AssetResource[];
}

export interface Asset {
  id: string;
  assetId: string;
  name: string;
  type: AssetType;
  thumbnail: string;
  cover_url?: string;
  tags: string[];
  createdAt?: string;
  source?: string;
  variants?: AssetVariant[];
  resources?: AssetResource[];
  doc_content?: string;
}

export interface User {
  id: string;
  name: string;
  avatar: string;
  role: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  coverImage: string;
  status: string;
  updatedAt: string;
  teamSize: number;
  assetsCount: number;
  episodes: number;
}

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: any;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}
