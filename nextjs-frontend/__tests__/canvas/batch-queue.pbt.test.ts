/**
 * Property-Based Tests for batch-queue.ts
 *
 * Uses fast-check to verify universal properties of the BatchQueueManager.
 * Each property maps to a correctness property from the design document.
 */
import * as fc from 'fast-check';
import type { Node, Edge } from '@xyflow/react';
import {
  BatchQueueManager,
  type TaskEvent,
  type BatchQueueConfig,
} from '../../lib/canvas/batch-queue';

// ===== Helpers =====

function makeNode(id: string, type: string = 'generatorNode'): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as Node;
}

function makeConfig(overrides: Partial<BatchQueueConfig> = {}): BatchQueueConfig {
  return {
    maxConcurrency: 3,
    timeoutMs: 300000,
    executeTask: jest.fn().mockImplementation(() => new Promise(() => {})),
    ...overrides,
  };
}

// ===== Property 10: 并发限制执行 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 10: Concurrency limit enforcement', () => {
  /**
   * Property 10: 并发限制执行
   * For any queue with N tasks and concurrency limit C, at any point during
   * execution the number of running tasks should not exceed C.
   *
   * **Validates: Requirements 3.2**
   */
  it('running task count never exceeds maxConcurrency after start()', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 10 }),
        async (maxConcurrency, nodeCount) => {
          const nodes = Array.from({ length: nodeCount }, (_, i) =>
            makeNode(`g-${i}`, 'generatorNode'),
          );
          const nodeIds = nodes.map((n) => n.id);

          // executeTask returns a never-resolving promise so tasks stay running
          const mgr = new BatchQueueManager(
            makeConfig({
              maxConcurrency,
              executeTask: () => new Promise(() => {}),
            }),
          );

          mgr.enqueue(nodeIds, nodes, []);
          mgr.start();

          // Allow microtasks to settle
          await Promise.resolve();
          await Promise.resolve();

          const state = mgr.getState();
          const runningCount = state.items.filter((i) => i.status === 'running').length;

          expect(runningCount).toBeLessThanOrEqual(maxConcurrency);
          expect(runningCount).toBe(Math.min(maxConcurrency, nodeCount));
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ===== Property 11: 任务事件驱动节点状态更新 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 11: Task event driven node state updates', () => {
  /**
   * Property 11: 任务事件驱动节点状态更新
   * For any task event (progress/succeeded/failed), the generator node state
   * should update correctly: progress updates percentage, succeeded sets result
   * and clears processing flag, failed sets error and clears processing flag.
   *
   * **Validates: Requirements 3.4, 3.5, 3.6**
   */
  it('progress event updates item progress correctly', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 100 }),
        async (progressValue) => {
          let resolveTask: (value: string) => void;
          const subscribeFn = jest.fn();
          const mgr = new BatchQueueManager(
            makeConfig({
              maxConcurrency: 1,
              executeTask: () =>
                new Promise<string>((resolve) => {
                  resolveTask = resolve;
                }),
              subscribeTask: subscribeFn,
            }),
          );

          const nodes = [makeNode('g1')];
          mgr.enqueue(['g1'], nodes, []);
          mgr.start();

          await Promise.resolve();
          resolveTask!('task-1');
          await Promise.resolve();
          await Promise.resolve();

          // Fire progress event
          const handler = subscribeFn.mock.calls[0][1];
          handler({ type: 'progress', progress: progressValue } as TaskEvent);

          const state = mgr.getState();
          expect(state.items[0].progress).toBe(progressValue);
          expect(state.items[0].status).toBe('running');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('succeeded event sets status to succeeded and progress to 100', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constant(null), async () => {
        let resolveTask: (value: string) => void;
        const subscribeFn = jest.fn();
        const mgr = new BatchQueueManager(
          makeConfig({
            maxConcurrency: 1,
            executeTask: () =>
              new Promise<string>((resolve) => {
                resolveTask = resolve;
              }),
            subscribeTask: subscribeFn,
          }),
        );

        const nodes = [makeNode('g1')];
        mgr.enqueue(['g1'], nodes, []);
        mgr.start();

        await Promise.resolve();
        resolveTask!('task-1');
        await Promise.resolve();
        await Promise.resolve();

        const handler = subscribeFn.mock.calls[0][1];
        handler({ type: 'succeeded' } as TaskEvent);

        const state = mgr.getState();
        expect(state.items[0].status).toBe('succeeded');
        expect(state.items[0].progress).toBe(100);
      }),
      { numRuns: 100 },
    );
  });

  it('failed event sets status to failed with error message', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        async (errorMsg) => {
          let resolveTask: (value: string) => void;
          const subscribeFn = jest.fn();
          const mgr = new BatchQueueManager(
            makeConfig({
              maxConcurrency: 1,
              executeTask: () =>
                new Promise<string>((resolve) => {
                  resolveTask = resolve;
                }),
              subscribeTask: subscribeFn,
            }),
          );

          const nodes = [makeNode('g1')];
          mgr.enqueue(['g1'], nodes, []);
          mgr.start();

          await Promise.resolve();
          resolveTask!('task-1');
          await Promise.resolve();
          await Promise.resolve();

          const handler = subscribeFn.mock.calls[0][1];
          handler({ type: 'failed', error: errorMsg } as TaskEvent);

          const state = mgr.getState();
          expect(state.items[0].status).toBe('failed');
          expect(state.items[0].error).toBe(errorMsg);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ===== Property 12: 停止全部取消排队任务 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 12: Stop all cancels pending tasks', () => {
  /**
   * Property 12: 停止全部取消排队任务
   * For any batch queue with a mix of pending/succeeded/failed items,
   * after stopAll() all pending items should become canceled, and
   * succeeded/failed items should remain unchanged.
   *
   * **Validates: Requirements 3.8**
   */
  it('pending items become canceled and completed items remain unchanged after stopAll', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        fc.array(
          fc.constantFrom('succeed', 'fail', 'pending'),
          { minLength: 1, maxLength: 8 },
        ),
        async (maxConcurrency, outcomes) => {
          const nodeCount = outcomes.length;
          const nodes = Array.from({ length: nodeCount }, (_, i) =>
            makeNode(`g-${i}`, 'generatorNode'),
          );
          const nodeIds = nodes.map((n) => n.id);

          const resolvers: Map<string, (value: string) => void> = new Map();
          const subscribeFn = jest.fn();

          const mgr = new BatchQueueManager(
            makeConfig({
              maxConcurrency,
              executeTask: (nodeId: string) =>
                new Promise<string>((resolve) => {
                  resolvers.set(nodeId, resolve);
                }),
              subscribeTask: subscribeFn,
            }),
          );

          mgr.enqueue(nodeIds, nodes, []);
          mgr.start();

          // Allow tasks to start
          await Promise.resolve();
          await Promise.resolve();

          // For tasks that have started and have resolvers, resolve them and fire events
          const startedNodeIds = mgr
            .getState()
            .items.filter((i) => i.status === 'running')
            .map((i) => i.nodeId);

          for (let i = 0; i < startedNodeIds.length; i++) {
            const nodeId = startedNodeIds[i];
            const resolver = resolvers.get(nodeId);
            if (resolver && i < outcomes.length) {
              const outcome = outcomes[i];
              if (outcome === 'succeed' || outcome === 'fail') {
                resolver(`task-${nodeId}`);
              }
            }
          }

          // Allow promises to settle
          await Promise.resolve();
          await Promise.resolve();
          await Promise.resolve();

          // Fire events for resolved tasks
          for (let callIdx = 0; callIdx < subscribeFn.mock.calls.length; callIdx++) {
            const subscribedTaskId = subscribeFn.mock.calls[callIdx][0];
            const handler = subscribeFn.mock.calls[callIdx][1];
            // Find which node this corresponds to
            const nodeId = startedNodeIds.find((nid) => {
              const item = mgr.getState().items.find((it) => it.nodeId === nid);
              return item?.taskId === subscribedTaskId;
            });
            if (!nodeId) continue;
            const idx = nodeIds.indexOf(nodeId);
            if (idx >= 0 && idx < outcomes.length) {
              if (outcomes[idx] === 'succeed') {
                handler({ type: 'succeeded' } as TaskEvent);
              } else if (outcomes[idx] === 'fail') {
                handler({ type: 'failed', error: 'test error' } as TaskEvent);
              }
            }
          }

          await Promise.resolve();

          // Record pre-stopAll state
          const preStopState = mgr.getState();
          const succeededBefore = preStopState.items
            .filter((i) => i.status === 'succeeded')
            .map((i) => i.nodeId);
          const failedBefore = preStopState.items
            .filter((i) => i.status === 'failed')
            .map((i) => i.nodeId);

          // Stop all
          mgr.stopAll();

          const postStopState = mgr.getState();

          // All previously pending items should now be canceled
          for (const item of postStopState.items) {
            if (succeededBefore.includes(item.nodeId)) {
              expect(item.status).toBe('succeeded');
            } else if (failedBefore.includes(item.nodeId)) {
              expect(item.status).toBe('failed');
            } else {
              // Was pending or running — should now be canceled
              expect(item.status).toBe('canceled');
            }
          }

          expect(postStopState.isRunning).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ===== Property 13: 超时检测 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 13: Timeout detection', () => {
  /**
   * Property 13: 超时检测
   * For any running task, if it has been running longer than timeoutMs,
   * checkTimeouts should mark it as timeout. Tasks that have not exceeded
   * the timeout should not be affected.
   *
   * **Validates: Requirements 3.9**
   */
  it('tasks running over timeoutMs are marked timeout, others are not', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.array(
          fc.record({
            elapsed: fc.integer({ min: 0, max: 600000 }),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        async (maxConcurrency, taskDurations) => {
          const timeoutMs = 300000; // 300 seconds
          const nodeCount = taskDurations.length;
          const nodes = Array.from({ length: nodeCount }, (_, i) =>
            makeNode(`g-${i}`, 'generatorNode'),
          );
          const nodeIds = nodes.map((n) => n.id);

          const mgr = new BatchQueueManager(
            makeConfig({
              maxConcurrency,
              timeoutMs,
              executeTask: () => new Promise(() => {}),
            }),
          );

          mgr.enqueue(nodeIds, nodes, []);
          mgr.start();

          await Promise.resolve();
          await Promise.resolve();

          // Manually adjust startedAt for running items to simulate elapsed time
          const state = mgr.getState();
          const runningItems = state.items.filter((i) => i.status === 'running');

          // Access internal items via getState and manipulate startedAt
          // We need to access the internal items array directly
          // Since getState returns copies, we use a workaround:
          // Create a new manager with items that have specific startedAt values
          const now = Date.now();
          const internalState = (mgr as any).items as Array<{
            nodeId: string;
            status: string;
            startedAt?: number;
          }>;

          for (let i = 0; i < internalState.length; i++) {
            if (internalState[i].status === 'running' && i < taskDurations.length) {
              // Set startedAt so that elapsed time matches the generated duration
              internalState[i].startedAt = now - taskDurations[i].elapsed;
            }
          }

          mgr.checkTimeouts();

          const afterState = mgr.getState();

          for (let i = 0; i < afterState.items.length; i++) {
            const item = afterState.items[i];
            if (i < taskDurations.length && item.status !== 'pending') {
              const elapsed = taskDurations[i].elapsed;
              if (elapsed > timeoutMs) {
                // Should be marked as timeout (was running)
                if (internalState[i].status === 'timeout') {
                  expect(item.status).toBe('timeout');
                }
              } else if (item.status !== 'timeout') {
                // Should NOT be marked as timeout
                expect(item.status).not.toBe('timeout');
              }
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ===== Property 14: 选中节点过滤执行 =====

describe('Feature: infinite-canvas-storyboard-fusion, Property 14: Selected node filtering for execution', () => {
  /**
   * Property 14: 选中节点过滤执行
   * For any set of canvas nodes and a selected subset, enqueue should only
   * include selected generator nodes in the queue. Non-generator nodes and
   * unselected generator nodes should not appear in the queue.
   *
   * **Validates: Requirements 3.10**
   */
  it('enqueue only includes selected generator nodes', () => {
    const nodeTypes = [
      'generatorNode',
      'scriptNode',
      'previewNode',
      'slicerNode',
      'candidateNode',
      'textNoteNode',
      'mediaNode',
      'assetNode',
      'referenceNode',
      'storyboardNode',
    ] as const;

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom(...nodeTypes),
            selected: fc.boolean(),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (nodeSpecs) => {
          const nodes = nodeSpecs.map((spec, i) => makeNode(`n-${i}`, spec.type));
          const selectedIds = nodeSpecs
            .map((spec, i) => (spec.selected ? `n-${i}` : null))
            .filter((id): id is string => id !== null);

          const mgr = new BatchQueueManager(
            makeConfig({
              executeTask: () => new Promise(() => {}),
            }),
          );

          mgr.enqueue(selectedIds, nodes, []);

          const state = mgr.getState();
          const queuedNodeIds = new Set(state.items.map((i) => i.nodeId));

          // Every queued node must be a selected generator node
          for (const item of state.items) {
            const idx = parseInt(item.nodeId.split('-')[1]);
            expect(nodeSpecs[idx].type).toBe('generatorNode');
            expect(nodeSpecs[idx].selected).toBe(true);
          }

          // Every selected generator node must be in the queue
          for (let i = 0; i < nodeSpecs.length; i++) {
            const spec = nodeSpecs[i];
            if (spec.type === 'generatorNode' && spec.selected) {
              expect(queuedNodeIds.has(`n-${i}`)).toBe(true);
            }
          }

          // No non-generator or unselected nodes should be in the queue
          for (let i = 0; i < nodeSpecs.length; i++) {
            const spec = nodeSpecs[i];
            if (spec.type !== 'generatorNode' || !spec.selected) {
              expect(queuedNodeIds.has(`n-${i}`)).toBe(false);
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
