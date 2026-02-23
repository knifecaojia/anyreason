# ADR 0003: Model Parameter Schema Design

## Status
Accepted

## Context
We need to integrate multiple AI media generation models (Image/Video) from different vendors (Volcengine, Aliyun, Vidu, Gemini). Each model has a unique set of parameters (e.g., `resolution`, `sampling_steps`, `style_preset`, `seed`, `guidance_scale`). 

Hardcoding these parameters in the frontend code or backend DTOs would lead to:
1.  **High Maintenance**: Every time a vendor updates a model or releases a new one, we must deploy code changes to both backend and frontend.
2.  **Inflexibility**: We cannot easily A/B test parameter configurations or hide complex parameters from basic users without code changes.

## Decision
We will use **JSON Schema (Draft-07)** to define the parameter structure for each model, stored in the `ai_models` database table in a `param_schema` JSONB column.

### Schema Structure
The schema must follow this structure:

```json
{
  "type": "object",
  "properties": {
    "param_key": {
      "type": "string | integer | number | boolean",
      "title": "Display Name",
      "description": "Tooltip help text",
      "default": "default_value",
      "minimum": 0,
      "maximum": 100,
      "enum": ["option1", "option2"],
      "ui:widget": "slider | select | switch | textarea",
      "ui:order": 1
    }
  },
  "required": ["param_key"]
}
```

### UI Rendering
The frontend will use a dynamic form engine (e.g., `react-jsonschema-form` or a custom implementation) to render the form based on this schema at runtime.

- `ui:widget`: Hints the frontend on which component to use.
- `ui:order`: Determines the display order of fields.

### Backend Validation
The backend will use the `jsonschema` Python library to validate the incoming `param_json` against the stored `param_schema` before passing it to the `MediaProvider`.

## Consequences

### Positive
- **Zero-Code Updates**: New models or parameter changes can be applied by updating the database record.
- **Unified Interface**: The API remains stable (`POST /generate` with generic payload), while support for new features grows.
- **Consistency**: Validation rules are shared between frontend (for UX) and backend (for security).

### Negative
- **Complexity**: Debugging dynamic forms is harder than static forms.
- **Schema Management**: We need to ensure the schemas stored in the DB are valid. Invalid schemas will break the UI. (Mitigated by validation during schema update/insert).
