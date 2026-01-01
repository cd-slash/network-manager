// OpenWRT Device Service
// High-level service for managing OpenWRT devices via SSH

import { MergeableStore } from "tinybase";
import {
  execOpenWRT,
  execOpenWRTBatch,
  getSystemInfo,
  getResourceUsage,
  pingDevice,
  type OpenWRTSSHConfig,
} from "./ssh-commands";
import { SystemCommands, parseServiceList, parseStorageInfo, parseMemInfo } from "./commands/system";
import { NetworkCommands, parseNetworkInterfaces } from "./commands/network";
import { WirelessCommands, parseAssocList, parseStationDump } from "./commands/wireless";
import { FirewallCommands } from "./commands/firewall";
import { DHCPCommands } from "./commands/dhcp";
import { PackageCommands, parseInstalledPackages, parseAvailablePackages, parseUpgradablePackages } from "./commands/packages";
import { SQMCommands } from "./commands/sqm";
import { MeshCommands } from "./commands/mesh";
import { BackupCommands, parseBackupList, parseReleaseInfo } from "./commands/backup";
import { WireGuardCommands, OpenVPNCommands, parseWireGuardDump, parseOpenVPNStatus } from "./commands/vpn";
import { parseUCIShow } from "./uci-parser";

export interface DeviceConfig {
  id: string;
  host: string;
  port?: number;
  user?: string;
}

export class DeviceService {
  private store: MergeableStore;

  constructor(store: MergeableStore) {
    this.store = store;
  }

  private getSSHConfig(device: DeviceConfig): OpenWRTSSHConfig {
    return {
      host: device.host,
      port: device.port || 22,
      user: device.user || "root",
    };
  }

  /**
   * Check if device is online
   */
  async checkDeviceStatus(device: DeviceConfig): Promise<boolean> {
    const config = this.getSSHConfig(device);
    return pingDevice(config);
  }

  /**
   * Refresh device system information
   */
  async refreshSystemInfo(device: DeviceConfig): Promise<void> {
    const config = this.getSSHConfig(device);

    try {
      const [systemInfo, resources] = await Promise.all([
        getSystemInfo(config),
        getResourceUsage(config),
      ]);

      this.store.setRow("openwrtDevices", device.id, {
        ...this.store.getRow("openwrtDevices", device.id),
        status: "online",
        model: systemInfo.model,
        firmwareVersion: systemInfo.firmwareVersion,
        hostname: systemInfo.hostname,
        uptime: resources.uptime,
        loadAvg: resources.loadAvg1m,
        memoryUsed: resources.memoryTotal - resources.memoryAvailable,
        memoryTotal: resources.memoryTotal,
        lastSeen: Date.now(),
      });
    } catch (error) {
      this.store.setPartialRow("openwrtDevices", device.id, {
        status: "offline",
        lastSeen: Date.now(),
      });
      throw error;
    }
  }

  /**
   * Refresh network interfaces
   */
  async refreshNetworkInterfaces(device: DeviceConfig): Promise<void> {
    const config = this.getSSHConfig(device);

    const result = await execOpenWRT(config, NetworkCommands.showAllInterfaces);
    if (result.code !== 0) {
      throw new Error(`Failed to get interfaces: ${result.stderr}`);
    }

    const interfaces = parseNetworkInterfaces(result.stdout);

    // Build set of new interface IDs
    const newInterfaceIds = new Set<string>();
    for (const iface of interfaces) {
      newInterfaceIds.add(`${device.id}_${iface.name}`);
    }

    // Get existing interface IDs for this device
    const existingIds = this.store.getRowIds("networkInterfaces").filter(
      (id) => (this.store.getRow("networkInterfaces", id) as Record<string, unknown>).deviceId === device.id
    );

    // Use upsert approach: add/update first, then delete only removed ones
    this.store.transaction(() => {
      // Add/update interfaces
      for (const iface of interfaces) {
        const rowId = `${device.id}_${iface.name}`;
        this.store.setRow("networkInterfaces", rowId, {
          deviceId: device.id,
          name: iface.name,
          type: iface.type || "unknown",
          ipAddress: iface.ipv4Address || "",
          netmask: iface.netmask || "",
          macAddress: iface.macAddress || "",
          status: iface.up ? "up" : "down",
          rxBytes: iface.rxBytes || 0,
          txBytes: iface.txBytes || 0,
        });
      }

      // Delete only interfaces that were removed
      for (const id of existingIds) {
        if (!newInterfaceIds.has(id)) {
          this.store.delRow("networkInterfaces", id);
        }
      }
    });
  }

  /**
   * Refresh wireless radios and clients
   */
  async refreshWireless(device: DeviceConfig): Promise<void> {
    const config = this.getSSHConfig(device);

    // Get wireless config and status
    const [configResult, statusResult] = await Promise.all([
      execOpenWRT(config, WirelessCommands.getWirelessConfig),
      execOpenWRT(config, WirelessCommands.getWirelessStatus),
    ]);

    if (configResult.code === 0) {
      const parsedConfig = parseUCIShow(configResult.stdout);
      // UCI show returns nested structure: { wireless: { radio0: {...}, radio1: {...} } }
      const wirelessConfig = (parsedConfig.wireless || {}) as Record<string, unknown>;

      // Process radios and SSIDs
      for (const [key, value] of Object.entries(wirelessConfig)) {
        if (typeof value === "object" && value !== null && ".type" in value && value[".type"] === "wifi-device") {
          const radioId = `${device.id}_${key}`;
          const radioConfig = value as Record<string, unknown>;
          const channelStr = String(radioConfig.channel || "auto");
          const txpowerStr = String(radioConfig.txpower || "auto");
          const radioRow = {
            deviceId: device.id,
            name: key,
            type: String(radioConfig.type || "mac80211"),
            channel: channelStr === "auto" ? 0 : parseInt(channelStr, 10) || 0,
            htmode: String(radioConfig.htmode || ""),
            txpower: txpowerStr === "auto" ? 0 : parseInt(txpowerStr, 10) || 0,
            disabled: radioConfig.disabled === "1",
            band: String(radioConfig.band || ""),
            updatedAt: Date.now(),
          };
          this.store.setRow("wirelessRadios", radioId, radioRow);
        }

        // Process SSIDs
        if (typeof value === "object" && value !== null && ".type" in value && value[".type"] === "wifi-iface") {
          const ssidConfig = value as Record<string, unknown>;
          const ssidId = `${device.id}_${key}`;
          const mode = String(ssidConfig.mode || "ap");
          // For mesh networks, use mesh_id as the ssid name if ssid is empty
          const ssidName = String(ssidConfig.ssid || "");
          const meshId = String(ssidConfig.mesh_id || "");
          const ssidRow = {
            deviceId: device.id,
            radioName: String(ssidConfig.device || ""),
            ssid: ssidName || (mode === "mesh" ? meshId : ""),
            mode: mode,
            encryption: String(ssidConfig.encryption || "none"),
            network: String(ssidConfig.network || ""),
            disabled: ssidConfig.disabled === "1",
            hidden: ssidConfig.hidden === "1",
            isolate: ssidConfig.isolate === "1",
            updatedAt: Date.now(),
          };
          this.store.setRow("wirelessNetworks", ssidId, ssidRow);
        }
      }
    }

    // Build interface-to-SSID mapping from wireless status
    // The status JSON contains: { radio0: { interfaces: [{ ifname: "phy0-ap0", section: "default_radio0" }] } }
    const interfaceToSsidSection = new Map<string, string>();
    if (statusResult.code === 0) {
      try {
        const status = JSON.parse(statusResult.stdout);
        for (const [_radioName, radioData] of Object.entries(status)) {
          const radio = radioData as { interfaces?: Array<{ ifname?: string; section?: string }> };
          if (radio.interfaces) {
            for (const iface of radio.interfaces) {
              if (iface.ifname && iface.section) {
                interfaceToSsidSection.set(iface.ifname, `${device.id}_${iface.section}`);
              }
            }
          }
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    // Get associated clients with detailed info from multiple sources
    const [clientsResult, stationDumpResult] = await Promise.all([
      execOpenWRT(config, WirelessCommands.getAssocList),
      execOpenWRT(config, WirelessCommands.getStationDumpAll),
    ]);

    // Parse station dump for detailed traffic stats
    const stationStats = new Map<string, {
      txBytes: number;
      rxBytes: number;
      txBitrate: number;
      rxBitrate: number;
      connectedTime: number;
    }>();
    if (stationDumpResult.code === 0) {
      const stations = parseStationDump(stationDumpResult.stdout);
      for (const station of stations) {
        stationStats.set(station.mac, {
          txBytes: station.txBytes,
          rxBytes: station.rxBytes,
          txBitrate: station.txBitrate,
          rxBitrate: station.rxBitrate,
          connectedTime: station.connectedTime,
        });
      }
    }

    // Get DHCP leases for hostname lookup
    const dhcpResult = await execOpenWRT(config, DHCPCommands.getLeases);
    const dhcpLeases = new Map<string, { hostname: string; ip: string }>();
    if (dhcpResult.code === 0) {
      for (const line of dhcpResult.stdout.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const mac = parts[1].toUpperCase();
          dhcpLeases.set(mac, {
            ip: parts[2],
            hostname: parts[3] !== "*" ? parts[3] : "",
          });
        }
      }
    }

    // Get ARP table for additional IP lookups
    const arpResult = await execOpenWRT(config, "cat /proc/net/arp | tail -n +2");
    const arpTable = new Map<string, string>();
    if (arpResult.code === 0) {
      for (const line of arpResult.stdout.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const ip = parts[0];
          const mac = parts[3].toUpperCase();
          if (mac && mac !== "00:00:00:00:00:00") {
            arpTable.set(mac, ip);
          }
        }
      }
    }

    if (clientsResult.code === 0) {
      // Split output by interface headers (=== wlan0 ===)
      const interfaceBlocks = clientsResult.stdout.split(/===\s*(\S+)\s*===/).filter(Boolean);

      // Process interface blocks in pairs: [interfaceName, blockContent, interfaceName, blockContent, ...]
      for (let i = 0; i < interfaceBlocks.length - 1; i += 2) {
        const currentInterface = interfaceBlocks[i].trim();
        const blockContent = interfaceBlocks[i + 1] || "";

        // Find the SSID ID for this interface using the mapping we built
        const currentSsidId = interfaceToSsidSection.get(currentInterface) || "";

        // Parse all clients in this interface block at once
        const clients = parseAssocList(blockContent);
        for (const client of clients) {
          const clientId = `${device.id}_${client.mac.replace(/:/g, "")}`;

          // Look up hostname and IP from DHCP leases or ARP table
          const dhcpInfo = dhcpLeases.get(client.mac);
          const arpIp = arpTable.get(client.mac);

          const hostname = dhcpInfo?.hostname || "";
          const ipAddress = dhcpInfo?.ip || arpIp || "";

          // Get additional stats from station dump
          const stats = stationStats.get(client.mac);
          const txBytes = stats?.txBytes || 0;
          const rxBytes = stats?.rxBytes || 0;
          // Prefer station dump rates if available, fall back to assoclist rates
          const txRate = stats?.txBitrate || client.txRate || 0;
          const rxRate = stats?.rxBitrate || client.rxRate || 0;
          const connectedTime = stats?.connectedTime || 0;
          // Calculate connectedSince from connectedTime
          const connectedSince = connectedTime > 0
            ? Date.now() - (connectedTime * 1000)
            : Date.now();

          this.store.setRow("wirelessClients", clientId, {
            deviceId: device.id,
            ssidId: currentSsidId,
            macAddress: client.mac,
            hostname: hostname,
            ipAddress: ipAddress,
            signalStrength: client.signal,
            noiseLevel: client.noise || -95,
            txRate: txRate,
            rxRate: rxRate,
            connected: true,
            connectedSince: connectedSince,
            lastSeen: Date.now(),
            txBytes: txBytes,
            rxBytes: rxBytes,
          });
        }
      }
    }
  }

  /**
   * Refresh firewall configuration
   */
  async refreshFirewall(device: DeviceConfig): Promise<void> {
    const config = this.getSSHConfig(device);

    const result = await execOpenWRT(config, FirewallCommands.getFirewallConfig);
    if (result.code !== 0) {
      throw new Error(`Failed to get firewall config: ${result.stderr}`);
    }

    const fwConfig = parseUCIShow(result.stdout);

    // Process zones
    for (const [key, value] of Object.entries(fwConfig)) {
      if (typeof value === "object" && value !== null && ".type" in value) {
        const config = value as Record<string, unknown>;

        if (config[".type"] === "zone") {
          const zoneId = `${device.id}_${key}`;
          this.store.setRow("firewallZones", zoneId, {
            deviceId: device.id,
            name: String(config.name || key),
            input: String(config.input || "ACCEPT"),
            output: String(config.output || "ACCEPT"),
            forward: String(config.forward || "REJECT"),
            masq: config.masq === "1",
            network: Array.isArray(config.network) ? config.network.join(" ") : String(config.network || ""),
          });
        }

        if (config[".type"] === "rule") {
          const ruleId = `${device.id}_${key}`;
          this.store.setRow("firewallRules", ruleId, {
            deviceId: device.id,
            name: String(config.name || ""),
            src: String(config.src || "*"),
            dest: String(config.dest || "*"),
            proto: String(config.proto || "any"),
            src_port: String(config.src_port || ""),
            dest_port: String(config.dest_port || ""),
            target: String(config.target || "ACCEPT"),
            enabled: config.enabled !== "0",
          });
        }

        if (config[".type"] === "redirect") {
          const forwardId = `${device.id}_${key}`;
          this.store.setRow("portForwards", forwardId, {
            deviceId: device.id,
            name: String(config.name || ""),
            src: String(config.src || "wan"),
            src_dport: String(config.src_dport || ""),
            dest: String(config.dest || "lan"),
            dest_ip: String(config.dest_ip || ""),
            dest_port: String(config.dest_port || ""),
            proto: String(config.proto || "tcp"),
            enabled: config.enabled !== "0",
          });
        }
      }
    }
  }

  /**
   * Refresh DHCP leases
   */
  async refreshDHCPLeases(device: DeviceConfig): Promise<void> {
    const config = this.getSSHConfig(device);

    const result = await execOpenWRT(config, DHCPCommands.getLeases);
    if (result.code !== 0) {
      throw new Error(`Failed to get DHCP leases: ${result.stderr}`);
    }

    // Parse DHCP leases file
    // Format: timestamp mac ip hostname clientid
    for (const line of result.stdout.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const leaseId = `${device.id}_${parts[1].replace(/:/g, "")}`;
        this.store.setRow("dhcpLeases", leaseId, {
          deviceId: device.id,
          macAddress: parts[1].toUpperCase(),
          ipAddress: parts[2],
          hostname: parts[3] !== "*" ? parts[3] : "",
          expiresAt: parseInt(parts[0], 10) * 1000,
        });
      }
    }
  }

  /**
   * Refresh installed packages and check for upgrades
   */
  async refreshPackages(device: DeviceConfig): Promise<void> {
    const config = this.getSSHConfig(device);

    // Fetch installed packages
    const installedResult = await execOpenWRT(config, PackageCommands.listInstalled);
    if (installedResult.code !== 0) {
      throw new Error(`Failed to get packages: ${installedResult.stderr}`);
    }

    const installedPackages = parseInstalledPackages(installedResult.stdout);

    // Fetch upgradable packages
    const upgradableResult = await execOpenWRT(config, PackageCommands.listUpgradable);
    const upgradablePackages = upgradableResult.code === 0
      ? parseUpgradablePackages(upgradableResult.stdout)
      : [];

    // Create a map of upgradable packages for quick lookup
    const upgradableMap = new Map<string, string>();
    for (const pkg of upgradablePackages) {
      upgradableMap.set(pkg.name, pkg.availableVersion);
    }

    // Build the set of new package IDs first
    const newPackageIds = new Set<string>();
    for (const pkg of installedPackages) {
      newPackageIds.add(`${device.id}_${pkg.name}`);
    }

    // Get existing package IDs for this device
    const existingInstalledIds = this.store.getRowIds("installedPackages").filter(
      (id) => (this.store.getRow("installedPackages", id) as Record<string, unknown>).deviceId === device.id
    );
    const existingPackageIds = this.store.getRowIds("packages").filter(
      (id) => (this.store.getRow("packages", id) as Record<string, unknown>).deviceId === device.id
    );

    // Use upsert approach: add/update all packages first, then delete only removed ones
    // This prevents the UI from seeing packages disappear and reappear
    this.store.transaction(() => {
      // Add/update packages in both tables
      for (const pkg of installedPackages) {
        const pkgId = `${device.id}_${pkg.name}`;
        const newVersion = upgradableMap.get(pkg.name);
        const isUpgradable = !!newVersion;

        // installedPackages table (legacy, more detailed)
        this.store.setRow("installedPackages", pkgId, {
          deviceId: device.id,
          name: pkg.name,
          version: pkg.version,
          size: 0,
          description: "",
          installed: true,
        });

        // packages table (for UI with upgrade info)
        this.store.setRow("packages", pkgId, {
          deviceId: device.id,
          name: pkg.name,
          version: pkg.version,
          size: 0,
          description: "",
          installed: true,
          upgradable: isUpgradable,
          newVersion: newVersion || "",
        });
      }

      // Delete only packages that were removed (not in the new list)
      for (const id of existingInstalledIds) {
        if (!newPackageIds.has(id)) {
          this.store.delRow("installedPackages", id);
        }
      }
      for (const id of existingPackageIds) {
        if (!newPackageIds.has(id)) {
          this.store.delRow("packages", id);
        }
      }
    });
  }

  /**
   * Refresh system services
   */
  async refreshServices(device: DeviceConfig): Promise<void> {
    const config = this.getSSHConfig(device);

    const result = await execOpenWRT(config, SystemCommands.listServices);
    if (result.code !== 0) {
      throw new Error(`Failed to get services: ${result.stderr}`);
    }

    const services = parseServiceList(result.stdout);

    // Get status for each service
    for (const service of services) {
      const statusResult = await execOpenWRT(config, SystemCommands.getServiceStatus(service));
      const status = statusResult.stdout.trim();

      const serviceId = `${device.id}_${service}`;
      this.store.setRow("systemServices", serviceId, {
        deviceId: device.id,
        name: service,
        enabled: status.includes("enabled"),
        running: status.includes("running"),
      });
    }
  }

  /**
   * Control a service
   */
  async controlService(
    device: DeviceConfig,
    service: string,
    action: "start" | "stop" | "restart" | "enable" | "disable"
  ): Promise<void> {
    const config = this.getSSHConfig(device);

    let command: string;
    switch (action) {
      case "start":
        command = SystemCommands.startService(service);
        break;
      case "stop":
        command = SystemCommands.stopService(service);
        break;
      case "restart":
        command = SystemCommands.restartService(service);
        break;
      case "enable":
        command = SystemCommands.enableService(service);
        break;
      case "disable":
        command = SystemCommands.disableService(service);
        break;
    }

    const result = await execOpenWRT(config, command);
    if (result.code !== 0) {
      throw new Error(`Failed to ${action} service ${service}: ${result.stderr}`);
    }
  }

  /**
   * Install a package
   */
  async installPackage(device: DeviceConfig, packageName: string): Promise<void> {
    const config = this.getSSHConfig(device);

    const result = await execOpenWRTBatch(config, [
      PackageCommands.update,
      PackageCommands.install(packageName),
    ]);

    const lastResult = result[result.length - 1];
    if (lastResult.code !== 0) {
      throw new Error(`Failed to install ${packageName}: ${lastResult.stderr}`);
    }
  }

  /**
   * Remove a package
   */
  async removePackage(device: DeviceConfig, packageName: string): Promise<void> {
    const config = this.getSSHConfig(device);

    const result = await execOpenWRT(config, PackageCommands.remove(packageName));
    if (result.code !== 0) {
      throw new Error(`Failed to remove ${packageName}: ${result.stderr}`);
    }
  }

  /**
   * Get system logs
   */
  async getLogs(device: DeviceConfig, lines = 100): Promise<string> {
    const config = this.getSSHConfig(device);

    const result = await execOpenWRT(config, SystemCommands.getLogs(lines));
    if (result.code !== 0) {
      throw new Error(`Failed to get logs: ${result.stderr}`);
    }

    return result.stdout;
  }

  /**
   * Refresh WireGuard status
   */
  async refreshWireGuard(device: DeviceConfig): Promise<void> {
    const config = this.getSSHConfig(device);

    // Check if WireGuard is installed
    const installedResult = await execOpenWRT(config, WireGuardCommands.isInstalled);
    if (installedResult.stdout.trim() !== "yes") {
      return; // WireGuard not installed
    }

    const result = await execOpenWRT(config, WireGuardCommands.showAllDump);
    if (result.code !== 0) {
      return; // No WireGuard interfaces
    }

    // Parse interfaces
    const lines = result.stdout.trim().split("\n");
    let currentInterface = "";

    for (const line of lines) {
      const parts = line.split("\t");

      // Interface line has 4 parts, peer line has 8
      if (parts.length === 4) {
        currentInterface = parts[0];
        const interfaceId = `${device.id}_${currentInterface}`;
        this.store.setRow("wireguardInterfaces", interfaceId, {
          deviceId: device.id,
          name: currentInterface,
          privateKey: parts[0],
          publicKey: parts[1],
          listenPort: parseInt(parts[2], 10) || 51820,
        });
      } else if (parts.length >= 8 && currentInterface) {
        const peerId = `${device.id}_${currentInterface}_${parts[0].substring(0, 8)}`;
        this.store.setRow("wireguardPeers", peerId, {
          deviceId: device.id,
          interface: currentInterface,
          publicKey: parts[0],
          presharedKey: parts[1] !== "(none)" ? parts[1] : "",
          endpoint: parts[2],
          allowedIps: parts[3],
          latestHandshake: parseInt(parts[4], 10) * 1000,
          transferRx: parseInt(parts[5], 10),
          transferTx: parseInt(parts[6], 10),
          persistentKeepalive: parseInt(parts[7], 10),
        });
      }
    }
  }

  /**
   * Refresh OpenVPN status
   */
  async refreshOpenVPN(device: DeviceConfig): Promise<void> {
    const config = this.getSSHConfig(device);

    // Check if OpenVPN is installed
    const installedResult = await execOpenWRT(config, OpenVPNCommands.isInstalled);
    if (installedResult.stdout.trim() !== "yes") {
      return;
    }

    const statusResult = await execOpenWRT(config, OpenVPNCommands.getStatus);
    if (statusResult.code !== 0) {
      return;
    }

    // Parse instance status
    for (const line of statusResult.stdout.split("\n")) {
      const [name, pid] = line.split(":");
      if (name) {
        const instanceId = `${device.id}_${name}`;
        this.store.setRow("openvpnInstances", instanceId, {
          deviceId: device.id,
          name: name.trim(),
          running: pid && pid.trim().length > 0,
          pid: pid ? parseInt(pid.trim(), 10) : 0,
        });
      }
    }
  }

  /**
   * Create backup
   */
  async createBackup(device: DeviceConfig): Promise<string> {
    const config = this.getSSHConfig(device);

    const result = await execOpenWRT(config, BackupCommands.createBackup);
    if (result.code !== 0) {
      throw new Error(`Failed to create backup: ${result.stderr}`);
    }

    return result.stdout.trim(); // Returns path to backup file
  }

  /**
   * List backups
   */
  async listBackups(device: DeviceConfig): Promise<Array<{
    filename: string;
    size: number;
    date: string;
    path: string;
  }>> {
    const config = this.getSSHConfig(device);

    const result = await execOpenWRT(config, BackupCommands.listBackups);
    if (result.code !== 0) {
      throw new Error(`Failed to list backups: ${result.stderr}`);
    }

    return parseBackupList(result.stdout);
  }

  /**
   * Get firmware info
   */
  async getFirmwareInfo(device: DeviceConfig): Promise<{
    distrib: string;
    release: string;
    revision: string;
    target: string;
    arch: string;
    description: string;
  }> {
    const config = this.getSSHConfig(device);

    const result = await execOpenWRT(config, BackupCommands.getFirmwareInfo);
    if (result.code !== 0) {
      throw new Error(`Failed to get firmware info: ${result.stderr}`);
    }

    return parseReleaseInfo(result.stdout);
  }

  /**
   * Refresh all device data
   * Note: Running sequentially to avoid overwhelming SSH connection limits on routers
   */
  async refreshAll(device: DeviceConfig): Promise<void> {
    await this.refreshSystemInfo(device);
    // Run critical data first
    await this.refreshWireless(device);
    await this.refreshNetworkInterfaces(device);
    await this.refreshFirewall(device);
    await this.refreshDHCPLeases(device);
    // Optional data - don't fail if these error
    try { await this.refreshPackages(device); } catch (e) { console.error("[DeviceService] refreshPackages failed:", e); }
    try { await this.refreshServices(device); } catch (e) { console.error("[DeviceService] refreshServices failed:", e); }
    try { await this.refreshWireGuard(device); } catch (e) { console.error("[DeviceService] refreshWireGuard failed:", e); }
    try { await this.refreshOpenVPN(device); } catch (e) { console.error("[DeviceService] refreshOpenVPN failed:", e); }
  }

  /**
   * Execute raw command (for custom operations)
   */
  async executeCommand(device: DeviceConfig, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
    const config = this.getSSHConfig(device);
    return execOpenWRT(config, command);
  }
}
