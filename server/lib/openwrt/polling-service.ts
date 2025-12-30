// OpenWRT Device Polling Service
// Periodically polls OpenWRT devices for status updates

import { MergeableStore } from "tinybase";
import { DeviceService, DeviceConfig } from "./device-service";

export interface PollingConfig {
  // How often to poll devices (ms)
  pollInterval: number;
  // How often to do a full refresh (ms)
  fullRefreshInterval: number;
  // Timeout for considering device offline (ms)
  offlineTimeout: number;
  // Whether to poll on startup
  pollOnStart: boolean;
}

const DEFAULT_CONFIG: PollingConfig = {
  pollInterval: 30000, // 30 seconds
  fullRefreshInterval: 300000, // 5 minutes
  offlineTimeout: 120000, // 2 minutes
  pollOnStart: true,
};

export class PollingService {
  private store: MergeableStore;
  private deviceService: DeviceService;
  private config: PollingConfig;
  private pollTimer: NodeJS.Timeout | null = null;
  private fullRefreshTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastFullRefresh: Map<string, number> = new Map();

  constructor(
    store: MergeableStore,
    config: Partial<PollingConfig> = {}
  ) {
    this.store = store;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.deviceService = new DeviceService(store);
  }

  /**
   * Start the polling service
   */
  start(): void {
    if (this.isRunning) {
      console.log("[PollingService] Already running");
      return;
    }

    console.log("[PollingService] Starting with config:", {
      pollInterval: this.config.pollInterval,
      fullRefreshInterval: this.config.fullRefreshInterval,
    });

    this.isRunning = true;

    // Initial poll
    if (this.config.pollOnStart) {
      this.pollAll();
    }

    // Set up periodic polling
    this.pollTimer = setInterval(() => {
      this.pollAll();
    }, this.config.pollInterval);

    // Set up full refresh timer
    this.fullRefreshTimer = setInterval(() => {
      this.fullRefreshAll();
    }, this.config.fullRefreshInterval);
  }

  /**
   * Stop the polling service
   */
  stop(): void {
    console.log("[PollingService] Stopping");

    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.fullRefreshTimer) {
      clearInterval(this.fullRefreshTimer);
      this.fullRefreshTimer = null;
    }
  }

  /**
   * Get all registered devices
   */
  private getDevices(): DeviceConfig[] {
    const deviceIds = this.store.getRowIds("openwrtDevices");
    const devices: DeviceConfig[] = [];

    for (const id of deviceIds) {
      const row = this.store.getRow("openwrtDevices", id) as Record<string, unknown>;
      if (row && row.tailscaleIp) {
        devices.push({
          id,
          host: String(row.tailscaleIp),
          port: typeof row.port === "number" ? row.port : 22,
          user: typeof row.user === "string" ? row.user : "root",
        });
      }
    }

    return devices;
  }

  /**
   * Quick poll all devices (status check only)
   */
  async pollAll(): Promise<void> {
    const devices = this.getDevices();

    if (devices.length === 0) {
      return;
    }

    console.log(`[PollingService] Polling ${devices.length} devices`);

    const results = await Promise.allSettled(
      devices.map(async (device) => {
        try {
          const isOnline = await this.deviceService.checkDeviceStatus(device);

          const currentRow = this.store.getRow("openwrtDevices", device.id) as Record<string, unknown>;
          const wasOnline = currentRow?.status === "online";

          const lastSeenValue = isOnline ? Date.now() : (typeof currentRow?.lastSeen === "number" ? currentRow.lastSeen : Date.now());
          this.store.setPartialRow("openwrtDevices", device.id, {
            status: isOnline ? "online" : "offline",
            lastSeen: lastSeenValue,
          });

          // If device just came online, do a quick refresh
          if (isOnline && !wasOnline) {
            console.log(`[PollingService] Device ${device.id} came online, refreshing...`);
            await this.deviceService.refreshSystemInfo(device);
          }

          return { deviceId: device.id, online: isOnline };
        } catch (error) {
          console.error(`[PollingService] Error polling ${device.id}:`, error);
          this.store.setPartialRow("openwrtDevices", device.id, {
            status: "offline",
          });
          return { deviceId: device.id, online: false, error };
        }
      })
    );

    const online = results.filter(
      (r) => r.status === "fulfilled" && r.value.online
    ).length;
    console.log(`[PollingService] Poll complete: ${online}/${devices.length} online`);
  }

  /**
   * Full refresh of all device data
   */
  async fullRefreshAll(): Promise<void> {
    const devices = this.getDevices();
    const onlineDevices = devices.filter((d) => {
      const row = this.store.getRow("openwrtDevices", d.id) as Record<string, unknown>;
      return row?.status === "online";
    });

    if (onlineDevices.length === 0) {
      return;
    }

    console.log(`[PollingService] Full refresh for ${onlineDevices.length} online devices`);

    await Promise.allSettled(
      onlineDevices.map(async (device) => {
        try {
          await this.deviceService.refreshAll(device);
          this.lastFullRefresh.set(device.id, Date.now());
          console.log(`[PollingService] Full refresh complete for ${device.id}`);
        } catch (error) {
          console.error(`[PollingService] Full refresh failed for ${device.id}:`, error);
        }
      })
    );
  }

  /**
   * Force refresh a specific device
   */
  async refreshDevice(deviceId: string): Promise<void> {
    const row = this.store.getRow("openwrtDevices", deviceId) as Record<string, unknown>;
    if (!row || !row.tailscaleIp) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const device: DeviceConfig = {
      id: deviceId,
      host: String(row.tailscaleIp),
      port: typeof row.port === "number" ? row.port : 22,
      user: typeof row.user === "string" ? row.user : "root",
    };

    await this.deviceService.refreshAll(device);
    this.lastFullRefresh.set(deviceId, Date.now());
  }

  /**
   * Get last refresh time for a device
   */
  getLastRefresh(deviceId: string): number | undefined {
    return this.lastFullRefresh.get(deviceId);
  }

  /**
   * Check if service is running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get polling statistics
   */
  getStats(): {
    isRunning: boolean;
    deviceCount: number;
    onlineCount: number;
    lastRefreshTimes: Record<string, number>;
  } {
    const devices = this.getDevices();
    const onlineDevices = devices.filter((d) => {
      const row = this.store.getRow("openwrtDevices", d.id) as Record<string, unknown>;
      return row?.status === "online";
    });

    const lastRefreshTimes: Record<string, number> = {};
    for (const [id, time] of this.lastFullRefresh) {
      lastRefreshTimes[id] = time;
    }

    return {
      isRunning: this.isRunning,
      deviceCount: devices.length,
      onlineCount: onlineDevices.length,
      lastRefreshTimes,
    };
  }
}
