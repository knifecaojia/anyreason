# Task 14: Surface Queue State and Cancellation in Frontend

## Status: COMPLETED

## Summary
Implemented frontend visibility for video slot queue states (`queued_for_slot`, `submitting`, `waiting_external`) with queue position display and proper cancellation affordance.

## Files Modified

### 1. `nextjs-frontend/lib/tasks/types.ts`
- Added `queued_for_slot` and `submitting` to `TaskStatus` type
- Added queue metadata fields: `queue_position`, `queued_at`, `slot_owner_token`, `slot_config_id`, `slot_acquired_at`

### 2. `nextjs-frontend/app/(aistudio)/batch-video/types.ts`
- Added `BatchVideoTaskStatus` type with all queue states
- Added `queue_position` and `queued_at` fields to `BatchVideoPreviewTask`

### 3. `nextjs-frontend/components/tasks/TaskList.tsx`
- Updated `statusLabel()`: Added "等待并发槽位" for `queued_for_slot`, "提交中" for `submitting`, "云端处理中" for `waiting_external`
- Updated `statusColor()`: Added amber color for `queued_for_slot`, purple for `waiting_external`
- Added `isCancelable()` helper function
- Added queue position badge display for `queued_for_slot` tasks: "排队第N位"
- Updated cancel button to use `isCancelable()` function
- Updated progress bar to show amber color for `queued_for_slot`

### 4. `nextjs-frontend/components/tasks/TaskCenter.tsx`
- Updated `statusLabel()` and `statusColor()` with same changes as TaskList

### 5. `nextjs-frontend/app/(aistudio)/batch-video/components/VideoPreviewCards.tsx`
- Updated `getStatusLabel()`: Added "等待并发槽位" for `queued_for_slot`, "提交中" for `submitting`
- Updated `getStatusClass()`: Added amber badge for `queued_for_slot`, blue for `submitting`
- Updated `canStop()`: Now includes `queued_for_slot` and `submitting` as stoppable
- Added queue position badge display for `queued_for_slot` tasks
- Updated video preview placeholder text for new states
- Updated stop button toast messages
- Updated progress bar color for new states
- Added queue position to history items

### 6. `nextjs-frontend/__tests__/batchVideoPreviewCards.test.tsx`
- Added test: "displays queue position for queued_for_slot status"
- Added test: "shows submitting status with appropriate messaging"
- Added test: "can cancel queued_for_slot tasks"

## Test Results

All 6 tests pass:
- √ renders preview cards, expandable history, and task actions
- √ falls back to source image when preview thumbnail fails to load
- √ auto-refreshes preview cards while there are cloud-running tasks and stops after success
- √ displays queue position for queued_for_slot status (NEW)
- √ shows submitting status with appropriate messaging (NEW)
- √ can cancel queued_for_slot tasks (NEW)

## User-Facing Copy

| Status | Label | Color | Cancelable |
|--------|-------|-------|------------|
| `queued_for_slot` | 等待并发槽位 | Amber (等待中) | Yes (取消) |
| `submitting` | 提交中 | Blue (处理中) | Yes (停止) |
| `waiting_external` | 云端生成中 | Purple (云端处理) | Yes (停止) |
| `queued` | 等待中 | Yellow | Yes (取消) |
| `running` | 处理中 | Blue | Yes (取消) |
| `succeeded` | 已完成 | Green | No |
| `failed` | 失败 | Red | No (重试) |
| `canceled` | 已停止 | Gray | No (重试) |

## Key Implementation Details

1. **Queue position display**: Shown as amber badge "排队第N位" only when `status === "queued_for_slot"` and `queue_position` is available.

2. **Cancel behavior**: Tasks in `queued_for_slot`, `queued`, `running`, `submitting`, or `waiting_external` states are cancelable. The stop/cancel button appears for these states.

3. **Visual distinction**: 
   - `queued_for_slot`: Amber color to indicate waiting for capacity
   - `submitting`: Blue color to indicate active submission
   - `waiting_external`: Purple color to indicate external processing

4. **Backend integration**: The frontend now expects and displays queue metadata (`queue_position`, `queued_at`) that the backend API exposes for `queued_for_slot` tasks.

## Verification

- All 6 batch video preview card tests pass
- ESLint shows no errors in changed files (only pre-existing `<img>` warnings)
- TypeScript types are consistent across frontend and match backend schema
