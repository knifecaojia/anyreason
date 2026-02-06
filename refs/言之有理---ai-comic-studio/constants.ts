
import { Project, Asset, User, WorkflowNode, WorkflowEdge } from './types';

export const MOCK_USER: User = {
  id: 'u1',
  name: '李策划',
  avatar: 'https://picsum.photos/id/64/100/100',
  role: 'DIRECTOR'
};

export const PROJECTS: Project[] = [
  {
    id: 'p1',
    title: '斩仙台真人AI版',
    description: '东方玄幻巨制，讲述凡人修仙逆天改命的故事。',
    coverImage: 'https://picsum.photos/id/10/800/600',
    status: 'PRODUCTION',
    updatedAt: '2024-05-20',
    teamSize: 5,
    assetsCount: 124,
    episodes: 12
  },
  {
    id: 'p2',
    title: '小小神尊穿书反杀',
    description: '大女主爽文改编，快节奏漫剧。',
    coverImage: 'https://picsum.photos/id/16/800/600',
    status: 'SCRIPTING',
    updatedAt: '2024-05-18',
    teamSize: 3,
    assetsCount: 45,
    episodes: 24
  },
  {
    id: 'p3',
    title: '天帝千金',
    description: '唯美古风恋爱题材。',
    coverImage: 'https://picsum.photos/id/28/800/600',
    status: 'POST_PROD',
    updatedAt: '2024-05-15',
    teamSize: 8,
    assetsCount: 310,
    episodes: 8
  },
  {
    id: 'p4',
    title: '太后传1',
    description: '宫廷权谋大戏。',
    coverImage: 'https://picsum.photos/id/34/800/600',
    status: 'PUBLISHED',
    updatedAt: '2024-04-30',
    teamSize: 12,
    assetsCount: 500,
    episodes: 30
  }
];

export const ASSETS: Asset[] = [
  { 
    id: 'a1', 
    name: '男主-萧炎', 
    type: 'CHARACTER', 
    thumbnail: 'https://picsum.photos/id/1005/200/200', 
    tags: ['主角', '古风'], 
    createdAt: '2024-01-01',
    variants: [
      { id: 'v1', name: '宗门常服', thumbnail: 'https://picsum.photos/id/1005/200/200' },
      { id: 'v2', name: '战损状态', thumbnail: 'https://picsum.photos/id/1006/200/200' },
      { id: 'v3', name: '少年时期', thumbnail: 'https://picsum.photos/id/1008/200/200' }
    ]
  },
  { 
    id: 'a2', 
    name: '女主-熏儿', 
    type: 'CHARACTER', 
    thumbnail: 'https://picsum.photos/id/1011/200/200', 
    tags: ['主角', '清纯'], 
    createdAt: '2024-01-02',
    variants: [
       { id: 'v1', name: '日常', thumbnail: 'https://picsum.photos/id/1011/200/200' },
       { id: 'v2', name: '大婚红衣', thumbnail: 'https://picsum.photos/id/1012/200/200' }
    ]
  },
  { id: 'a3', name: '云岚宗广场', type: 'SCENE', thumbnail: 'https://picsum.photos/id/1015/200/200', tags: ['场景', '恢弘'], createdAt: '2024-01-03' },
  { id: 'a4', name: '玄重尺', type: 'PROP', thumbnail: 'https://picsum.photos/id/1016/200/200', tags: ['武器', '重剑'], createdAt: '2024-01-04' },
  { id: 'a5', name: '异火特效', type: 'EFFECT', thumbnail: 'https://picsum.photos/id/1020/200/200', tags: ['火焰', '粒子'], createdAt: '2024-01-05' },
  // Text-only Draft Assets
  { id: 'd1', name: '神秘黑袍人', type: 'CHARACTER', thumbnail: '', tags: ['反派', '待生成'], createdAt: '2024-05-21' },
  { id: 'd2', name: '魔兽山脉深处', type: 'SCENE', thumbnail: '', tags: ['森林', '危险', '待生成'], createdAt: '2024-05-21' },
];

export const INITIAL_NODES: WorkflowNode[] = [
  { id: 'n1', type: 'START', position: { x: 50, y: 150 }, data: { label: '开始 / Start', description: '项目初始化触发' } },
  { id: 'n2', type: 'LLM_SCRIPT', position: { x: 300, y: 50 }, data: { label: '剧本生成 (Gemini)', model: 'gemini-3-flash-preview', prompt: '为一段古风漫剧生成分镜描述，场景是：主角站在悬崖边，手中握着断剑，眼神坚毅。' } },
  { id: 'n3', type: 'SD_IMAGE', position: { x: 600, y: 50 }, data: { label: '分镜绘图 (SDXL)', model: 'sdxl-turbo', prompt: '根据剧本绘制画面...' } },
  { id: 'n4', type: 'TTS_AUDIO', position: { x: 600, y: 250 }, data: { label: '配音生成 (TTS)', model: 'azure-speech', prompt: '情感丰富的男声...' } },
];

export const INITIAL_EDGES: WorkflowEdge[] = [
  { id: 'e1', source: 'n1', target: 'n2' },
  { id: 'e2', source: 'n2', target: 'n3' },
  { id: 'e3', source: 'n2', target: 'n4' },
];
