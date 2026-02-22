# Google Gemini Image Generation Reference

**Source:** https://ai.google.dev/gemini-api/docs/image-generation

## Models

| Model Name | Description | Output Format | Resolution / Aspect Ratio |
|---|---|---|---|
| `gemini-3-pro-image-preview` | Gemini 3 Pro Image Preview | png | 1K, 2K, 4K |
| `gemini-2.5-flash-image` | Gemini 2.5 Flash Image | png | |

## API Details

**Endpoint:**
`POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

**Headers:**
- `Content-Type: application/json`
- `x-goog-api-key: $GEMINI_API_KEY`

**Parameters:**
- `contents`:
    - `parts`: array of `{text: "prompt"}` or `{inline_data: {mime_type: "image/png", data: "base64"}}`
- `generationConfig`:
    - `responseModalities`: ["TEXT", "IMAGE"]
    - `imageConfig`:
        - `aspectRatio`: "1:1", "16:9", "5:4", etc.
        - `imageSize`: "1K", "2K", "4K"
    - `tools`:
        - `google_search`: {} (optional)

**Features:**
- Text-to-Image
- Image-to-Image (with text prompt)
- Multi-turn Image Editing (using chat history)
- Grounding with Google Search
- Style Transfer
- Inpainting (using masks or semantic descriptions)
- High-Resolution Output (4K)

**Pricing:**
(Check billing info separately)
