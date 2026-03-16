/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CustomPrefix {
  id: string;
  name: string;
  content: string;
  category: string;
  subcategory: string;
}

export interface AppSettings {
  imageApiKeys: string[];
  videoApiKeys: string[];
  storagePath: string;
  paths: {
    main: string;
    storyboard: string;
    videoPreview: string;
  };
}

export interface VideoHistory {
  id: string;
  assetId: string;
  videoUrl: string;
  prompt: string;
  timestamp: string;
  status: 'processing' | 'completed' | 'failed';
  progress: number;
}

export type GridMode = '16:9' | '9:16';

export interface SplitImage {
  id: string;
  originalId: string;
  dataUrl: string;
  prompt: string;
  selected: boolean;
  index: number;
  gridMode: GridMode;
  duration: number;
  history?: string[];
  videoHistory?: VideoHistory[];
}

export interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  mode: GridMode;
}

export interface StoryboardItem {
  id: string;
  index: number;
  prompt: string;
  originalData: any;
}

export const MODELS = [
  {
    id: 'vidu',
    name: 'Vidu',
    variants: [
      { id: 'viduq3-pro', name: 'Vidu Q3 Pro' },
      { id: 'viduq3-turbo', name: 'Vidu Q3 Turbo' },
      { id: 'viduq2-pro', name: 'Vidu Q2 Pro' },
      { id: 'viduq2-turbo', name: 'Vidu Q2 Turbo' },
      { id: 'viduq2-pro-fast', name: 'Vidu Q2 Pro Fast' },
      { id: 'viduq1', name: 'Vidu Q1' },
      { id: 'viduq1-classic', name: 'Vidu Q1 Classic' },
      { id: 'vidu2.0', name: 'Vidu 2.0' },
    ]
  }
];
