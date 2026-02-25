import type { Node, Edge } from '@xyflow/react';
import { BatchQueueManager, type TaskEvent, type BatchQueueConfig } from '../../lib/canvas/batch-queue';

// ===== Helpers =====

function makeNode(id: string, type: string = 'generatorNode'): Node {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as Node;
}

function makeEdge(id: string, source: string, target: string): Edge {
  return { id, source, target } as Edge;
}

function makeConfig(overrides: Partial<BatchQueueConfig> = {}): BatchQueueConfig {
  return {
    maxConcurrency: 3,
    timeoutMs: 300000,
    executeTask: jest.fn().mockResolvedValue('task-id-1'),
    ...overrides,
  };
}

// ===== enqueue =====

describe('BatchQueueManager.enqueue', () => {
  test('only enqueues generator nodes', () => {
    const mgr = new BatchQueueManager(makeConfig());
    const nodes = [
      makeNode('g1', 'generatorNode'),
      makeNode('s1', 'scriptNode'),
      makeNode('g2', 'generatorNode'),
    ];
    mgr.enqueue(['g1', 's1', 'g2'], nodes, []);
    const state = mgr.getState();
    expect(state.items).toHaveLength(2);
    expect(state.items.map((i) => i.nodeId).sort()).toEqual(['g1', 'g2']);
  });

  test('enqueues items in topological order', () => {
    const mgr = new BatchQueueManager(makeConfig());
    const nodes = [
      makeNode('g1', 'generatorNode'),
      makeNode('g2', 'generatorNode'),
      makeNode('g3', 'generatorNode'),
    ];
    const edges = [makeEdge('e1', 'g1', 'g2'), makeEdge('e2', 'g2', 'g3')];
    mgr.enqueue(['g3', 'g1', 'g2'], nodes, edges);
    const state = mgr.getState();
    const order = state.items.map((i) => i.nodeId);
    expect(order).toEqual(['g1', 'g2', 'g3']);
  });

  test('all enqueued items have pending status', () => {
    const mgr = new BatchQueueManager(makeConfig());
    const nodes = [makeNode('g1'), makeNode('g2')];
    mgr.enqueue(['g1', 'g2'], nodes, []);
    const state = mgr.getState();
    expect(state.items.every((i) => i.status === 'pending')).toBe(true);
    expect(state.items.every((i) => i.progress === 0)).toBe(true);
  });

  test('does nothing when no generator nodes in selection', () => {
    const mgr = new BatchQueueManager(makeConfig());
    const nodes = [makeNode('s1', 'scriptNode'), makeNode('p1', 'previewNode')];
    mgr.enqueue(['s1', 'p1'], nodes, []);
    expect(mgr.getState().items).toHaveLength(0);
  });

  test('does not add duplicate nodes', () => {
    const mgr = new BatchQueueManager(makeConfig());
    const nodes = [makeNode('g1')];
    mgr.enqueue(['g1'], nodes, []);
    mgr.enqueue(['g1'], nodes, []);
    expect(mgr.getState().items).toHaveLength(1);
  });

  test('ignores nodeIds not found in nodes array', () => {
    const mgr = new BatchQueueManager(makeConfig());
    const nodes = [makeNode('g1')];
    mgr.enqueue(['g1', 'ghost'], nodes, []);
    expect(mgr.getState().items).toHaveLength(1);
  });
});

// ===== start =====

describe('BatchQueueManager.start', () => {
  test('starts executing pending tasks', async () => {
    const executeFn = jest.fn().mockResolvedValue('task-1');
    const mgr = new BatchQueueManager(makeConfig({ executeTask: executeFn }));
    const nodes = [makeNode('g1')];
    mgr.enqueue(['g1'], nodes, []);
    mgr.start();

    // Allow microtask to resolve
    await Promise.resolve();

    expect(executeFn).toHaveBeenCalledWith('g1');
    const state = mgr.getState();
    expect(state.isRunning).toBe(true);
  });

  test('respects maxConcurrency limit', async () => {
    const executeFn = jest.fn().mockImplementation(
      () => new Promise(() => {}), // never resolves
    );
    const mgr = new BatchQueueManager(
      makeConfig({ maxConcurrency: 2, executeTask: executeFn }),
    );
    const nodes = [makeNode('g1'), makeNode('g2'), makeNode('g3'), makeNode('g4')];
    mgr.enqueue(['g1', 'g2', 'g3', 'g4'], nodes, []);
    mgr.start();

    await Promise.resolve();

    // Only 2 should be started
    expect(executeFn).toHaveBeenCalledTimes(2);
    const running = mgr.getState().items.filter((i) => i.status === 'running');
    expect(running).toHaveLength(2);
  });
});

// ===== stopAll =====

describe('BatchQueueManager.stopAll', () => {
  test('cancels all pending items', () => {
    const mgr = new BatchQueueManager(makeConfig());
    const nodes = [makeNode('g1'), makeNode('g2'), makeNode('g3')];
    mgr.enqueue(['g1', 'g2', 'g3'], nodes, []);
    mgr.stopAll();

    const state = mgr.getState();
    expect(state.items.every((i) => i.status === 'canceled')).toBe(true);
    expect(state.isRunning).toBe(false);
  });

  test('does not change succeeded or failed items', async () => {
    let resolveTask: (value: string) => void;
    const executeFn = jest.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveTask = resolve; }),
    );
    const subscribeFn = jest.fn();
    const mgr = new BatchQueueManager(
      makeConfig({
        maxConcurrency: 1,
        executeTask: executeFn,
        subscribeTask: subscribeFn,
      }),
    );
    const nodes = [makeNode('g1'), makeNode('g2')];
    mgr.enqueue(['g1', 'g2'], nodes, []);
    mgr.start();

    await Promise.resolve();
    resolveTask!('task-1');
    await Promise.resolve();
    await Promise.resolve();

    // Simulate succeeded event for g1
    const handler = subscribeFn.mock.calls[0][1];
    handler({ type: 'succeeded' } as TaskEvent);

    // Now stop all — g1 should remain succeeded, g2 should be canceled
    mgr.stopAll();
    const state = mgr.getState();
    const g1 = state.items.find((i) => i.nodeId === 'g1');
    const g2 = state.items.find((i) => i.nodeId === 'g2');
    expect(g1?.status).toBe('succeeded');
    expect(g2?.status).toBe('canceled');
  });
});

// ===== cancelTask =====

describe('BatchQueueManager.cancelTask', () => {
  test('cancels a pending task', () => {
    const mgr = new BatchQueueManager(makeConfig());
    const nodes = [makeNode('g1'), makeNode('g2')];
    mgr.enqueue(['g1', 'g2'], nodes, []);
    mgr.cancelTask('g1');

    const state = mgr.getState();
    const g1 = state.items.find((i) => i.nodeId === 'g1');
    expect(g1?.status).toBe('canceled');
    const g2 = state.items.find((i) => i.nodeId === 'g2');
    expect(g2?.status).toBe('pending');
  });

  test('does nothing for non-existent nodeId', () => {
    const mgr = new BatchQueueManager(makeConfig());
    const nodes = [makeNode('g1')];
    mgr.enqueue(['g1'], nodes, []);
    mgr.cancelTask('ghost');
    expect(mgr.getState().items[0].status).toBe('pending');
  });

  test('does not cancel succeeded tasks', async () => {
    let resolveTask: (value: string) => void;
    const executeFn = jest.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveTask = resolve; }),
    );
    const subscribeFn = jest.fn();
    const mgr = new BatchQueueManager(
      makeConfig({ executeTask: executeFn, subscribeTask: subscribeFn }),
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

    mgr.cancelTask('g1');
    expect(mgr.getState().items[0].status).toBe('succeeded');
  });
});

// ===== getState =====

describe('BatchQueueManager.getState', () => {
  test('returns correct initial state', () => {
    const mgr = new BatchQueueManager(makeConfig());
    const state = mgr.getState();
    expect(state.items).toEqual([]);
    expect(state.maxConcurrency).toBe(3);
    expect(state.isRunning).toBe(false);
    expect(state.completedCount).toBe(0);
    expect(state.totalCount).toBe(0);
  });

  test('counts completed items correctly', () => {
    const mgr = new BatchQueueManager(makeConfig());
    const nodes = [makeNode('g1'), makeNode('g2'), makeNode('g3')];
    mgr.enqueue(['g1', 'g2', 'g3'], nodes, []);
    mgr.cancelTask('g1');

    const state = mgr.getState();
    expect(state.completedCount).toBe(1); // g1 canceled
    expect(state.totalCount).toBe(3);
  });
});

// ===== checkTimeouts =====

describe('BatchQueueManager.checkTimeouts', () => {
  test('marks running tasks as timeout when exceeded', async () => {
    const executeFn = jest.fn().mockImplementation(
      () => new Promise(() => {}), // never resolves
    );
    const mgr = new BatchQueueManager(
      makeConfig({ timeoutMs: 100, executeTask: executeFn }),
    );
    const nodes = [makeNode('g1')];
    mgr.enqueue(['g1'], nodes, []);
    mgr.start();

    await Promise.resolve();

    // Manually set startedAt to simulate time passing
    const state = mgr.getState();
    const item = state.items[0];
    // Access internal items to manipulate startedAt for testing
    // We need to use a different approach - set startedAt in the past
    // The item in getState() is a copy, so we need to check timeout after time passes

    // Use a small timeout and wait
    await new Promise((resolve) => setTimeout(resolve, 150));
    mgr.checkTimeouts();

    const newState = mgr.getState();
    expect(newState.items[0].status).toBe('timeout');
  });

  test('does not mark tasks that have not timed out', async () => {
    const executeFn = jest.fn().mockImplementation(
      () => new Promise(() => {}),
    );
    const mgr = new BatchQueueManager(
      makeConfig({ timeoutMs: 60000, executeTask: executeFn }),
    );
    const nodes = [makeNode('g1')];
    mgr.enqueue(['g1'], nodes, []);
    mgr.start();

    await Promise.resolve();
    mgr.checkTimeouts();

    const state = mgr.getState();
    expect(state.items[0].status).toBe('running');
  });

  test('does not affect pending or completed tasks', () => {
    const mgr = new BatchQueueManager(makeConfig({ timeoutMs: 100 }));
    const nodes = [makeNode('g1'), makeNode('g2')];
    mgr.enqueue(['g1', 'g2'], nodes, []);
    mgr.cancelTask('g2');

    mgr.checkTimeouts();

    const state = mgr.getState();
    expect(state.items.find((i) => i.nodeId === 'g1')?.status).toBe('pending');
    expect(state.items.find((i) => i.nodeId === 'g2')?.status).toBe('canceled');
  });
});

// ===== Task event handling =====

describe('BatchQueueManager task events', () => {
  test('progress event updates item progress', async () => {
    let resolveTask: (value: string) => void;
    const executeFn = jest.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveTask = resolve; }),
    );
    const subscribeFn = jest.fn();
    const onNodeUpdate = jest.fn();
    const mgr = new BatchQueueManager(
      makeConfig({
        executeTask: executeFn,
        subscribeTask: subscribeFn,
        onNodeUpdate,
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
    handler({ type: 'progress', progress: 50 } as TaskEvent);

    const state = mgr.getState();
    expect(state.items[0].progress).toBe(50);
    expect(onNodeUpdate).toHaveBeenCalledWith('g1', expect.objectContaining({ progress: 50 }));
  });

  test('succeeded event marks item as succeeded', async () => {
    let resolveTask: (value: string) => void;
    const executeFn = jest.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveTask = resolve; }),
    );
    const subscribeFn = jest.fn();
    const mgr = new BatchQueueManager(
      makeConfig({ executeTask: executeFn, subscribeTask: subscribeFn }),
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
  });

  test('failed event marks item as failed with error', async () => {
    let resolveTask: (value: string) => void;
    const executeFn = jest.fn().mockImplementation(
      () => new Promise<string>((resolve) => { resolveTask = resolve; }),
    );
    const subscribeFn = jest.fn();
    const mgr = new BatchQueueManager(
      makeConfig({ executeTask: executeFn, subscribeTask: subscribeFn }),
    );
    const nodes = [makeNode('g1')];
    mgr.enqueue(['g1'], nodes, []);
    mgr.start();

    await Promise.resolve();
    resolveTask!('task-1');
    await Promise.resolve();
    await Promise.resolve();

    const handler = subscribeFn.mock.calls[0][1];
    handler({ type: 'failed', error: 'GPU out of memory' } as TaskEvent);

    const state = mgr.getState();
    expect(state.items[0].status).toBe('failed');
    expect(state.items[0].error).toBe('GPU out of memory');
  });

  test('executeTask rejection marks item as failed', async () => {
    const executeFn = jest.fn().mockRejectedValue(new Error('Network error'));
    const onNodeUpdate = jest.fn();
    const mgr = new BatchQueueManager(
      makeConfig({ executeTask: executeFn, onNodeUpdate }),
    );
    const nodes = [makeNode('g1')];
    mgr.enqueue(['g1'], nodes, []);
    mgr.start();

    // Wait for promise rejection to propagate
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const state = mgr.getState();
    expect(state.items[0].status).toBe('failed');
    expect(state.items[0].error).toBe('Network error');
  });
});

// ===== Concurrency: next task starts after completion =====

describe('BatchQueueManager concurrency flow', () => {
  test('starts next pending task when a running task completes', async () => {
    let resolveTask1: (value: string) => void;
    let resolveTask2: (value: string) => void;
    const callCount = { current: 0 };
    const executeFn = jest.fn().mockImplementation(() => {
      callCount.current++;
      if (callCount.current === 1) {
        return new Promise<string>((resolve) => { resolveTask1 = resolve; });
      }
      return new Promise<string>((resolve) => { resolveTask2 = resolve; });
    });
    const subscribeFn = jest.fn();
    const mgr = new BatchQueueManager(
      makeConfig({
        maxConcurrency: 1,
        executeTask: executeFn,
        subscribeTask: subscribeFn,
      }),
    );
    const nodes = [makeNode('g1'), makeNode('g2')];
    mgr.enqueue(['g1', 'g2'], nodes, []);
    mgr.start();

    await Promise.resolve();
    expect(executeFn).toHaveBeenCalledTimes(1);

    // Complete g1
    resolveTask1!('task-1');
    await Promise.resolve();
    await Promise.resolve();

    const handler1 = subscribeFn.mock.calls[0][1];
    handler1({ type: 'succeeded' } as TaskEvent);

    // g2 should now start
    await Promise.resolve();
    expect(executeFn).toHaveBeenCalledTimes(2);
  });
});

// ===== onNodeUpdate callback =====

describe('BatchQueueManager.onNodeUpdate', () => {
  test('calls onNodeUpdate when task starts', async () => {
    const onNodeUpdate = jest.fn();
    const executeFn = jest.fn().mockImplementation(() => new Promise(() => {}));
    const mgr = new BatchQueueManager(
      makeConfig({ executeTask: executeFn, onNodeUpdate }),
    );
    const nodes = [makeNode('g1')];
    mgr.enqueue(['g1'], nodes, []);
    mgr.start();

    await Promise.resolve();

    expect(onNodeUpdate).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ status: 'running' }),
    );
  });
});
