/**
 * Per-device command execution queue using TinyBase for state management
 * Ensures commands to the same device run sequentially while allowing
 * commands to different devices to run in parallel
 */

import type { MergeableStore } from "tinybase";

type QueueEntryStatus = "queued" | "processing" | "completed" | "failed";

interface QueueEntry {
  id: string;
  deviceId: string;
  changeId: string;
  status: QueueEntryStatus;
  queuedAt: number;
  startedAt: number;
  completedAt: number;
  error: string;
}

type PendingExecution = {
  execute: () => Promise<{ success: boolean; error?: string }>;
  resolve: (result: { success: boolean; error?: string }) => void;
};

export class DeviceCommandQueue {
  private store: MergeableStore;
  // Map of queue entry ID to pending execution (functions can't be stored in TinyBase)
  private pendingExecutions: Map<string, PendingExecution> = new Map();
  // Track which devices are currently being processed
  private processingDevices: Set<string> = new Set();

  constructor(store: MergeableStore) {
    this.store = store;
    // Clean up any stale "processing" entries on startup (from previous crashes)
    this.cleanupStaleEntries();
  }

  /**
   * Clean up entries that were left in "processing" state from a previous crash
   */
  private cleanupStaleEntries(): void {
    const rowIds = this.store.getRowIds("deviceCommandQueue");
    for (const id of rowIds) {
      const entry = this.store.getRow("deviceCommandQueue", id) as unknown as QueueEntry;
      if (entry.status === "processing" || entry.status === "queued") {
        // Mark as failed since we don't have the execution context
        this.store.setPartialRow("deviceCommandQueue", id, {
          status: "failed",
          completedAt: Date.now(),
          error: "Server restarted while command was pending",
        });
        console.log(
          `[DeviceCommandQueue] Cleaned up stale entry ${id} for change ${entry.changeId}`
        );
      }
    }
  }

  /**
   * Add a command to the device queue and return a promise that resolves when executed
   */
  async enqueue(
    deviceId: string,
    changeId: string,
    execute: () => Promise<{ success: boolean; error?: string }>
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      const entryId = crypto.randomUUID();

      // Store queue entry in TinyBase
      this.store.setRow("deviceCommandQueue", entryId, {
        id: entryId,
        deviceId,
        changeId,
        status: "queued",
        queuedAt: Date.now(),
        startedAt: 0,
        completedAt: 0,
        error: "",
      });

      // Store execution context in memory (can't serialize functions)
      this.pendingExecutions.set(entryId, { execute, resolve });

      const queueLength = this.getQueueLength(deviceId);
      const isAlreadyProcessing = this.processingDevices.has(deviceId);

      console.log(
        `[DeviceCommandQueue] Enqueued change ${changeId} (entry ${entryId}) for device ${deviceId}. ` +
        `Queue length: ${queueLength}, Already processing: ${isAlreadyProcessing}`
      );

      // Start processing if not already running for this device
      if (!isAlreadyProcessing) {
        this.processQueue(deviceId);
      }
    });
  }

  /**
   * Process the queue for a specific device
   */
  private async processQueue(deviceId: string): Promise<void> {
    // If already processing this device's queue, return
    if (this.processingDevices.has(deviceId)) {
      console.log(`[DeviceCommandQueue] Already processing device ${deviceId}, skipping`);
      return;
    }

    // Mark as processing
    this.processingDevices.add(deviceId);
    console.log(`[DeviceCommandQueue] Started processing queue for device ${deviceId}`);

    while (true) {
      // Get next queued entry for this device
      const nextEntry = this.getNextQueuedEntry(deviceId);
      if (!nextEntry) {
        break;
      }

      const pendingExec = this.pendingExecutions.get(nextEntry.id);
      if (!pendingExec) {
        // No execution context - mark as failed
        this.store.setPartialRow("deviceCommandQueue", nextEntry.id, {
          status: "failed",
          completedAt: Date.now(),
          error: "Execution context lost",
        });
        continue;
      }

      // Mark as processing
      this.store.setPartialRow("deviceCommandQueue", nextEntry.id, {
        status: "processing",
        startedAt: Date.now(),
      });

      console.log(
        `[DeviceCommandQueue] Starting execution of change ${nextEntry.changeId} ` +
        `(entry ${nextEntry.id}) for device ${deviceId}`
      );

      try {
        const startTime = Date.now();
        const result = await pendingExec.execute();
        const duration = Date.now() - startTime;

        // Mark as completed
        this.store.setPartialRow("deviceCommandQueue", nextEntry.id, {
          status: result.success ? "completed" : "failed",
          completedAt: Date.now(),
          error: result.error || "",
        });

        console.log(
          `[DeviceCommandQueue] Completed change ${nextEntry.changeId} for device ${deviceId} ` +
          `in ${duration}ms. Success: ${result.success}`
        );

        pendingExec.resolve(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Mark as failed
        this.store.setPartialRow("deviceCommandQueue", nextEntry.id, {
          status: "failed",
          completedAt: Date.now(),
          error: errorMessage,
        });

        console.error(
          `[DeviceCommandQueue] Error executing change ${nextEntry.changeId}:`,
          errorMessage
        );

        pendingExec.resolve({ success: false, error: errorMessage });
      } finally {
        // Clean up execution context
        this.pendingExecutions.delete(nextEntry.id);
      }
    }

    // Done processing this device's queue
    this.processingDevices.delete(deviceId);
    console.log(`[DeviceCommandQueue] Finished processing queue for device ${deviceId}`);
  }

  /**
   * Get the next queued entry for a device (oldest first)
   */
  private getNextQueuedEntry(deviceId: string): QueueEntry | null {
    const rowIds = this.store.getRowIds("deviceCommandQueue");
    let oldest: QueueEntry | null = null;

    for (const id of rowIds) {
      const entry = this.store.getRow("deviceCommandQueue", id) as unknown as QueueEntry;
      if (entry.deviceId === deviceId && entry.status === "queued") {
        if (!oldest || entry.queuedAt < oldest.queuedAt) {
          oldest = entry;
        }
      }
    }

    return oldest;
  }

  /**
   * Get the queue length for a device (queued + processing)
   */
  getQueueLength(deviceId: string): number {
    const rowIds = this.store.getRowIds("deviceCommandQueue");
    let count = 0;

    for (const id of rowIds) {
      const entry = this.store.getRow("deviceCommandQueue", id) as unknown as QueueEntry;
      if (entry.deviceId === deviceId && (entry.status === "queued" || entry.status === "processing")) {
        count++;
      }
    }

    return count;
  }

  /**
   * Check if a device is currently processing commands
   */
  isProcessing(deviceId: string): boolean {
    return this.processingDevices.has(deviceId);
  }

  /**
   * Get queue entries for a device
   */
  getQueueEntries(deviceId?: string): QueueEntry[] {
    const rowIds = this.store.getRowIds("deviceCommandQueue");
    const entries: QueueEntry[] = [];

    for (const id of rowIds) {
      const entry = this.store.getRow("deviceCommandQueue", id) as unknown as QueueEntry;
      if (!deviceId || entry.deviceId === deviceId) {
        entries.push(entry);
      }
    }

    return entries.sort((a, b) => a.queuedAt - b.queuedAt);
  }

  /**
   * Get overall queue status
   */
  getStatus(): {
    totalQueued: number;
    totalProcessing: number;
    devicesProcessing: string[];
    deviceQueues: Record<string, number>;
  } {
    const rowIds = this.store.getRowIds("deviceCommandQueue");
    const deviceQueues: Record<string, number> = {};
    let totalQueued = 0;
    let totalProcessing = 0;

    for (const id of rowIds) {
      const entry = this.store.getRow("deviceCommandQueue", id) as unknown as QueueEntry;
      if (entry.status === "queued") {
        totalQueued++;
        deviceQueues[entry.deviceId] = (deviceQueues[entry.deviceId] || 0) + 1;
      } else if (entry.status === "processing") {
        totalProcessing++;
      }
    }

    return {
      totalQueued,
      totalProcessing,
      devicesProcessing: Array.from(this.processingDevices),
      deviceQueues,
    };
  }

  /**
   * Clean up old completed/failed entries (older than specified age in ms)
   */
  cleanupOldEntries(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const rowIds = this.store.getRowIds("deviceCommandQueue");
    const cutoff = Date.now() - maxAgeMs;
    let cleaned = 0;

    for (const id of rowIds) {
      const entry = this.store.getRow("deviceCommandQueue", id) as unknown as QueueEntry;
      if (
        (entry.status === "completed" || entry.status === "failed") &&
        entry.completedAt < cutoff
      ) {
        this.store.delRow("deviceCommandQueue", id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[DeviceCommandQueue] Cleaned up ${cleaned} old entries`);
    }

    return cleaned;
  }
}
