// OpenWRT SSH Command Execution Wrapper
import { execSSH, type SSHConfig, type SSHResult } from "../ssh";

export interface OpenWRTDevice {
  id: string;
  hostname: string;
  tailscaleIp: string;
  user?: string;
  port?: number;
}

export interface OpenWRTSSHConfig extends SSHConfig {
  user?: string;
}

/**
 * Execute a command on an OpenWRT device via SSH
 * Default user is 'root' as is standard for OpenWRT
 */
export async function execOpenWRT(
  config: OpenWRTSSHConfig,
  command: string,
  timeout = 30000
): Promise<SSHResult> {
  return execSSH(
    { ...config, user: config.user || "root" },
    command,
    timeout
  );
}

/**
 * Execute multiple commands in sequence on an OpenWRT device
 * Returns results for each command
 */
export async function execOpenWRTBatch(
  config: OpenWRTSSHConfig,
  commands: string[],
  timeout = 30000
): Promise<SSHResult[]> {
  const results: SSHResult[] = [];

  for (const cmd of commands) {
    const result = await execOpenWRT(config, cmd, timeout);
    results.push(result);

    // Stop on first error
    if (result.code !== 0) {
      break;
    }
  }

  return results;
}

/**
 * Execute a UCI command and get the result
 */
export async function execUCI(
  config: OpenWRTSSHConfig,
  uciCommand: string,
  timeout = 30000
): Promise<SSHResult> {
  return execOpenWRT(config, `uci ${uciCommand}`, timeout);
}

/**
 * Execute UCI show and return parsed output
 */
export async function uciShow(
  config: OpenWRTSSHConfig,
  path?: string,
  timeout = 30000
): Promise<SSHResult> {
  const cmd = path ? `uci show ${path}` : "uci show";
  return execOpenWRT(config, cmd, timeout);
}

/**
 * Execute UCI export for a config file
 */
export async function uciExport(
  config: OpenWRTSSHConfig,
  configFile?: string,
  timeout = 30000
): Promise<SSHResult> {
  const cmd = configFile ? `uci export ${configFile}` : "uci export";
  return execOpenWRT(config, cmd, timeout);
}

/**
 * Set a UCI value
 */
export async function uciSet(
  config: OpenWRTSSHConfig,
  path: string,
  value: string,
  timeout = 30000
): Promise<SSHResult> {
  return execOpenWRT(config, `uci set ${path}='${value}'`, timeout);
}

/**
 * Delete a UCI path
 */
export async function uciDelete(
  config: OpenWRTSSHConfig,
  path: string,
  timeout = 30000
): Promise<SSHResult> {
  return execOpenWRT(config, `uci delete ${path}`, timeout);
}

/**
 * Commit UCI changes
 */
export async function uciCommit(
  config: OpenWRTSSHConfig,
  configFile?: string,
  timeout = 30000
): Promise<SSHResult> {
  const cmd = configFile ? `uci commit ${configFile}` : "uci commit";
  return execOpenWRT(config, cmd, timeout);
}

/**
 * Get device system information
 */
export async function getSystemInfo(
  config: OpenWRTSSHConfig,
  timeout = 30000
): Promise<{
  model: string;
  firmwareVersion: string;
  kernelVersion: string;
  architecture: string;
  hostname: string;
}> {
  const result = await execOpenWRT(
    config,
    `cat /etc/openwrt_release 2>/dev/null; echo "---"; uname -r; echo "---"; uname -m; echo "---"; cat /proc/sys/kernel/hostname`,
    timeout
  );

  if (result.code !== 0) {
    throw new Error(`Failed to get system info: ${result.stderr}`);
  }

  const parts = result.stdout.split("---").map(s => s.trim());
  const releaseInfo = parts[0] || "";

  // Parse /etc/openwrt_release
  const getRelValue = (key: string): string => {
    const match = releaseInfo.match(new RegExp(`${key}='([^']*)'`));
    return match ? match[1] : "";
  };

  return {
    model: getRelValue("DISTRIB_TARGET"),
    firmwareVersion: getRelValue("DISTRIB_RELEASE"),
    kernelVersion: parts[1] || "",
    architecture: parts[2] || "",
    hostname: parts[3] || "",
  };
}

/**
 * Get device resource usage (CPU, memory)
 */
export async function getResourceUsage(
  config: OpenWRTSSHConfig,
  timeout = 30000
): Promise<{
  uptime: number;
  loadAvg1m: number;
  loadAvg5m: number;
  loadAvg15m: number;
  memoryTotal: number;
  memoryFree: number;
  memoryAvailable: number;
}> {
  const result = await execOpenWRT(
    config,
    `cat /proc/uptime; echo "---"; cat /proc/loadavg; echo "---"; cat /proc/meminfo | grep -E "^(MemTotal|MemFree|MemAvailable):"`,
    timeout
  );

  if (result.code !== 0) {
    throw new Error(`Failed to get resource usage: ${result.stderr}`);
  }

  const parts = result.stdout.split("---").map(s => s.trim());

  // Parse uptime
  const uptimeParts = (parts[0] || "").split(" ");
  const uptime = parseFloat(uptimeParts[0]) || 0;

  // Parse load average
  const loadParts = (parts[1] || "").split(" ");
  const loadAvg1m = parseFloat(loadParts[0]) || 0;
  const loadAvg5m = parseFloat(loadParts[1]) || 0;
  const loadAvg15m = parseFloat(loadParts[2]) || 0;

  // Parse memory info
  const memInfo = parts[2] || "";
  const getMemValue = (key: string): number => {
    const match = memInfo.match(new RegExp(`${key}:\\s+(\\d+)`));
    return match ? parseInt(match[1], 10) * 1024 : 0; // Convert KB to bytes
  };

  return {
    uptime: Math.floor(uptime),
    loadAvg1m,
    loadAvg5m,
    loadAvg15m,
    memoryTotal: getMemValue("MemTotal"),
    memoryFree: getMemValue("MemFree"),
    memoryAvailable: getMemValue("MemAvailable"),
  };
}

/**
 * Check if device is reachable via SSH
 */
export async function pingDevice(
  config: OpenWRTSSHConfig,
  timeout = 10000
): Promise<boolean> {
  try {
    const result = await execOpenWRT(config, "echo ok", timeout);
    return result.code === 0 && result.stdout.trim() === "ok";
  } catch {
    return false;
  }
}
