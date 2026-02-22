import os
import json
import time
import random

# Simple Snowflake-like ID generator
class SnowflakeGenerator:
    def __init__(self, worker_id=1):
        self.worker_id = worker_id
        self.sequence = 0
        self.last_timestamp = -1
        self.worker_id_bits = 5
        self.sequence_bits = 12
        self.worker_id_shift = self.sequence_bits
        self.timestamp_left_shift = self.sequence_bits + self.worker_id_bits
        self.epoch = 1672531200000 # 2023-01-01 00:00:00 UTC

    def next_id(self):
        timestamp = int(time.time() * 1000)
        if timestamp < self.last_timestamp:
            raise Exception("Clock moved backwards")
        
        if self.last_timestamp == timestamp:
            self.sequence = (self.sequence + 1) & 4095
            if self.sequence == 0:
                while timestamp <= self.last_timestamp:
                    timestamp = int(time.time() * 1000)
        else:
            self.sequence = 0
            
        self.last_timestamp = timestamp
        
        return ((timestamp - self.epoch) << self.timestamp_left_shift) | \
               (self.worker_id << self.worker_id_shift) | \
               self.sequence

id_gen = SnowflakeGenerator()

vendors = [
    {
        "code": "volcengine",
        "name": "Volcengine",
        "doc_url": "https://www.volcengine.com/docs/82379/1541523",
        "default_base_url": "https://ark.cn-beijing.volces.com/api/v3",
        "models": [
            {
                "code": "doubao-seedream-5.0-lite",
                "name": "Doubao Seedream 5.0 Lite",
                "category": "image",
                "param_schema": {
                    "type": "object",
                    "properties": {
                        "size": {"type": "string", "enum": ["2K", "3K"], "default": "2K", "title": "Resolution"},
                        "prompt": {"type": "string", "title": "Prompt", "ui:widget": "textarea"},
                        "sequential_image_generation": {"type": "string", "enum": ["auto", "disabled"], "default": "disabled", "title": "Group Generation"},
                        "watermark": {"type": "boolean", "default": True, "title": "Watermark"}
                    },
                    "required": ["prompt"]
                },
                "metadata": {"max_resolution": "3K"}
            },
            {
                "code": "doubao-seedream-4.5",
                "name": "Doubao Seedream 4.5",
                "category": "image",
                "param_schema": {
                    "type": "object",
                    "properties": {
                        "size": {"type": "string", "title": "Resolution (WxH)", "default": "2048x2048"},
                        "prompt": {"type": "string", "title": "Prompt", "ui:widget": "textarea"},
                        "watermark": {"type": "boolean", "default": True, "title": "Watermark"}
                    },
                    "required": ["prompt"]
                }
            }
        ]
    },
    {
        "code": "aliyun",
        "name": "Aliyun Wanxiang",
        "doc_url": "https://help.aliyun.com/zh/model-studio/text-to-image-v2-api-reference",
        "default_base_url": "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
        "models": [
            {
                "code": "wan2.6-t2i",
                "name": "Wanxiang 2.6",
                "category": "image",
                "param_schema": {
                    "type": "object",
                    "properties": {
                        "size": {"type": "string", "default": "1280*1280", "title": "Size"},
                        "prompt": {"type": "string", "title": "Prompt", "ui:widget": "textarea"},
                        "n": {"type": "integer", "minimum": 1, "maximum": 4, "default": 1, "title": "Number of Images"},
                        "watermark": {"type": "boolean", "default": False, "title": "Watermark"}
                    },
                    "required": ["prompt"]
                }
            },
            {
                "code": "wan2.5-t2i-preview",
                "name": "Wanxiang 2.5 Preview",
                "category": "image",
                "param_schema": {
                    "type": "object",
                    "properties": {
                        "size": {"type": "string", "default": "1280*1280", "title": "Size"},
                        "prompt": {"type": "string", "title": "Prompt", "ui:widget": "textarea"}
                    },
                    "required": ["prompt"]
                }
            }
        ]
    },
    {
        "code": "vidu",
        "name": "Vidu",
        "doc_url": "https://platform.vidu.cn/docs/text-to-video",
        "default_base_url": "https://api.vidu.cn/ent/v2",
        "models": [
            {
                "code": "viduq3-pro",
                "name": "Vidu Q3 Pro",
                "category": "video",
                "param_schema": {
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string", "title": "Prompt", "ui:widget": "textarea"},
                        "duration": {"type": "integer", "enum": [5, 10], "default": 5, "title": "Duration (s)"},
                        "aspect_ratio": {"type": "string", "enum": ["16:9", "9:16", "1:1"], "default": "16:9", "title": "Aspect Ratio"}
                    },
                    "required": ["prompt"]
                }
            },
            {
                "code": "viduq3-turbo",
                "name": "Vidu Q3 Turbo",
                "category": "video",
                "param_schema": {
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string", "title": "Prompt", "ui:widget": "textarea"},
                        "duration": {"type": "integer", "default": 5, "title": "Duration (s)"}
                    },
                    "required": ["prompt"]
                }
            }
        ]
    },
    {
        "code": "google",
        "name": "Google Gemini",
        "doc_url": "https://ai.google.dev/gemini-api/docs/image-generation",
        "default_base_url": "https://generativelanguage.googleapis.com/v1beta",
        "models": [
            {
                "code": "gemini-3-pro-image-preview",
                "name": "Gemini 3 Pro Image",
                "category": "image",
                "param_schema": {
                    "type": "object",
                    "properties": {
                        "prompt": {"type": "string", "title": "Prompt", "ui:widget": "textarea"},
                        "aspectRatio": {"type": "string", "enum": ["16:9", "1:1", "4:3"], "default": "1:1", "title": "Aspect Ratio"},
                        "imageSize": {"type": "string", "enum": ["1K", "2K", "4K"], "default": "1K", "title": "Resolution"}
                    },
                    "required": ["prompt"]
                }
            }
        ]
    }
]

sql_statements = []

for v in vendors:
    # Check if vendor exists logic will be handled by ON CONFLICT in actual SQL, but here we generate INSERTs
    # Assuming we insert into ai_manufacturers.
    # Note: ai_manufacturers has columns: id, code, name, category, default_base_url, doc_url (new), etc.
    # We need to handle 'category' in manufacturer. 
    # If a vendor has both image and video, we need multiple rows or one row if category is generic?
    # Spec said unique(code, category).
    
    categories = set(m['category'] for m in v['models'])
    
    for cat in categories:
        m_id = id_gen.next_id()
        sql = f"""
INSERT INTO ai_manufacturers (id, code, name, category, default_base_url, doc_url, enabled, created_at, updated_at)
VALUES ({m_id}, '{v['code']}', '{v['name']}', '{cat}', '{v['default_base_url']}', '{v['doc_url']}', true, NOW(), NOW())
ON CONFLICT (code, category) DO UPDATE SET 
    default_base_url = EXCLUDED.default_base_url,
    doc_url = EXCLUDED.doc_url,
    updated_at = NOW();
"""
        sql_statements.append(sql)
        
        # Models
        for m in v['models']:
            if m['category'] == cat:
                mod_id = id_gen.next_id()
                param_json = json.dumps(m['param_schema'], ensure_ascii=False)
                meta_json = json.dumps(m.get('metadata', {}), ensure_ascii=False)
                
                # We need to link to the manufacturer. 
                # Since we don't know the ID if it already exists, we should probably look it up or use a CTE.
                # But for initialization script, we can assume we just inserted/updated it.
                # To be safe, we can use a subquery for manufacturer_id.
                
                model_sql = f"""
INSERT INTO ai_models (id, manufacturer_id, code, name, model_metadata, param_schema, enabled, created_at, updated_at)
SELECT {mod_id}, id, '{m['code']}', '{m['name']}', '{meta_json}'::jsonb, '{param_json}'::jsonb, true, NOW(), NOW()
FROM ai_manufacturers WHERE code = '{v['code']}' AND category = '{cat}'
ON CONFLICT (manufacturer_id, code) DO UPDATE SET
    param_schema = EXCLUDED.param_schema,
    model_metadata = EXCLUDED.model_metadata,
    updated_at = NOW();
"""
                sql_statements.append(model_sql)

# Output
output_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sql", "init", "vendor_model_init.sql")
os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, "w", encoding="utf-8") as f:
    f.write("-- Auto-generated by scripts/generate_init_sql.py\n")
    f.write("\n".join(sql_statements))

print(f"Generated SQL at {output_path}")
