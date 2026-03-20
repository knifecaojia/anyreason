# Task 18: Non-Media Regression Tests

## Status: COMPLETED

## Summary
Created regression tests proving that text/chat/non-queueable flows retain fail-fast behavior and are NOT accidentally routed into video slot queue semantics.

## Files Created/Modified
- `fastapi_backend/tests/ai_gateway/test_non_media_regression.py` (NEW - 17 tests)

## Test Coverage

### 17 Regression Tests:

1. **test_resolve_model_config_allow_queue_defaults_to_false** - Verifies `allow_queue` parameter defaults to `False`
2. **test_chat_text_source_does_not_use_allow_queue** - Proves chat_text does NOT use `allow_queue=True`
3. **test_chat_text_stream_source_does_not_use_allow_queue** - Proves chat_text_stream does NOT use `allow_queue=True`
4. **test_generate_media_source_does_not_use_allow_queue** - Proves generate_media does NOT use `allow_queue=True`
5. **test_submit_media_async_source_uses_allow_queue** - Confirms submit_media_async DOES use `allow_queue=True` (positive case)
6. **test_chat_text_source_does_not_skip_slot_acquisition** - Proves chat_text does NOT skip slot acquisition
7. **test_generate_media_source_does_not_skip_slot_acquisition** - Proves generate_media does NOT skip slot acquisition
8. **test_submit_media_async_source_may_use_skip_slot_acquisition** - Documents submit_media_async two-phase flow
9. **test_service_source_has_allow_queue_parameter** - Verifies separation mechanism exists
10. **test_service_source_has_skip_slot_acquisition_parameter** - Verifies two-phase flow parameter exists
11. **test_non_media_methods_do_not_return_queue_metadata** - Verifies non-media methods don't return queue types
12. **test_chat_text_raises_on_queued_slot_result** - Proves chat_text handles queued result with fail-fast
13. **test_chat_text_stream_raises_on_queued_slot_result** - Proves chat_text_stream handles queued result with fail-fast
14. **test_generate_media_raises_on_queued_slot_result** - Proves generate_media handles queued result with fail-fast
15. **test_service_has_separate_media_and_non_media_methods** - Verifies architectural separation exists
16. **test_resolve_model_config_separates_queueable_from_fail_fast** - Verifies core separation mechanism
17. **test_non_media_regression_summary** - Comprehensive summary test

## Key Findings

### Non-Media Paths (Fail-Fast):
- `chat_text` - uses `allow_queue=False` (default)
- `chat_text_stream` - uses `allow_queue=False` (default)  
- `generate_media` - uses `allow_queue=False` (default)

### Queueable Media Path (Queue on Exhaustion):
- `submit_media_async` - uses `allow_queue=True`

### Architectural Separation:
- `_resolve_model_config()` has `allow_queue` parameter (default: False)
- `_resolve_model_config()` has `skip_slot_acquisition` parameter (default: False)
- Queue code is NEVER invoked for non-media paths

## Verification
```
pytest fastapi_backend/tests/ai_gateway/test_non_media_regression.py -v
```
Result: 17 passed in 0.72s

## Evidence Files
- `.sisyphus/evidence/task-18-nonmedia-regression.txt`
- `.sisyphus/evidence/task-18-routing-scope.txt`

## Blocking
- Blocks: F1, F2, F4 (Final Verification Wave)
