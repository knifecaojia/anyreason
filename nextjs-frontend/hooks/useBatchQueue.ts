'use client';

import { useCallback, useRef, useState } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { BatchQueueState } from '../lib/canvas/types';
import { BatchQueueManager, type BatchQueueConfig, type TaskEvent } from '../lib/canvas/batch-queue';

export interface UseBatchQueueOptions {
  /** Function that submits a task for a node and returns the taskId. */
  executeTask: (nodeId: string) => Promise<string>;
  /** Optional TaskProvider subscribeTask integration. */
  subscribeTask?: (taskId: string, handler: (event: TaskEvent) => void) => void;
  /** Maximum concurrent tasks (default 3). */
  maxConcurrency?: number;
  /** Timeout in ms (default 300000). */
  timeoutMs?: number;
}

export interface UseBatchQueueReturn {
  /** Enqueue generator nodes for execution (filters to generator nodes only). */
  enqueue: (nodeIds: string[], nodes: Node[], edges: Edge[]) => void;
  /** Start executing the queue. */
  start: () => void;
  /** Stop all tasks — cancels pending, sends cancel for running. */
  stopAll: () => void;
  /** Cancel a single task by nodeId. */
  cancelTask: (nodeId: string) => void;
  /** Current queue state (reactive). */
  queueState: BatchQueueState;
}

const EMPTY_STATE: BatchQueueState = {
  items: [],
  maxConcurrency: 3,
  isRunning: false,
  completedCount: 0,
  totalCount: 0,
};

/**
 * Hook that wraps BatchQueueManager, providing reactive queue state
 * and stable callbacks for enqueue/start/stopAll/cancelTask.
 */
export function useBatchQueue(options: UseBatchQueueOptions): UseBatchQueueReturn {
  const [queueState, setQueueState] = useState<BatchQueueState>(EMPTY_STATE);

  const managerRef = useRef<BatchQueueManager | null>(null);

  const getManager = useCallback((): BatchQueueManager => {
    if (!managerRef.current) {
      const config: BatchQueueConfig = {
        maxConcurrency: options.maxConcurrency,
        timeoutMs: options.timeoutMs,
        executeTask: options.executeTask,
        subscribeTask: options.subscribeTask,
        onNodeUpdate: () => {
          // Sync reactive state whenever the manager updates a node
          if (managerRef.current) {
            setQueueState(managerRef.current.getState());
          }
        },
      };
      managerRef.current = new BatchQueueManager(config);
    }
    return managerRef.current;
  }, [options.executeTask, options.subscribeTask, options.maxConcurrency, options.timeoutMs]);

  const enqueue = useCallback(
    (nodeIds: string[], nodes: Node[], edges: Edge[]) => {
      const mgr = getManager();
      mgr.enqueue(nodeIds, nodes, edges);
      setQueueState(mgr.getState());
    },
    [getManager],
  );

  const start = useCallback(() => {
    const mgr = getManager();
    mgr.start();
    setQueueState(mgr.getState());
  }, [getManager]);

  const stopAll = useCallback(() => {
    const mgr = getManager();
    mgr.stopAll();
    setQueueState(mgr.getState());
  }, [getManager]);

  const cancelTask = useCallback(
    (nodeId: string) => {
      const mgr = getManager();
      mgr.cancelTask(nodeId);
      setQueueState(mgr.getState());
    },
    [getManager],
  );

  return { enqueue, start, stopAll, cancelTask, queueState };
}
