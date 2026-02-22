# Aliyun Wanxiang Model Reference

**Source:** https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference

## Models

| Model Name | Description | Output Format | Resolution / Aspect Ratio |
|---|---|---|---|
| `wan2.6-t2i` | 万相2.6 (Recommended) | png | 1280x1280 - 1440x1440, AR [1:4, 4:1] |
| `wan2.5-t2i-preview` | 万相2.5 preview | png | 768x2700 supported |
| `wan2.2-t2i-flash` | 万相2.2极速版 | png | 512-1440px |
| `wan2.2-t2i-plus` | 万相2.2专业版 | png | |
| `wanx2.1-t2i-turbo` | | | |
| `wanx2.1-t2i-plus` | | | |
| `wanx2.0-t2i-turbo` | | | |

## API Details

**Endpoint:**
- Beijing: `https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation` (wan2.6)
- Beijing (Async): `https://dashscope.aliyuncs.com/api/v1/services/aigc/image-generation/generation`

**Headers:**
- `Content-Type: application/json`
- `Authorization: Bearer $DASHSCOPE_API_KEY`
- `X-DashScope-Async: enable` (for async)

**Parameters:**
- `model`: string (e.g., "wan2.6-t2i")
- `input`:
    - `messages`: array of `{role: "user", content: [{text: "prompt"}]}`
- `parameters`:
    - `size`: string (e.g., "1280*1280")
    - `n`: integer (1-4)
    - `prompt_extend`: boolean
    - `watermark`: boolean
    - `negative_prompt`: string
    - `seed`: integer

**Pricing:**
(Need to look up pricing page, usually mentioned in separate billing doc)
