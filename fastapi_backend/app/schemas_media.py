from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

class MediaRequest(BaseModel):
    model_key: str = Field(..., description="Unique identifier for the model (e.g., 'volcengine-v2')")
    prompt: str = Field(..., description="The main prompt for generation")
    negative_prompt: Optional[str] = Field(None, description="Negative prompt")
    param_json: Dict[str, Any] = Field(default_factory=dict, description="Dynamic parameters validated against the model's schema")
    callback_url: Optional[str] = Field(None, description="Callback URL for async completion")

class MediaResponse(BaseModel):
    url: str = Field(..., description="URL of the generated media")
    duration: Optional[float] = Field(None, description="Duration in seconds (for video)")
    cost: Optional[float] = Field(None, description="Estimated cost in credits")
    usage_id: str = Field(..., description="Audit log ID")
    meta: Dict[str, Any] = Field(default_factory=dict, description="Raw metadata from the provider")
