// API Client for OpenWRT Manager
// HTTP client for server-side API routes

const API_BASE = "/api";

async function fetchJSON<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

// Device Discovery
export async function discoverDevices(tailnetId: string, apiKey: string, tagFilter?: string) {
  return fetchJSON<{
    discovered: number;
    added: number;
    existing: number;
    devices: Array<{
      id: string;
      hostname: string;
      tailscaleIp: string;
      online: boolean;
    }>;
  }>("/openwrt/discover", {
    method: "POST",
    body: JSON.stringify({ tailnetId, apiKey, tagFilter }),
  });
}

// Device Status
export async function getDeviceStatus(deviceId: string, host: string) {
  return fetchJSON<{
    model: string;
    firmwareVersion: string;
    hostname: string;
    uptime: number;
    loadAvg: number;
    memoryUsed: number;
    memoryTotal: number;
  }>(`/openwrt/devices/${deviceId}/status?host=${encodeURIComponent(host)}`);
}

// Device Refresh
export async function refreshDevice(deviceId: string, host: string) {
  return fetchJSON<{ success: boolean; error?: string }>(
    `/openwrt/devices/${deviceId}/refresh?host=${encodeURIComponent(host)}`,
    { method: "POST" }
  );
}

// Execute raw command
export async function executeCommand(deviceId: string, host: string, command: string) {
  return fetchJSON<{ stdout: string; stderr: string; code: number }>(
    `/openwrt/devices/${deviceId}/execute?host=${encodeURIComponent(host)}`,
    {
      method: "POST",
      body: JSON.stringify({ command }),
    }
  );
}

// Network Interfaces
export async function getNetworkInterfaces(deviceId: string, host: string) {
  return fetchJSON<{
    interfaces: Array<{
      name: string;
      up: boolean;
      proto: string;
      ipv4Address?: string;
      macAddress?: string;
    }>;
  }>(`/openwrt/devices/${deviceId}/network?host=${encodeURIComponent(host)}`);
}

// Wireless Status
export async function getWirelessStatus(deviceId: string, host: string) {
  return fetchJSON<{
    radios: Array<{
      name: string;
      type: string;
      channel: string;
      disabled: boolean;
    }>;
    clients: number;
  }>(`/openwrt/devices/${deviceId}/wireless?host=${encodeURIComponent(host)}`);
}

// Firewall Rules
export async function getFirewallStatus(deviceId: string, host: string) {
  return fetchJSON<{
    zones: number;
    rules: number;
    forwards: number;
  }>(`/openwrt/devices/${deviceId}/firewall?host=${encodeURIComponent(host)}`);
}

// DHCP Leases
export async function getDHCPLeases(deviceId: string, host: string) {
  return fetchJSON<{
    leases: Array<{
      mac: string;
      ip: string;
      hostname: string;
      expiresAt: number;
    }>;
  }>(`/openwrt/devices/${deviceId}/dhcp/leases?host=${encodeURIComponent(host)}`);
}

// Packages
export async function getInstalledPackages(deviceId: string, host: string) {
  return fetchJSON<{
    packages: Array<{
      name: string;
      version: string;
    }>;
    count: number;
  }>(`/openwrt/devices/${deviceId}/packages?host=${encodeURIComponent(host)}`);
}

export async function installPackage(deviceId: string, host: string, packageName: string) {
  return fetchJSON<{ success: boolean; changeId: string }>(
    `/openwrt/devices/${deviceId}/packages`,
    {
      method: "POST",
      body: JSON.stringify({ host, action: "install", packageName }),
    }
  );
}

export async function removePackage(deviceId: string, host: string, packageName: string) {
  return fetchJSON<{ success: boolean; changeId: string }>(
    `/openwrt/devices/${deviceId}/packages`,
    {
      method: "POST",
      body: JSON.stringify({ host, action: "remove", packageName }),
    }
  );
}

// Services
export async function controlService(
  deviceId: string,
  host: string,
  serviceName: string,
  action: "start" | "stop" | "restart" | "enable" | "disable"
) {
  return fetchJSON<{ success: boolean; changeId: string }>(
    `/openwrt/devices/${deviceId}/services/${serviceName}`,
    {
      method: "POST",
      body: JSON.stringify({ host, action }),
    }
  );
}

// System Logs
export async function getSystemLogs(deviceId: string, host: string, lines = 100) {
  return fetchJSON<{ logs: string }>(`/openwrt/devices/${deviceId}/logs?host=${encodeURIComponent(host)}&lines=${lines}`);
}

export async function refreshLogs(deviceId: string, host: string, lines = 100) {
  return fetchJSON<{ success: boolean; count: number }>(
    `/openwrt/devices/${deviceId}/logs/refresh?host=${encodeURIComponent(host)}&lines=${lines}`,
    { method: "POST" }
  );
}

// Backups
export async function listBackups(deviceId: string, host: string) {
  return fetchJSON<{
    backups: Array<{
      filename: string;
      size: number;
      date: string;
      path: string;
    }>;
  }>(`/openwrt/devices/${deviceId}/backups?host=${encodeURIComponent(host)}`);
}

export async function createBackup(deviceId: string, host: string) {
  return fetchJSON<{ success: boolean; path: string }>(
    `/openwrt/devices/${deviceId}/backups`,
    {
      method: "POST",
      body: JSON.stringify({ host }),
    }
  );
}

export async function restoreBackup(deviceId: string, host: string, backupPath: string) {
  return fetchJSON<{ success: boolean; changeId: string }>(
    `/openwrt/devices/${deviceId}/backups/restore`,
    {
      method: "POST",
      body: JSON.stringify({ host, path: backupPath }),
    }
  );
}

// WireGuard
export async function getWireGuardStatus(deviceId: string, host: string) {
  return fetchJSON<{
    installed: boolean;
    interfaces: Record<string, {
      publicKey: string;
      listenPort: number;
      peers: Array<{
        publicKey: string;
        endpoint: string;
        allowedIps: string[];
        latestHandshake: number;
        transferRx: number;
        transferTx: number;
      }>;
    }>;
  }>(`/openwrt/devices/${deviceId}/wireguard/status?host=${encodeURIComponent(host)}`);
}

export async function addWireGuardPeer(
  deviceId: string,
  iface: string,
  peer: {
    publicKey: string;
    presharedKey?: string;
    endpoint?: string;
    allowedIps: string[];
    persistentKeepalive?: number;
  }
) {
  return fetchJSON<{ success: boolean; changeId: string }>(
    `/openwrt/devices/${deviceId}/wireguard/peers`,
    {
      method: "POST",
      body: JSON.stringify({ interface: iface, ...peer }),
    }
  );
}

export async function generateWireGuardKeys() {
  return fetchJSON<{ privateKey: string; publicKey: string }>("/openwrt/wireguard/generate-keys", {
    method: "POST",
  });
}

// OpenVPN
export async function getOpenVPNStatus(deviceId: string, host: string) {
  return fetchJSON<{
    installed: boolean;
    instances: Array<{
      name: string;
      running: boolean;
      pid: number;
    }>;
  }>(`/openwrt/devices/${deviceId}/openvpn/status?host=${encodeURIComponent(host)}`);
}

export async function controlOpenVPN(
  deviceId: string,
  host: string,
  name: string,
  action: "start" | "stop" | "restart"
) {
  return fetchJSON<{ success: boolean; changeId: string }>(
    `/openwrt/devices/${deviceId}/openvpn/${name}/${action}`,
    {
      method: "POST",
      body: JSON.stringify({ host }),
    }
  );
}

// Change Execution
export async function executeChange(changeId: string) {
  return fetchJSON<{
    success: boolean;
    changeId: string;
    output?: string;
    error?: string;
    executedAt: number;
    duration: number;
  }>(`/changes/${changeId}/execute`, { method: "POST" });
}

export async function executeAllApprovedChanges(deviceId?: string) {
  return fetchJSON<{
    success: boolean;
    results: Array<{
      success: boolean;
      changeId: string;
      output?: string;
      error?: string;
    }>;
    executed: number;
    failed: number;
  }>("/changes/execute-all", {
    method: "POST",
    body: JSON.stringify({ deviceId }),
  });
}

// Polling Control
export async function getPollingStatus() {
  return fetchJSON<{
    isRunning: boolean;
    deviceCount: number;
    onlineCount: number;
    lastRefreshTimes: Record<string, number>;
  }>("/polling/status");
}

export async function startPolling() {
  return fetchJSON<{ success: boolean }>("/polling/start", { method: "POST" });
}

export async function stopPolling() {
  return fetchJSON<{ success: boolean }>("/polling/stop", { method: "POST" });
}

export async function pollAllDevices() {
  return fetchJSON<{ success: boolean }>("/polling/poll-all", { method: "POST" });
}

export async function refreshDevicePolling(deviceId: string) {
  return fetchJSON<{ success: boolean }>(`/polling/refresh/${deviceId}`, { method: "POST" });
}

// Debug
export async function getDebugInfo() {
  return fetchJSON<{
    deviceCount: number;
    devices: Record<string, unknown>;
    pendingChanges: number;
    syncStats: { paths?: number; clients?: number };
  }>("/debug/store");
}
