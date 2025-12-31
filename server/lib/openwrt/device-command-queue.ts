/**
 * Per-device command execution queue
 * Ensures commands to the same device run sequentially while allowing
 * commands to different devices to run in parallel
 */

type QueuedCommand = {
  changeId: string;
  execute: () => Promise<{ success: boolean; error?: string }>;
  resolve: (result: { success: boolean; error?: string }) => void;
};

export class DeviceCommandQueue {
  private queues: Map<string, QueuedCommand[]> = new Map();
  private processing: Set<string> = new Set();

  /**
   * Add a command to the device queue and return a promise that resolves when executed
   */
  async enqueue(
    deviceId: string,
    changeId: string,
    execute: () => Promise<{ success: boolean; error?: string }>
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      // Get or create queue for this device
      if (!this.queues.has(deviceId)) {
        this.queues.set(deviceId, []);
      }

      const queue = this.queues.get(deviceId)!;
      queue.push({ changeId, execute, resolve });

      console.log(
        `[DeviceCommandQueue] Enqueued change ${changeId} for device ${deviceId}. Queue length: ${queue.length}`
      );

      // Start processing if not already running for this device
      this.processQueue(deviceId);
    });
  }

  /**
   * Process the queue for a specific device
   */
  private async processQueue(deviceId: string): Promise<void> {
    // If already processing this device's queue, return
    if (this.processing.has(deviceId)) {
      return;
    }

    const queue = this.queues.get(deviceId);
    if (!queue || queue.length === 0) {
      return;
    }

    // Mark as processing
    this.processing.add(deviceId);

    while (queue.length > 0) {
      const command = queue.shift()!;

      console.log(
        `[DeviceCommandQueue] Executing change ${command.changeId} for device ${deviceId}. Remaining: ${queue.length}`
      );

      try {
        const result = await command.execute();
        command.resolve(result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[DeviceCommandQueue] Error executing change ${command.changeId}:`,
          errorMessage
        );
        command.resolve({ success: false, error: errorMessage });
      }
    }

    // Done processing this device's queue
    this.processing.delete(deviceId);

    // Clean up empty queue
    if (queue.length === 0) {
      this.queues.delete(deviceId);
    }
  }

  /**
   * Get the queue length for a device
   */
  getQueueLength(deviceId: string): number {
    return this.queues.get(deviceId)?.length ?? 0;
  }

  /**
   * Check if a device is currently processing commands
   */
  isProcessing(deviceId: string): boolean {
    return this.processing.has(deviceId);
  }

  /**
   * Get overall queue status
   */
  getStatus(): {
    totalQueued: number;
    devicesProcessing: number;
    deviceQueues: Record<string, number>;
  } {
    const deviceQueues: Record<string, number> = {};
    let totalQueued = 0;

    for (const [deviceId, queue] of this.queues) {
      deviceQueues[deviceId] = queue.length;
      totalQueued += queue.length;
    }

    return {
      totalQueued,
      devicesProcessing: this.processing.size,
      deviceQueues,
    };
  }
}

// Singleton instance
export const deviceCommandQueue = new DeviceCommandQueue();
