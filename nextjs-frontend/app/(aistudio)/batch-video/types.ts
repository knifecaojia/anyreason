export interface BatchVideoJobConfig {
  model_config_id?: string;
  duration: number;
  resolution: string;
  aspect_ratio?: string;
  off_peak?: boolean;
}

export interface BatchVideoJob {
  id: string;
  user_id: string;
  title: string;
  config: BatchVideoJobConfig;
  status: "draft" | "processing" | "completed" | "archived";
  total_assets: number;
  completed_assets: number;
  created_at: string;
  updated_at: string;
}

export interface BatchVideoAsset {
  id: string;
  job_id: string;
  source_url: string;
  thumbnail_url?: string;
  prompt?: string;
  index: number;
  status: "pending" | "generating" | "completed" | "failed";
  result_url?: string;
  error_message?: string;
  source_image_id?: string | null;
  slice_index?: number | null;
  created_at: string;
  updated_at: string;
}

export type GridMode = "16:9" | "9:16";

export interface UploadedSource {
  id: string;
  file?: File;
  sourceUrl?: string;
  preview: string;
  mode: GridMode;
  processed: boolean;
  originalFilename?: string | null;
  contentType?: string | null;
  linkedCellKey?: string | null;
  linkedCellLabel?: string | null;
}

export interface BatchVideoPendingImage {
  id: string;
  job_id: string;
  source_url: string;
  thumbnail_url?: string;
  original_filename?: string | null;
  content_type?: string | null;
  mode: GridMode;
  linked_cell_key?: string | null;
  linked_cell_label?: string | null;
  processed: boolean;
  created_at: string;
  updated_at: string;
}

export interface ExcelCellMapping {
  id: string;
  rowIndex: number;
  columnKey: string;
  rawText: string;
  lines: string[];
  edited?: boolean;
}

export interface BatchVideoHistory {
  id: string;
  asset_id: string;
  task_id?: string;
  status: "pending" | "processing" | "completed" | "failed";
  progress: number;
  result_url?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

export interface BatchVideoPreviewTask {
  task_id: string;
  status: string;
  progress: number;
  created_at: string;
  updated_at?: string | null;
  completed_at?: string | null;
  result_url?: string | null;
  error_message?: string | null;
  external_task_id?: string | null;
  prompt?: string | null;
}

export interface BatchVideoPreviewSuccess {
  result_url: string;
  completed_at?: string | null;
}

export interface BatchVideoPreviewCard {
  asset_id: string;
  index: number;
  card_thumbnail_url: string;
  card_source_url?: string | null;
  prompt?: string | null;
  latest_task?: BatchVideoPreviewTask | null;
  latest_success?: BatchVideoPreviewSuccess | null;
  history: BatchVideoPreviewTask[];
}

export interface BatchVideoPreviewCardsResponse {
  job: BatchVideoJob;
  cards: BatchVideoPreviewCard[];
}

export interface BatchVideoTaskActionResponse {
  task_id: string;
  asset_id: string;
  status: string;
}

export interface BatchVideoStopTaskResponse extends BatchVideoTaskActionResponse {
  external_cancel: {
    attempted: boolean;
    supported: boolean;
    message: string;
  };
}

export interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T;
}
