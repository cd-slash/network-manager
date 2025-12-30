// OpenWRT Change Execution Engine
// Executes approved changes on OpenWRT devices

import { MergeableStore } from "tinybase";
import { DeviceService, DeviceConfig } from "./device-service";
import { execOpenWRT, execOpenWRTBatch, type OpenWRTSSHConfig } from "./ssh-commands";
import { NetworkCommands } from "./commands/network";
import { WirelessCommands } from "./commands/wireless";
import { FirewallCommands } from "./commands/firewall";
import { DHCPCommands } from "./commands/dhcp";
import { PackageCommands } from "./commands/packages";
import { SQMCommands } from "./commands/sqm";
import { WireGuardCommands, OpenVPNCommands } from "./commands/vpn";
import { BackupCommands } from "./commands/backup";
import { SystemCommands } from "./commands/system";
import { PendingChange } from "./change-queue";

export interface ExecutionResult {
  success: boolean;
  changeId: string;
  output?: string;
  error?: string;
  executedAt: number;
  duration: number;
}

export class ExecutionEngine {
  private store: MergeableStore;
  private deviceService: DeviceService;
  private isProcessing = false;

  constructor(store: MergeableStore) {
    this.store = store;
    this.deviceService = new DeviceService(store);
  }

  /**
   * Get device config from store
   */
  private getDeviceConfig(deviceId: string): DeviceConfig | null {
    const row = this.store.getRow("openwrtDevices", deviceId) as Record<string, unknown>;
    if (!row || !row.tailscaleIp) {
      return null;
    }

    return {
      id: deviceId,
      host: String(row.tailscaleIp),
      port: typeof row.port === "number" ? row.port : 22,
      user: typeof row.user === "string" ? row.user : "root",
    };
  }

  /**
   * Get SSH config for a device
   */
  private getSSHConfig(device: DeviceConfig): OpenWRTSSHConfig {
    return {
      host: device.host,
      port: device.port || 22,
      user: device.user || "root",
    };
  }

  /**
   * Execute a single approved change
   */
  async executeChange(changeId: string): Promise<ExecutionResult> {
    const startTime = Date.now();

    const change = this.store.getRow("pendingChanges", changeId) as unknown as PendingChange;
    if (!change) {
      return {
        success: false,
        changeId,
        error: "Change not found",
        executedAt: startTime,
        duration: 0,
      };
    }

    if (change.status !== "approved") {
      return {
        success: false,
        changeId,
        error: `Change status is ${change.status}, expected approved`,
        executedAt: startTime,
        duration: 0,
      };
    }

    const device = this.getDeviceConfig(change.deviceId);
    if (!device) {
      this.store.setPartialRow("pendingChanges", changeId, {
        status: "failed",
        error: "Device not found",
        executedAt: Date.now(),
      });
      return {
        success: false,
        changeId,
        error: "Device not found",
        executedAt: startTime,
        duration: Date.now() - startTime,
      };
    }

    try {
      const result = await this.executeChangeCommands(device, change);

      if (result.success) {
        // Move to history
        this.store.setRow("changeHistory", changeId, {
          ...change,
          status: "executed",
          executedAt: Date.now(),
          output: result.output || "",
        });
        this.store.delRow("pendingChanges", changeId);
      } else {
        this.store.setPartialRow("pendingChanges", changeId, {
          status: "failed",
          error: result.error || "Unknown error",
          executedAt: Date.now(),
        });
      }

      return {
        ...result,
        changeId,
        executedAt: startTime,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.store.setPartialRow("pendingChanges", changeId, {
        status: "failed",
        error: errorMessage,
        executedAt: Date.now(),
      });

      return {
        success: false,
        changeId,
        error: errorMessage,
        executedAt: startTime,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute commands for a specific change
   */
  private async executeChangeCommands(
    device: DeviceConfig,
    change: PendingChange
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const config = this.getSSHConfig(device);
    // Parse proposedValue from JSON string
    const proposed: Record<string, unknown> = typeof change.proposedValue === "string"
      ? JSON.parse(change.proposedValue)
      : change.proposedValue as Record<string, unknown>;

    switch (change.category) {
      case "network":
        return this.executeNetworkChange(config, change, proposed);

      case "wireless":
        return this.executeWirelessChange(config, change, proposed);

      case "firewall":
        return this.executeFirewallChange(config, change, proposed);

      case "dhcp":
        return this.executeDHCPChange(config, change, proposed);

      case "packages":
        return this.executePackageChange(config, change, proposed);

      case "services":
        return this.executeServiceChange(config, change, proposed);

      case "vpn":
        return this.executeVPNChange(config, change, proposed);

      case "sqm":
        return this.executeSQMChange(config, change, proposed);

      case "backup":
        return this.executeBackupChange(config, change, proposed);

      default:
        return {
          success: false,
          error: `Unknown category: ${change.category}`,
        };
    }
  }

  /**
   * Execute network configuration changes
   */
  private async executeNetworkChange(
    config: OpenWRTSSHConfig,
    change: PendingChange,
    proposed: Record<string, unknown>
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const commands: string[] = [];

    if (change.operation === "create") {
      const name = String(proposed.name);
      commands.push(`uci set network.${name}=interface`);
      if (proposed.proto) commands.push(`uci set network.${name}.proto='${proposed.proto}'`);
      if (proposed.ipaddr) commands.push(`uci set network.${name}.ipaddr='${proposed.ipaddr}'`);
      if (proposed.netmask) commands.push(`uci set network.${name}.netmask='${proposed.netmask}'`);
      if (proposed.gateway) commands.push(`uci set network.${name}.gateway='${proposed.gateway}'`);
      if (proposed.device) commands.push(`uci set network.${name}.device='${proposed.device}'`);
    } else if (change.operation === "update" && change.targetId) {
      const name = change.targetId.split("_").pop();
      for (const [key, value] of Object.entries(proposed)) {
        if (key !== "deviceId" && key !== "name") {
          commands.push(`uci set network.${name}.${key}='${value}'`);
        }
      }
    } else if (change.operation === "delete" && change.targetId) {
      const name = change.targetId.split("_").pop();
      commands.push(`uci delete network.${name}`);
    }

    commands.push("uci commit network");
    commands.push("/etc/init.d/network reload");

    return this.executeCommandBatch(config, commands);
  }

  /**
   * Execute wireless configuration changes
   */
  private async executeWirelessChange(
    config: OpenWRTSSHConfig,
    change: PendingChange,
    proposed: Record<string, unknown>
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const commands: string[] = [];

    if (change.targetType === "wirelessRadios") {
      const name = change.targetId?.split("_").pop();
      if (name) {
        if (proposed.channel) commands.push(`uci set wireless.${name}.channel='${proposed.channel}'`);
        if (proposed.htmode) commands.push(`uci set wireless.${name}.htmode='${proposed.htmode}'`);
        if (proposed.txpower) commands.push(`uci set wireless.${name}.txpower='${proposed.txpower}'`);
        if (proposed.disabled !== undefined) {
          commands.push(`uci set wireless.${name}.disabled='${proposed.disabled ? 1 : 0}'`);
        }
      }
    } else if (change.targetType === "wirelessSSIDs") {
      if (change.operation === "create") {
        const device = String(proposed.device);
        commands.push(`uci add wireless wifi-iface`);
        commands.push(`uci set wireless.@wifi-iface[-1].device='${device}'`);
        if (proposed.ssid) commands.push(`uci set wireless.@wifi-iface[-1].ssid='${proposed.ssid}'`);
        if (proposed.mode) commands.push(`uci set wireless.@wifi-iface[-1].mode='${proposed.mode}'`);
        if (proposed.network) commands.push(`uci set wireless.@wifi-iface[-1].network='${proposed.network}'`);
        if (proposed.encryption) commands.push(`uci set wireless.@wifi-iface[-1].encryption='${proposed.encryption}'`);
        if (proposed.key) commands.push(`uci set wireless.@wifi-iface[-1].key='${proposed.key}'`);
      } else if (change.operation === "update" && change.targetId) {
        const name = change.targetId.split("_").pop();
        for (const [key, value] of Object.entries(proposed)) {
          if (!["deviceId", "name"].includes(key)) {
            commands.push(`uci set wireless.${name}.${key}='${value}'`);
          }
        }
      } else if (change.operation === "delete" && change.targetId) {
        const name = change.targetId.split("_").pop();
        commands.push(`uci delete wireless.${name}`);
      }
    }

    commands.push("uci commit wireless");
    commands.push("wifi reload");

    return this.executeCommandBatch(config, commands);
  }

  /**
   * Execute firewall configuration changes
   */
  private async executeFirewallChange(
    config: OpenWRTSSHConfig,
    change: PendingChange,
    proposed: Record<string, unknown>
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const commands: string[] = [];

    if (change.targetType === "firewallZones") {
      if (change.operation === "create") {
        commands.push("uci add firewall zone");
        if (proposed.name) commands.push(`uci set firewall.@zone[-1].name='${proposed.name}'`);
        if (proposed.input) commands.push(`uci set firewall.@zone[-1].input='${proposed.input}'`);
        if (proposed.output) commands.push(`uci set firewall.@zone[-1].output='${proposed.output}'`);
        if (proposed.forward) commands.push(`uci set firewall.@zone[-1].forward='${proposed.forward}'`);
        if (proposed.network) commands.push(`uci add_list firewall.@zone[-1].network='${proposed.network}'`);
      }
    } else if (change.targetType === "firewallRules") {
      if (change.operation === "create") {
        commands.push("uci add firewall rule");
        if (proposed.name) commands.push(`uci set firewall.@rule[-1].name='${proposed.name}'`);
        if (proposed.src) commands.push(`uci set firewall.@rule[-1].src='${proposed.src}'`);
        if (proposed.dest) commands.push(`uci set firewall.@rule[-1].dest='${proposed.dest}'`);
        if (proposed.proto) commands.push(`uci set firewall.@rule[-1].proto='${proposed.proto}'`);
        if (proposed.dest_port) commands.push(`uci set firewall.@rule[-1].dest_port='${proposed.dest_port}'`);
        if (proposed.target) commands.push(`uci set firewall.@rule[-1].target='${proposed.target}'`);
      }
    } else if (change.targetType === "portForwards") {
      if (change.operation === "create") {
        commands.push("uci add firewall redirect");
        if (proposed.name) commands.push(`uci set firewall.@redirect[-1].name='${proposed.name}'`);
        commands.push(`uci set firewall.@redirect[-1].target='DNAT'`);
        if (proposed.src) commands.push(`uci set firewall.@redirect[-1].src='${proposed.src}'`);
        if (proposed.src_dport) commands.push(`uci set firewall.@redirect[-1].src_dport='${proposed.src_dport}'`);
        if (proposed.dest) commands.push(`uci set firewall.@redirect[-1].dest='${proposed.dest}'`);
        if (proposed.dest_ip) commands.push(`uci set firewall.@redirect[-1].dest_ip='${proposed.dest_ip}'`);
        if (proposed.dest_port) commands.push(`uci set firewall.@redirect[-1].dest_port='${proposed.dest_port}'`);
        if (proposed.proto) commands.push(`uci set firewall.@redirect[-1].proto='${proposed.proto}'`);
      }
    }

    commands.push("uci commit firewall");
    commands.push("/etc/init.d/firewall reload");

    return this.executeCommandBatch(config, commands);
  }

  /**
   * Execute DHCP configuration changes
   */
  private async executeDHCPChange(
    config: OpenWRTSSHConfig,
    change: PendingChange,
    proposed: Record<string, unknown>
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const commands: string[] = [];

    if (change.operation === "create" && change.targetType === "dhcpStaticLeases") {
      commands.push("uci add dhcp host");
      if (proposed.mac) commands.push(`uci set dhcp.@host[-1].mac='${proposed.mac}'`);
      if (proposed.ip) commands.push(`uci set dhcp.@host[-1].ip='${proposed.ip}'`);
      if (proposed.name) commands.push(`uci set dhcp.@host[-1].name='${proposed.name}'`);
    }

    commands.push("uci commit dhcp");
    commands.push("/etc/init.d/dnsmasq restart");

    return this.executeCommandBatch(config, commands);
  }

  /**
   * Execute package operations
   */
  private async executePackageChange(
    config: OpenWRTSSHConfig,
    change: PendingChange,
    proposed: Record<string, unknown>
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const packageName = String(proposed.name || proposed.packageName);
    let result: { success: boolean; output?: string; error?: string };

    if (change.operation === "install") {
      const commands = [
        PackageCommands.update,
        PackageCommands.install(packageName),
      ];
      result = await this.executeCommandBatch(config, commands, 120000);
    } else if (change.operation === "remove") {
      result = await this.executeCommand(config, PackageCommands.remove(packageName));
    } else if (change.operation === "upgrade") {
      result = await this.executeCommand(config, PackageCommands.upgrade(packageName), 120000);
    } else {
      return { success: false, error: `Unknown package operation: ${change.operation}` };
    }

    // Refresh packages list after successful operation to update UI
    if (result.success) {
      try {
        const device = this.getDeviceConfig(change.deviceId);
        if (device) {
          await this.deviceService.refreshPackages(device);
        }
      } catch (e) {
        console.error("[ExecutionEngine] Failed to refresh packages after operation:", e);
        // Don't fail the operation if refresh fails
      }
    }

    return result;
  }

  /**
   * Execute service operations
   */
  private async executeServiceChange(
    config: OpenWRTSSHConfig,
    change: PendingChange,
    proposed: Record<string, unknown>
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const serviceName = String(proposed.name || proposed.service);

    switch (change.operation) {
      case "start":
        return this.executeCommand(config, SystemCommands.startService(serviceName));
      case "stop":
        return this.executeCommand(config, SystemCommands.stopService(serviceName));
      case "restart":
        return this.executeCommand(config, SystemCommands.restartService(serviceName));
      case "enable":
        return this.executeCommand(config, SystemCommands.enableService(serviceName));
      case "disable":
        return this.executeCommand(config, SystemCommands.disableService(serviceName));
      default:
        return { success: false, error: `Unknown service operation: ${change.operation}` };
    }
  }

  /**
   * Execute VPN configuration changes
   */
  private async executeVPNChange(
    config: OpenWRTSSHConfig,
    change: PendingChange,
    proposed: Record<string, unknown>
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const commands: string[] = [];

    if (change.targetType === "wireguardPeers" && change.operation === "create") {
      const iface = String(proposed.interface);
      commands.push(`uci add network wireguard_${iface}`);
      if (proposed.publicKey) commands.push(`uci set network.@wireguard_${iface}[-1].public_key='${proposed.publicKey}'`);
      if (proposed.allowedIps) commands.push(`uci set network.@wireguard_${iface}[-1].allowed_ips='${proposed.allowedIps}'`);
      if (proposed.endpoint) {
        const [host, port] = String(proposed.endpoint).split(":");
        commands.push(`uci set network.@wireguard_${iface}[-1].endpoint_host='${host}'`);
        if (port) commands.push(`uci set network.@wireguard_${iface}[-1].endpoint_port='${port}'`);
      }
      if (proposed.persistentKeepalive) {
        commands.push(`uci set network.@wireguard_${iface}[-1].persistent_keepalive='${proposed.persistentKeepalive}'`);
      }
      commands.push("uci commit network");
      commands.push("/etc/init.d/network reload");
    } else if (change.targetType === "openvpnInstances") {
      if (change.operation === "start") {
        return this.executeCommand(config, OpenVPNCommands.start(String(proposed.name)));
      } else if (change.operation === "stop") {
        return this.executeCommand(config, OpenVPNCommands.stop(String(proposed.name)));
      }
    }

    return this.executeCommandBatch(config, commands);
  }

  /**
   * Execute SQM configuration changes
   */
  private async executeSQMChange(
    config: OpenWRTSSHConfig,
    change: PendingChange,
    proposed: Record<string, unknown>
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const commands: string[] = [];
    const iface = String(proposed.interface || change.targetId?.split("_").pop());

    if (change.operation === "create" || change.operation === "update") {
      commands.push(`uci set sqm.${iface}=queue`);
      commands.push(`uci set sqm.${iface}.interface='${iface}'`);
      if (proposed.download) commands.push(`uci set sqm.${iface}.download='${proposed.download}'`);
      if (proposed.upload) commands.push(`uci set sqm.${iface}.upload='${proposed.upload}'`);
      if (proposed.qdisc) commands.push(`uci set sqm.${iface}.qdisc='${proposed.qdisc}'`);
      if (proposed.script) commands.push(`uci set sqm.${iface}.script='${proposed.script}'`);
      if (proposed.enabled !== undefined) {
        commands.push(`uci set sqm.${iface}.enabled='${proposed.enabled ? 1 : 0}'`);
      }
    } else if (change.operation === "delete") {
      commands.push(`uci delete sqm.${iface}`);
    }

    commands.push("uci commit sqm");
    commands.push("/etc/init.d/sqm restart");

    return this.executeCommandBatch(config, commands);
  }

  /**
   * Execute backup operations
   */
  private async executeBackupChange(
    config: OpenWRTSSHConfig,
    change: PendingChange,
    proposed: Record<string, unknown>
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    if (change.operation === "create") {
      return this.executeCommand(config, BackupCommands.createBackup);
    } else if (change.operation === "restore") {
      const path = String(proposed.path);
      return this.executeCommand(config, BackupCommands.restoreBackup(path), 120000);
    } else if (change.operation === "reboot") {
      return this.executeCommand(config, "reboot");
    }

    return { success: false, error: `Unknown backup operation: ${change.operation}` };
  }

  /**
   * Execute a single command
   */
  private async executeCommand(
    config: OpenWRTSSHConfig,
    command: string,
    timeout = 30000
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const result = await execOpenWRT(config, command, timeout);

    if (result.code === 0) {
      return { success: true, output: result.stdout };
    } else {
      return { success: false, error: result.stderr || `Command failed with code ${result.code}` };
    }
  }

  /**
   * Execute a batch of commands
   */
  private async executeCommandBatch(
    config: OpenWRTSSHConfig,
    commands: string[],
    timeout = 30000
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    if (commands.length === 0) {
      return { success: true, output: "No commands to execute" };
    }

    const results = await execOpenWRTBatch(config, commands, timeout);
    const outputs: string[] = [];
    let failed = false;
    let errorMsg = "";

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      outputs.push(`[${commands[i]}]: ${r.stdout || "(no output)"}`);

      if (r.code !== 0) {
        failed = true;
        errorMsg = `Command failed: ${commands[i]}\n${r.stderr}`;
        break;
      }
    }

    if (failed) {
      return { success: false, output: outputs.join("\n"), error: errorMsg };
    }

    return { success: true, output: outputs.join("\n") };
  }

  /**
   * Execute all approved changes for a device
   */
  async executeApprovedChanges(deviceId?: string): Promise<ExecutionResult[]> {
    if (this.isProcessing) {
      throw new Error("Already processing changes");
    }

    this.isProcessing = true;
    const results: ExecutionResult[] = [];

    try {
      const changeIds = this.store.getRowIds("pendingChanges");

      for (const changeId of changeIds) {
        const change = this.store.getRow("pendingChanges", changeId) as unknown as PendingChange;

        if (change.status !== "approved") continue;
        if (deviceId && change.deviceId !== deviceId) continue;

        const result = await this.executeChange(changeId);
        results.push(result);
      }
    } finally {
      this.isProcessing = false;
    }

    return results;
  }

  /**
   * Check if engine is processing
   */
  isRunning(): boolean {
    return this.isProcessing;
  }
}
