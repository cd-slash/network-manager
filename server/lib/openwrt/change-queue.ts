// OpenWRT Change Queue System
// Manages pending changes and approval workflow

import type { MergeableStore } from "tinybase";
import { execOpenWRT, type OpenWRTSSHConfig } from "./ssh-commands";
import { DeviceService } from "./device-service";
import { DeviceCommandQueue } from "./device-command-queue";

export type ChangeCategory =
  | "network"
  | "wireless"
  | "firewall"
  | "dhcp"
  | "sqm"
  | "packages"
  | "mesh"
  | "system"
  | "services"
  | "vpn"
  | "backup";

export type ChangeOperation =
  | "create"
  | "update"
  | "delete"
  | "install"
  | "remove"
  | "upgrade"
  | "start"
  | "stop"
  | "restart"
  | "enable"
  | "disable"
  | "restore"
  | "reboot";

export type ChangeImpact = "low" | "medium" | "high" | "critical";

export type ChangeStatus =
  | "pending"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

export interface ChangeRequest {
  deviceId: string;
  category: ChangeCategory;
  operation: ChangeOperation;
  targetType: string;
  targetId: string;
  targetName: string;
  previousValue: unknown;
  proposedValue: unknown;
}

export interface PendingChange {
  id: string;
  deviceId: string;
  category: ChangeCategory;
  operation: ChangeOperation;
  targetType: string;
  targetId: string;
  targetName: string;
  previousValue: string; // JSON stringified
  proposedValue: string; // JSON stringified
  uciCommands: string; // JSON array
  sshCommands: string; // JSON array
  impact: ChangeImpact;
  requiresReboot: boolean;
  requiresServiceRestart: string; // JSON array
  dependencies: string; // JSON array of change IDs
  status: ChangeStatus;
  createdBy: string;
  createdAt: number;
  reviewedBy: string;
  reviewedAt: number;
  reviewNotes: string;
  executedAt: number;
  result: string;
  errorMessage: string;
  rollbackCommands: string; // JSON array
}

export interface ExecutionLog {
  id: string;
  changeId: string;
  batchId: string;
  deviceId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  executedAt: number;
  duration: number;
}

/**
 * Service class for managing the change queue
 */
export class ChangeQueueService {
  private deviceService: DeviceService;
  private commandQueue: DeviceCommandQueue;

  constructor(private store: MergeableStore) {
    this.deviceService = new DeviceService(store);
    this.commandQueue = new DeviceCommandQueue(store);
  }

  /**
   * Create a new pending change
   */
  async createChange(request: ChangeRequest): Promise<string> {
    const changeId = crypto.randomUUID();

    // Generate UCI commands based on the change
    const uciCommands = this.generateUCICommands(request);

    // Assess impact level
    const impact = this.assessImpact(request);

    // Get affected services
    const servicesAffected = this.getAffectedServices(request.category);

    // Generate rollback commands
    const rollbackCommands = this.generateRollbackCommands(request);

    // Check if reboot is required
    const requiresReboot = this.checkRequiresReboot(request);

    this.store.setRow("pendingChanges", changeId, {
      id: changeId,
      deviceId: request.deviceId,
      category: request.category,
      operation: request.operation,
      targetType: request.targetType,
      targetId: request.targetId,
      targetName: request.targetName,
      previousValue: JSON.stringify(request.previousValue),
      proposedValue: JSON.stringify(request.proposedValue),
      uciCommands: JSON.stringify(uciCommands),
      sshCommands: JSON.stringify([]),
      impact,
      requiresReboot,
      requiresServiceRestart: JSON.stringify(servicesAffected),
      dependencies: JSON.stringify([]),
      status: "pending",
      createdBy: "user",
      createdAt: Date.now(),
      reviewedBy: "",
      reviewedAt: 0,
      reviewNotes: "",
      executedAt: 0,
      result: "",
      errorMessage: "",
      rollbackCommands: JSON.stringify(rollbackCommands),
    });

    return changeId;
  }

  /**
   * Approve a pending change (triggers queued auto-execution)
   * Commands to the same device are queued and executed sequentially
   * Commands to different devices can run in parallel
   */
  async approveChange(
    changeId: string,
    reviewedBy: string,
    notes?: string
  ): Promise<{ success: boolean; error?: string }> {
    const change = this.store.getRow("pendingChanges", changeId) as unknown as PendingChange;

    if (!change || change.status !== "pending") {
      return { success: false, error: "Change not found or not pending" };
    }

    // Update status to approved
    this.store.setPartialRow("pendingChanges", changeId, {
      status: "approved",
      reviewedBy,
      reviewedAt: Date.now(),
      reviewNotes: notes || "",
    });

    // Enqueue the execution - commands to the same device run sequentially
    const queueLength = this.commandQueue.getQueueLength(change.deviceId);
    if (queueLength > 0) {
      console.log(
        `[ChangeQueue] Queuing change ${changeId} behind ${queueLength} other command(s) for device ${change.deviceId}`
      );
    }

    return this.commandQueue.enqueue(
      change.deviceId,
      changeId,
      () => this.executeChange(changeId)
    );
  }

  /**
   * Get the command queue instance for status/monitoring
   */
  getCommandQueue(): DeviceCommandQueue {
    return this.commandQueue;
  }

  /**
   * Reject a pending change
   */
  rejectChange(
    changeId: string,
    reviewedBy: string,
    reason: string
  ): void {
    this.store.setPartialRow("pendingChanges", changeId, {
      status: "cancelled",
      reviewedBy,
      reviewedAt: Date.now(),
      reviewNotes: reason,
    });
  }

  /**
   * Execute an approved change
   */
  async executeChange(
    changeId: string
  ): Promise<{ success: boolean; error?: string; logs?: ExecutionLog[] }> {
    const change = this.store.getRow("pendingChanges", changeId) as unknown as PendingChange;

    if (!change) {
      return { success: false, error: "Change not found" };
    }

    if (change.status !== "approved") {
      return { success: false, error: "Change must be approved before execution" };
    }

    // Get device info
    const device = this.store.getRow("openwrtDevices", change.deviceId);
    if (!device) {
      return { success: false, error: "Device not found" };
    }

    const sshConfig: OpenWRTSSHConfig = {
      host: device.tailscaleIp as string,
      user: "root",
    };

    // Create pre-execution snapshot
    await this.createSnapshot(change.deviceId, change.category);

    // Update status to executing
    this.store.setPartialRow("pendingChanges", changeId, {
      status: "executing",
      executedAt: Date.now(),
    });

    const logs: ExecutionLog[] = [];

    try {
      // Handle package operations specially
      if (change.category === "packages") {
        const proposed = JSON.parse(change.proposedValue || "{}");
        const packageName = proposed.package || proposed.name || change.targetName?.replace(/^(Install|Upgrade|Remove) package /, "");

        let commands: string[] = [];
        let timeout = 120000; // 2 minutes for package operations

        if (change.operation === "install" || change.operation === "create") {
          commands = ["opkg update", `opkg install ${packageName}`];
        } else if (change.operation === "upgrade") {
          commands = [`opkg upgrade ${packageName}`];
        } else if (change.operation === "remove" || change.operation === "delete") {
          commands = [`opkg remove ${packageName}`];
        }

        for (const cmd of commands) {
          const startTime = Date.now();
          const result = await execOpenWRT(sshConfig, cmd, timeout);

          const logId = crypto.randomUUID();
          const log: ExecutionLog = {
            id: logId,
            changeId,
            batchId: "",
            deviceId: change.deviceId,
            command: cmd,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.code,
            executedAt: startTime,
            duration: Date.now() - startTime,
          };

          logs.push(log);
          this.store.setRow("executionLogs", logId, log as unknown as Record<string, string | number | boolean>);

          if (result.code !== 0) {
            throw new Error(`Command failed: ${cmd}\n${result.stderr}`);
          }
        }

        // Refresh packages list after successful operation
        try {
          await this.deviceService.refreshPackages({
            id: change.deviceId,
            host: device.tailscaleIp as string,
          });
        } catch (e) {
          console.error("[ChangeQueue] Failed to refresh packages after operation:", e);
          // Don't fail the operation if refresh fails
        }
      } else {
        // Execute UCI commands for non-package changes
        const uciCommands = JSON.parse(change.uciCommands) as string[];

        for (const cmd of uciCommands) {
          const startTime = Date.now();
          const result = await execOpenWRT(sshConfig, cmd);

          const logId = crypto.randomUUID();
          const log: ExecutionLog = {
            id: logId,
            changeId,
            batchId: "",
            deviceId: change.deviceId,
            command: cmd,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.code,
            executedAt: startTime,
            duration: Date.now() - startTime,
          };

          logs.push(log);
          this.store.setRow("executionLogs", logId, log as unknown as Record<string, string | number | boolean>);

          if (result.code !== 0) {
            throw new Error(`Command failed: ${cmd}\n${result.stderr}`);
          }
        }

        // Restart affected services
        const services = JSON.parse(change.requiresServiceRestart) as string[];
        for (const service of services) {
          await execOpenWRT(sshConfig, `/etc/init.d/${service} restart`);
        }
      }

      // Mark as completed
      this.store.setPartialRow("pendingChanges", changeId, {
        status: "completed",
        result: "success",
      });

      return { success: true, logs };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      this.store.setPartialRow("pendingChanges", changeId, {
        status: "failed",
        result: "error",
        errorMessage,
      });

      return { success: false, error: errorMessage, logs };
    }
  }

  /**
   * Rollback a completed change
   */
  async rollbackChange(changeId: string): Promise<string> {
    const change = this.store.getRow("pendingChanges", changeId) as unknown as PendingChange;

    if (!change) {
      throw new Error("Change not found");
    }

    // Create a rollback change
    const rollbackCommands = JSON.parse(change.rollbackCommands) as string[];

    if (rollbackCommands.length === 0) {
      throw new Error("No rollback commands available");
    }

    // Create a new change for the rollback
    const rollbackChangeId = await this.createChange({
      deviceId: change.deviceId,
      category: change.category,
      operation: "update",
      targetType: change.targetType,
      targetId: change.targetId,
      targetName: `Rollback: ${change.targetName}`,
      previousValue: JSON.parse(change.proposedValue),
      proposedValue: JSON.parse(change.previousValue),
    });

    // Override the UCI commands with rollback commands
    this.store.setPartialRow("pendingChanges", rollbackChangeId, {
      uciCommands: change.rollbackCommands,
    });

    return rollbackChangeId;
  }

  /**
   * Create a configuration snapshot before making changes
   */
  private async createSnapshot(
    deviceId: string,
    category: ChangeCategory
  ): Promise<string> {
    const snapshotId = crypto.randomUUID();

    const device = this.store.getRow("openwrtDevices", deviceId);
    if (!device) return snapshotId;

    const sshConfig: OpenWRTSSHConfig = {
      host: device.tailscaleIp as string,
      user: "root",
    };

    try {
      const result = await execOpenWRT(sshConfig, `uci export ${category}`);

      this.store.setRow("configSnapshots", snapshotId, {
        id: snapshotId,
        deviceId,
        snapshotType: "partial",
        category,
        config: result.stdout,
        description: `Pre-change snapshot for ${category}`,
        createdAt: Date.now(),
        createdBy: "system",
        isAutomatic: true,
      });
    } catch {
      // Snapshot failed, but continue with the change
      console.error(`Failed to create snapshot for ${category} on ${deviceId}`);
    }

    return snapshotId;
  }

  /**
   * Generate UCI commands for a change request
   */
  private generateUCICommands(request: ChangeRequest): string[] {
    const commands: string[] = [];
    const proposed = request.proposedValue as Record<string, unknown>;

    switch (request.operation) {
      case "create":
        // Generate create commands based on category
        for (const [key, value] of Object.entries(proposed)) {
          if (key === "_type") continue;
          commands.push(
            `uci set ${request.category}.${request.targetId}.${key}='${value}'`
          );
        }
        break;

      case "update":
        // Generate update commands
        for (const [key, value] of Object.entries(proposed)) {
          commands.push(
            `uci set ${request.category}.${request.targetId}.${key}='${value}'`
          );
        }
        break;

      case "delete":
        commands.push(`uci delete ${request.category}.${request.targetId}`);
        break;
    }

    // Add commit command
    commands.push(`uci commit ${request.category}`);

    return commands;
  }

  /**
   * Generate rollback commands for a change
   */
  private generateRollbackCommands(request: ChangeRequest): string[] {
    const commands: string[] = [];
    const previous = request.previousValue as Record<string, unknown>;

    switch (request.operation) {
      case "create":
        // Rollback create = delete
        commands.push(`uci delete ${request.category}.${request.targetId}`);
        break;

      case "update":
        // Rollback update = restore previous values
        for (const [key, value] of Object.entries(previous || {})) {
          commands.push(
            `uci set ${request.category}.${request.targetId}.${key}='${value}'`
          );
        }
        break;

      case "delete":
        // Rollback delete = recreate
        for (const [key, value] of Object.entries(previous || {})) {
          if (key === "_type") continue;
          commands.push(
            `uci set ${request.category}.${request.targetId}.${key}='${value}'`
          );
        }
        break;
    }

    commands.push(`uci commit ${request.category}`);

    return commands;
  }

  /**
   * Assess the impact level of a change
   */
  private assessImpact(request: ChangeRequest): ChangeImpact {
    // Critical: WAN, firewall zones, system changes
    if (
      request.targetId.includes("wan") ||
      request.targetType === "zone" ||
      request.category === "system"
    ) {
      return "critical";
    }

    // High: Wireless, firewall rules, packages
    if (
      request.category === "wireless" ||
      request.category === "firewall" ||
      request.category === "packages"
    ) {
      return "high";
    }

    // Medium: DHCP, SQM, mesh
    if (
      request.category === "dhcp" ||
      request.category === "sqm" ||
      request.category === "mesh"
    ) {
      return "medium";
    }

    return "low";
  }

  /**
   * Get the services that need to be restarted for a category
   */
  private getAffectedServices(category: ChangeCategory): string[] {
    const serviceMap: Record<ChangeCategory, string[]> = {
      network: ["network"],
      wireless: ["network"],
      firewall: ["firewall"],
      dhcp: ["dnsmasq"],
      sqm: ["sqm"],
      packages: [],
      mesh: ["network"],
      system: [],
      services: [],
      vpn: ["network"],
      backup: [],
    };

    return serviceMap[category] || [];
  }

  /**
   * Check if a change requires a system reboot
   */
  private checkRequiresReboot(request: ChangeRequest): boolean {
    // Kernel module changes, firmware upgrade
    if (request.category === "system" && request.targetType === "firmware") {
      return true;
    }

    // Some package installations require reboot
    if (
      request.category === "packages" &&
      request.operation === "create" &&
      (request.targetName.includes("kmod-") ||
        request.targetName.includes("kernel"))
    ) {
      return true;
    }

    return false;
  }

  /**
   * Get pending changes for a device
   */
  getPendingChanges(deviceId?: string): PendingChange[] {
    const changeIds = this.store.getRowIds("pendingChanges");
    const changes: PendingChange[] = [];

    for (const id of changeIds) {
      const change = this.store.getRow("pendingChanges", id) as unknown as PendingChange;
      if (change.status === "pending") {
        if (!deviceId || change.deviceId === deviceId) {
          changes.push(change);
        }
      }
    }

    return changes.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Simple queue change method for API routes
   */
  queueChange(params: {
    deviceId: string;
    changeType: string;
    tableName: string;
    rowId?: string;
    previousValue: unknown;
    proposedValue: unknown;
    description: string;
  }): string {
    const changeId = crypto.randomUUID();

    // Map changeType to category
    const categoryMap: Record<string, ChangeCategory> = {
      wireguard_add_peer: "network",
      wireguard_delete_peer: "network",
      openvpn_start: "network",
      openvpn_stop: "network",
      openvpn_restart: "network",
      openvpn_create: "network",
      openvpn_delete: "network",
      backup_create: "system",
      backup_restore: "system",
      service_start: "system",
      service_stop: "system",
      service_restart: "system",
      service_enable: "system",
      service_disable: "system",
      package_install: "packages",
      package_upgrade: "packages",
      package_remove: "packages",
    };

    const category = categoryMap[params.changeType] || "system";

    // Map changeType to operation
    let operation: ChangeOperation = "update";
    if (params.changeType.includes("create") || params.changeType.includes("add") || params.changeType.includes("install")) {
      operation = "create";
    } else if (params.changeType.includes("delete") || params.changeType.includes("remove")) {
      operation = "delete";
    } else if (params.changeType.includes("upgrade")) {
      operation = "upgrade";
    }

    // Generate SSH commands for package operations
    let sshCommands: string[] = [];
    if (category === "packages") {
      const proposed = params.proposedValue as { package?: string; name?: string; action?: string } | null;
      const previous = params.previousValue as { name?: string } | null;
      const packageName = proposed?.package || proposed?.name || previous?.name || "";

      if (packageName) {
        if (params.changeType === "package_install") {
          sshCommands = ["opkg update", `opkg install ${packageName}`];
        } else if (params.changeType === "package_upgrade") {
          sshCommands = [`opkg upgrade ${packageName}`];
        } else if (params.changeType === "package_remove") {
          sshCommands = [`opkg remove ${packageName}`];
        }
      }
    }

    // Generate SSH commands for service operations
    if (category === "system" && params.tableName === "services") {
      const proposed = params.proposedValue as { service?: string; name?: string } | null;
      const serviceName = proposed?.service || proposed?.name || "";

      if (serviceName) {
        if (params.changeType === "service_start") {
          sshCommands = [`/etc/init.d/${serviceName} start`];
        } else if (params.changeType === "service_stop") {
          sshCommands = [`/etc/init.d/${serviceName} stop`];
        } else if (params.changeType === "service_restart") {
          sshCommands = [`/etc/init.d/${serviceName} restart`];
        } else if (params.changeType === "service_enable") {
          sshCommands = [`/etc/init.d/${serviceName} enable`];
        } else if (params.changeType === "service_disable") {
          sshCommands = [`/etc/init.d/${serviceName} disable`];
        }
      }
    }

    this.store.setRow("pendingChanges", changeId, {
      id: changeId,
      deviceId: params.deviceId,
      category,
      operation,
      targetType: params.tableName,
      targetId: params.rowId || changeId,
      targetName: params.description,
      previousValue: JSON.stringify(params.previousValue),
      proposedValue: JSON.stringify(params.proposedValue),
      uciCommands: JSON.stringify([]),
      sshCommands: JSON.stringify(sshCommands),
      impact: "medium",
      requiresReboot: false,
      requiresServiceRestart: JSON.stringify([]),
      dependencies: JSON.stringify([]),
      status: "pending",
      createdBy: "user",
      createdAt: Date.now(),
      reviewedBy: "",
      reviewedAt: 0,
      reviewNotes: "",
      executedAt: 0,
      result: "",
      errorMessage: "",
      rollbackCommands: JSON.stringify([]),
    });

    return changeId;
  }

  /**
   * Get change history
   */
  getChangeHistory(
    deviceId?: string,
    limit = 50
  ): PendingChange[] {
    const changeIds = this.store.getRowIds("pendingChanges");
    const changes: PendingChange[] = [];

    for (const id of changeIds) {
      const change = this.store.getRow("pendingChanges", id) as unknown as PendingChange;
      if (change.status !== "pending") {
        if (!deviceId || change.deviceId === deviceId) {
          changes.push(change);
        }
      }
    }

    return changes
      .sort((a, b) => b.executedAt - a.executedAt)
      .slice(0, limit);
  }

  /**
   * Get execution logs for a specific change
   */
  getExecutionLogs(changeId: string): ExecutionLog[] {
    const logIds = this.store.getRowIds("executionLogs");
    const logs: ExecutionLog[] = [];

    for (const id of logIds) {
      const log = this.store.getRow("executionLogs", id) as unknown as ExecutionLog;
      if (log.changeId === changeId) {
        logs.push(log);
      }
    }

    return logs.sort((a, b) => a.executedAt - b.executedAt);
  }
}

/**
 * Generate a human-readable diff for display
 */
export function generateChangeDiff(change: PendingChange): {
  changes: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
    type: "added" | "removed" | "changed";
  }>;
  commands: string[];
  impact: ChangeImpact;
  servicesAffected: string[];
} {
  const prev = JSON.parse(change.previousValue || "{}");
  const next = JSON.parse(change.proposedValue || "{}");

  const changes: Array<{
    field: string;
    oldValue: unknown;
    newValue: unknown;
    type: "added" | "removed" | "changed";
  }> = [];

  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)]);

  for (const key of allKeys) {
    if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
      changes.push({
        field: key,
        oldValue: prev[key],
        newValue: next[key],
        type:
          prev[key] === undefined
            ? "added"
            : next[key] === undefined
            ? "removed"
            : "changed",
      });
    }
  }

  return {
    changes,
    commands: JSON.parse(change.uciCommands || "[]"),
    impact: change.impact,
    servicesAffected: JSON.parse(change.requiresServiceRestart || "[]"),
  };
}
