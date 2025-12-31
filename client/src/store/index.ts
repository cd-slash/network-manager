import { createMergeableStore } from "tinybase";

// OpenWRT Device Status Types
export type DeviceStatus = "online" | "offline" | "unreachable";
export type DeviceRole = "gateway" | "mesh_node" | "access_point" | "switch";
export type MeshProtocol = "batman-adv" | "802.11s" | "";

// Change Queue Types
export type ChangeCategory =
  | "network"
  | "wireless"
  | "firewall"
  | "dhcp"
  | "sqm"
  | "packages"
  | "mesh"
  | "system";
export type ChangeOperation = "create" | "update" | "delete";
export type ChangeImpact = "low" | "medium" | "high" | "critical";
export type ChangeStatus =
  | "pending"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

// Alert Types
export type AlertSeverity = "info" | "warning" | "error" | "critical";

export const createAppStore = () =>
  createMergeableStore().setTablesSchema({
    // Settings
    settings: {
      key: { type: "string" },
      tailnetId: { type: "string", default: "" },
      apiKey: { type: "string", default: "" },
    },

    // OpenWRT Devices
    openwrtDevices: {
      tailscaleId: { type: "string" },
      hostname: { type: "string" },
      tailscaleIp: { type: "string" },
      model: { type: "string", default: "" },
      firmwareVersion: { type: "string", default: "" },
      kernelVersion: { type: "string", default: "" },
      architecture: { type: "string", default: "" },
      uptime: { type: "number", default: 0 },
      memoryTotal: { type: "number", default: 0 },
      memoryFree: { type: "number", default: 0 },
      memoryAvailable: { type: "number", default: 0 },
      loadAvg1m: { type: "number", default: 0 },
      loadAvg5m: { type: "number", default: 0 },
      loadAvg15m: { type: "number", default: 0 },
      role: { type: "string", default: "gateway" },
      meshEnabled: { type: "boolean", default: false },
      meshProtocol: { type: "string", default: "" },
      status: { type: "string", default: "offline" },
      lastSeen: { type: "number", default: 0 },
      lastConfigSync: { type: "number", default: 0 },
      createdAt: { type: "number" },
    },

    // Network Interfaces
    networkInterfaces: {
      deviceId: { type: "string" },
      name: { type: "string" },
      ifname: { type: "string", default: "" },
      proto: { type: "string", default: "static" },
      ipaddr: { type: "string", default: "" },
      netmask: { type: "string", default: "" },
      gateway: { type: "string", default: "" },
      dns: { type: "string", default: "[]" },
      macaddr: { type: "string", default: "" },
      mtu: { type: "number", default: 1500 },
      enabled: { type: "boolean", default: true },
      type: { type: "string", default: "" },
      vid: { type: "number", default: 0 },
      status: { type: "string", default: "up" },
      rxBytes: { type: "number", default: 0 },
      txBytes: { type: "number", default: 0 },
      updatedAt: { type: "number" },
    },

    // Wireless Radios
    wirelessRadios: {
      deviceId: { type: "string" },
      name: { type: "string" },
      type: { type: "string", default: "mac80211" },
      hwmode: { type: "string", default: "" },
      path: { type: "string", default: "" },
      band: { type: "string", default: "" },
      channel: { type: "number", default: 0 },
      htmode: { type: "string", default: "" },
      txpower: { type: "number", default: 0 },
      country: { type: "string", default: "US" },
      disabled: { type: "boolean", default: false },
      updatedAt: { type: "number" },
    },

    // Wireless Networks (SSIDs)
    wirelessNetworks: {
      deviceId: { type: "string" },
      radioName: { type: "string" },
      ssid: { type: "string" },
      mode: { type: "string", default: "ap" },
      encryption: { type: "string", default: "psk2" },
      key: { type: "string", default: "" },
      channel: { type: "number", default: 0 },
      htmode: { type: "string", default: "" },
      txpower: { type: "number", default: 0 },
      band: { type: "string", default: "" },
      hidden: { type: "boolean", default: false },
      isolate: { type: "boolean", default: false },
      wmmEnabled: { type: "boolean", default: true },
      fastTransition: { type: "boolean", default: false },
      network: { type: "string", default: "lan" },
      disabled: { type: "boolean", default: false },
      connectedClients: { type: "number", default: 0 },
      updatedAt: { type: "number" },
    },

    // Wireless Clients
    wirelessClients: {
      deviceId: { type: "string" },
      ssidId: { type: "string" },
      macAddress: { type: "string" },
      hostname: { type: "string", default: "" },
      ipAddress: { type: "string", default: "" },
      signalStrength: { type: "number", default: 0 },
      noiseLevel: { type: "number", default: 0 },
      txRate: { type: "number", default: 0 },
      rxRate: { type: "number", default: 0 },
      connected: { type: "boolean", default: true },
      connectedSince: { type: "number", default: 0 },
      lastSeen: { type: "number" },
      txBytes: { type: "number", default: 0 },
      rxBytes: { type: "number", default: 0 },
    },

    // DHCP Leases
    dhcpLeases: {
      deviceId: { type: "string" },
      macAddress: { type: "string" },
      ipAddress: { type: "string" },
      hostname: { type: "string", default: "" },
      expiresAt: { type: "number" },
      interface: { type: "string", default: "lan" },
      isStatic: { type: "boolean", default: false },
    },

    // Firewall Zones
    firewallZones: {
      deviceId: { type: "string" },
      name: { type: "string" },
      input: { type: "string", default: "ACCEPT" },
      output: { type: "string", default: "ACCEPT" },
      forward: { type: "string", default: "REJECT" },
      masq: { type: "boolean", default: false },
      mtuFix: { type: "boolean", default: false },
      network: { type: "string", default: "[]" },
      family: { type: "string", default: "any" },
    },

    // Firewall Rules
    firewallRules: {
      deviceId: { type: "string" },
      name: { type: "string" },
      src: { type: "string", default: "" },
      srcIp: { type: "string", default: "" },
      srcPort: { type: "string", default: "" },
      dest: { type: "string", default: "" },
      destIp: { type: "string", default: "" },
      destPort: { type: "string", default: "" },
      proto: { type: "string", default: "all" },
      target: { type: "string", default: "ACCEPT" },
      enabled: { type: "boolean", default: true },
      order: { type: "number", default: 0 },
    },

    // Port Forwards
    portForwards: {
      deviceId: { type: "string" },
      name: { type: "string" },
      src: { type: "string", default: "wan" },
      srcDport: { type: "string" },
      dest: { type: "string", default: "lan" },
      destIp: { type: "string" },
      destPort: { type: "string" },
      proto: { type: "string", default: "tcp udp" },
      enabled: { type: "boolean", default: true },
    },

    // QoS/SQM Configuration
    sqmConfig: {
      deviceId: { type: "string" },
      interface: { type: "string" },
      enabled: { type: "boolean", default: false },
      downloadSpeed: { type: "number", default: 0 },
      uploadSpeed: { type: "number", default: 0 },
      qdisc: { type: "string", default: "cake" },
      script: { type: "string", default: "piece_of_cake.qos" },
      linklayer: { type: "string", default: "ethernet" },
      overhead: { type: "number", default: 44 },
    },

    // Installed Packages (detailed)
    installedPackages: {
      deviceId: { type: "string" },
      name: { type: "string" },
      version: { type: "string" },
      size: { type: "number", default: 0 },
      description: { type: "string", default: "" },
      installedTime: { type: "number" },
      autoInstalled: { type: "boolean", default: false },
    },

    // Packages (with upgrade info for UI)
    packages: {
      deviceId: { type: "string" },
      name: { type: "string" },
      version: { type: "string" },
      size: { type: "number", default: 0 },
      description: { type: "string", default: "" },
      installed: { type: "boolean", default: true },
      upgradable: { type: "boolean", default: false },
      newVersion: { type: "string", default: "" },
    },

    // System Services
    systemServices: {
      deviceId: { type: "string" },
      name: { type: "string" },
      enabled: { type: "boolean", default: false },
      running: { type: "boolean", default: false },
      initScript: { type: "string", default: "" },
    },

    // Mesh Nodes
    meshNodes: {
      deviceId: { type: "string" },
      originatorAddress: { type: "string" },
      lastSeenMsecs: { type: "number", default: 0 },
      nextHop: { type: "string", default: "" },
      outgoingInterface: { type: "string", default: "" },
      tq: { type: "number", default: 0 },
      hopCount: { type: "number", default: 0 },
    },

    // VPN Configurations
    vpnConfigs: {
      deviceId: { type: "string" },
      name: { type: "string" },
      type: { type: "string", default: "wireguard" },
      interface: { type: "string", default: "" },
      enabled: { type: "boolean", default: false },
      listenPort: { type: "number", default: 0 },
      privateKey: { type: "string", default: "" },
      addresses: { type: "string", default: "[]" },
      peers: { type: "string", default: "[]" },
      status: { type: "string", default: "down" },
    },

    // DNS Configuration
    dnsConfig: {
      deviceId: { type: "string" },
      localDomain: { type: "string", default: "" },
      rebindProtection: { type: "boolean", default: true },
      rebindLocalhost: { type: "boolean", default: false },
      expandHosts: { type: "boolean", default: true },
      authoritative: { type: "boolean", default: true },
      readEthers: { type: "boolean", default: true },
      servers: { type: "string", default: "[]" },
      cacheSize: { type: "number", default: 150 },
    },

    // Pending Changes (Approval Queue)
    pendingChanges: {
      id: { type: "string" },
      deviceId: { type: "string" },
      category: { type: "string" },
      operation: { type: "string" },
      targetType: { type: "string" },
      targetId: { type: "string" },
      targetName: { type: "string" },
      previousValue: { type: "string", default: "{}" },
      proposedValue: { type: "string", default: "{}" },
      uciCommands: { type: "string", default: "[]" },
      sshCommands: { type: "string", default: "[]" },
      impact: { type: "string", default: "low" },
      requiresReboot: { type: "boolean", default: false },
      requiresServiceRestart: { type: "string", default: "[]" },
      dependencies: { type: "string", default: "[]" },
      status: { type: "string", default: "pending" },
      createdBy: { type: "string", default: "" },
      createdAt: { type: "number" },
      reviewedBy: { type: "string", default: "" },
      reviewedAt: { type: "number", default: 0 },
      reviewNotes: { type: "string", default: "" },
      executedAt: { type: "number", default: 0 },
      result: { type: "string", default: "" },
      errorMessage: { type: "string", default: "" },
      rollbackCommands: { type: "string", default: "[]" },
    },

    // Change Batches
    changeBatches: {
      id: { type: "string" },
      name: { type: "string" },
      description: { type: "string", default: "" },
      deviceIds: { type: "string", default: "[]" },
      changeIds: { type: "string", default: "[]" },
      status: { type: "string", default: "draft" },
      createdAt: { type: "number" },
      approvedAt: { type: "number", default: 0 },
      executedAt: { type: "number", default: 0 },
    },

    // Execution Logs
    executionLogs: {
      id: { type: "string" },
      changeId: { type: "string" },
      batchId: { type: "string", default: "" },
      deviceId: { type: "string" },
      command: { type: "string" },
      stdout: { type: "string", default: "" },
      stderr: { type: "string", default: "" },
      exitCode: { type: "number", default: 0 },
      executedAt: { type: "number" },
      duration: { type: "number", default: 0 },
    },

    // Configuration Snapshots
    configSnapshots: {
      id: { type: "string" },
      deviceId: { type: "string" },
      snapshotType: { type: "string", default: "full" },
      category: { type: "string", default: "all" },
      config: { type: "string", default: "" },
      description: { type: "string", default: "" },
      createdAt: { type: "number" },
      createdBy: { type: "string", default: "" },
      isAutomatic: { type: "boolean", default: false },
    },

    // Performance Metrics
    performanceMetrics: {
      id: { type: "string" },
      deviceId: { type: "string" },
      timestamp: { type: "number" },
      cpuUsage: { type: "number", default: 0 },
      memoryUsage: { type: "number", default: 0 },
      loadAvg1m: { type: "number", default: 0 },
      wanRxBytes: { type: "number", default: 0 },
      wanTxBytes: { type: "number", default: 0 },
      wanRxRate: { type: "number", default: 0 },
      wanTxRate: { type: "number", default: 0 },
      conntrackCount: { type: "number", default: 0 },
      conntrackMax: { type: "number", default: 0 },
    },

    // Alerts
    alerts: {
      id: { type: "string" },
      deviceId: { type: "string" },
      type: { type: "string" },
      severity: { type: "string", default: "info" },
      title: { type: "string" },
      message: { type: "string" },
      acknowledged: { type: "boolean", default: false },
      acknowledgedBy: { type: "string", default: "" },
      acknowledgedAt: { type: "number", default: 0 },
      createdAt: { type: "number" },
      resolvedAt: { type: "number", default: 0 },
    },

    // Device Command Queue - ensures sequential execution per device
    deviceCommandQueue: {
      id: { type: "string" },
      deviceId: { type: "string" },
      changeId: { type: "string" },
      status: { type: "string", default: "queued" }, // queued, processing, completed, failed
      queuedAt: { type: "number" },
      startedAt: { type: "number", default: 0 },
      completedAt: { type: "number", default: 0 },
      error: { type: "string", default: "" },
    },

    // System Logs
    systemLogs: {
      deviceId: { type: "string" },
      timestamp: { type: "number" },
      facility: { type: "string", default: "daemon" },
      severity: { type: "string", default: "info" },
      hostname: { type: "string", default: "" },
      process: { type: "string", default: "" },
      message: { type: "string", default: "" },
    },
  } as const);

export type AppStore = ReturnType<typeof createAppStore>;
