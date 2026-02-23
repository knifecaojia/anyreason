
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
