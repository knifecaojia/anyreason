// lib/canvas/batch-queue.ts
// Batch queue manager — manages concurrent execution of generator node tasks
// with topology-sorted ordering, timeout detection, and real-time progress via callbacks.

import type { Node, Edge } from '@xyflow/react';
import type { QueueItem, QueueItemStatus, BatchQueueState } from './types';
import { topologySort } from './data-flow';
import { getNodeType } from './node-registry';

// ===== Task Event Type =====

export interface TaskEvent {
  type: 'progress' | 'succeeded' | 'failed' | 'canceled';
  progress?: number;
  resultUrl?: string;
  error?: string;
}

// ===== Configuration =====

export interface BatchQueueConfig {
  maxConcurrency?: number; // default 3
  timeoutMs?: number; // default 300000 (300 seconds)
  executeTask: (nodeId: string) => Promise<string>; // returns taskId
  subscribeTask?: (taskId: string, handler: (event: TaskEvent) => void) => void;
  onNodeUpdate?: (nodeId: string, update: Partial<QueueItem>) => void;
}

// ===== BatchQueueManager =====

export class BatchQueueManager {
  private items: QueueItem[] = [];
  private maxConcurrency: number;
  private timeoutMs: number;
  private isRunning: boolean = false;
  private executeTask: (nodeId: string) => Promise<string>;
  private subscribeTask?: (taskId: string, handler: (event: TaskEvent) => void) => void;
  private onNodeUpdate?: (nodeId: string, update: Partial<QueueItem>) => void;

  constructor(config: BatchQueueConfig) {
    this.maxConcurrency = config.maxConcurrency ?? 3;
    this.timeoutMs = config.timeoutMs ?? 300000;
    this.executeTask = config.executeTask;
    this.subscribeTask = config.subscribeTask;
    this.onNodeUpdate = config.onNodeUpdate;
  }

  /**
   * Filter nodeIds to only include generator nodes, topologically sort them,
   * and add as pending QueueItems.
   */
  enqueue(nodeIds: string[], nodes: Node[], edges: Edge[]): void {
    // Filter to only output generation nodes (image / video)
    const OUTPUT_TYPES = new Set(['imageOutputNode', 'videoOutputNode']);
    const outputNodeIds = nodeIds.filter((id) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return false;
      return OUTPUT_TYPES.has(node.type ?? '');
    });

    if (outputNodeIds.length === 0) return;

    // Topologically sort the filtered nodes
    const filteredNodes = nodes.filter((n) => outputNodeIds.includes(n.id));
    const relevantEdges = edges.filter(
      (e) => outputNodeIds.includes(e.source) && outputNodeIds.includes(e.target),
    );
    const sortResult = topologySort(filteredNodes, relevantEdges);

    // Use sorted order, falling back to original order for nodes not in sort result
    const sortedIds = sortResult.order.filter((id) => outputNodeIds.includes(id));
    // Add any remaining output nodes not in the sort result (e.g., disconnected)
    for (const id of outputNodeIds) {
      if (!sortedIds.includes(id)) {
        sortedIds.push(id);
      }
    }

    // Add as pending QueueItems (avoid duplicates)
    for (const nodeId of sortedIds) {
      if (!this.items.some((item) => item.nodeId === nodeId)) {
        this.items.push({
          nodeId,
          status: 'pending',
          progress: 0,
        });
      }
    }
  }

  /**
   * Start executing pending tasks up to maxConcurrency.
   */
  start(): void {
    this.isRunning = true;
    this.processQueue();
  }

  /**
   * Stop all: set pending and running items to canceled. Don't change succeeded/failed items.
   */
  stopAll(): void {
    this.isRunning = false;
    for (const item of this.items) {
      if (item.status === 'pending' || item.status === 'running') {
        item.status = 'canceled';
        this.onNodeUpdate?.(item.nodeId, { status: 'canceled' });
      }
    }
  }

  /**
   * Cancel a specific task by nodeId.
   */
  cancelTask(nodeId: string): void {
    const item = this.items.find((i) => i.nodeId === nodeId);
    if (!item) return;
    if (item.status === 'pending' || item.status === 'running') {
      item.status = 'canceled';
      this.onNodeUpdate?.(nodeId, { status: 'canceled' });
      // Try to start next task if we freed a slot
      if (this.isRunning) {
        this.processQueue();
      }
    }
  }

  /**
   * Return current BatchQueueState.
   */
  getState(): BatchQueueState {
    const completedCount = this.items.filter(
      (i) => i.status === 'succeeded' || i.status === 'failed' || i.status === 'canceled' || i.status === 'timeout',
    ).length;

    return {
      items: [...this.items],
      maxConcurrency: this.maxConcurrency,
      isRunning: this.isRunning,
      completedCount,
      totalCount: this.items.length,
    };
  }

  /**
   * Check all running items for timeout (startedAt + timeoutMs < Date.now()).
   */
  checkTimeouts(): void {
    const now = Date.now();
    for (const item of this.items) {
      if (item.status === 'running' && item.startedAt != null) {
        if (item.startedAt + this.timeoutMs < now) {
          item.status = 'timeout';
          this.onNodeUpdate?.(item.nodeId, { status: 'timeout' });
        }
      }
    }
    // After marking timeouts, try to process more tasks
    if (this.isRunning) {
      this.processQueue();
    }
  }

  // ===== Internal =====

  private getRunningCount(): number {
    return this.items.filter((i) => i.status === 'running').length;
  }

  private processQueue(): void {
    if (!this.isRunning) return;

    const runningCount = this.getRunningCount();
    const availableSlots = this.maxConcurrency - runningCount;

    if (availableSlots <= 0) return;

    const pendingItems = this.items.filter((i) => i.status === 'pending');
    const toStart = pendingItems.slice(0, availableSlots);

    for (const item of toStart) {
      this.startTask(item);
    }
  }

  private startTask(item: QueueItem): void {
    item.status = 'running';
    item.startedAt = Date.now();
    this.onNodeUpdate?.(item.nodeId, { status: 'running', startedAt: item.startedAt });

    this.executeTask(item.nodeId)
      .then((taskId) => {
        // Task was canceled while we were awaiting
        if (item.status !== 'running') return;

        item.taskId = taskId;
        this.onNodeUpdate?.(item.nodeId, { taskId });

        // Subscribe to real-time progress if available
        if (this.subscribeTask) {
          this.subscribeTask(taskId, (event: TaskEvent) => {
            this.handleTaskEvent(item, event);
          });
        }
      })
      .catch((err) => {
        if (item.status !== 'running') return;
        item.status = 'failed';
        item.error = err instanceof Error ? err.message : String(err);
        this.onNodeUpdate?.(item.nodeId, { status: 'failed', error: item.error });
        this.processQueue();
      });
  }

  private handleTaskEvent(item: QueueItem, event: TaskEvent): void {
    // Ignore events for items that are no longer running
    if (item.status !== 'running') return;

    switch (event.type) {
      case 'progress':
        item.progress = event.progress ?? item.progress;
        this.onNodeUpdate?.(item.nodeId, { progress: item.progress });
        break;

      case 'succeeded':
        item.status = 'succeeded';
        item.progress = 100;
        this.onNodeUpdate?.(item.nodeId, {
          status: 'succeeded',
          progress: 100,
        });
        this.processQueue();
        break;

      case 'failed':
        item.status = 'failed';
        item.error = event.error;
        this.onNodeUpdate?.(item.nodeId, {
          status: 'failed',
          error: event.error,
        });
        this.processQueue();
        break;

      case 'canceled':
        item.status = 'canceled';
        this.onNodeUpdate?.(item.nodeId, { status: 'canceled' });
        this.processQueue();
        break;
    }
  }
}
