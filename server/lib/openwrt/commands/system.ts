// OpenWRT System Commands
// Commands for system information, services, logs, and management

export const SystemCommands = {
  // System Information
  getSystemInfo: `cat /etc/openwrt_release 2>/dev/null`,
  getBoardInfo: `cat /tmp/sysinfo/board_name 2>/dev/null`,
  getModelInfo: `cat /tmp/sysinfo/model 2>/dev/null`,
  getKernelVersion: `uname -r`,
  getArchitecture: `uname -m`,
  getHostname: `cat /proc/sys/kernel/hostname`,

  // Uptime and Load
  getUptime: `cat /proc/uptime`,
  getLoadAvg: `cat /proc/loadavg`,

  // Memory Information
  getMemInfo: `cat /proc/meminfo`,
  getMemoryUsage: `free -m`,

  // Storage Information
  getStorageUsage: `df -h`,
  getOverlayUsage: `df /overlay 2>/dev/null | tail -1`,

  // CPU Information
  getCpuInfo: `cat /proc/cpuinfo`,

  // Connection Tracking
  getConntrackCount: `cat /proc/sys/net/netfilter/nf_conntrack_count 2>/dev/null || echo 0`,
  getConntrackMax: `cat /proc/sys/net/netfilter/nf_conntrack_max 2>/dev/null || echo 0`,

  // System Logs
  getLogs: (lines = 100) => `logread -l ${lines}`,
  getKernelLogs: (lines = 100) => `dmesg | tail -${lines}`,
  getLogsJson: () => `logread -e json 2>/dev/null || logread`,

  // Service Management
  listServices: `ls -1 /etc/init.d/ | grep -v -E '^\\.'`,
  getServiceStatus: (service: string) =>
    `/etc/init.d/${service} enabled && echo "enabled" || echo "disabled"; /etc/init.d/${service} running && echo "running" || echo "stopped"`,
  startService: (service: string) => `/etc/init.d/${service} start`,
  stopService: (service: string) => `/etc/init.d/${service} stop`,
  restartService: (service: string) => `/etc/init.d/${service} restart`,
  reloadService: (service: string) => `/etc/init.d/${service} reload`,
  enableService: (service: string) => `/etc/init.d/${service} enable`,
  disableService: (service: string) => `/etc/init.d/${service} disable`,

  // System Control
  reboot: `reboot`,
  shutdown: `poweroff`,

  // Time and Date
  getDate: `date`,
  getTimezone: `uci get system.@system[0].timezone 2>/dev/null`,
  setTimezone: (tz: string) => `uci set system.@system[0].timezone='${tz}' && uci commit system`,

  // LED Configuration
  getLedConfig: `uci show system | grep led`,

  // Button Configuration
  getButtonConfig: `cat /etc/rc.button/* 2>/dev/null`,

  // Cron Jobs
  getCrontab: `crontab -l 2>/dev/null`,

  // Process Information
  getProcessList: `ps w`,
  getTopProcesses: `top -b -n 1 | head -20`,

  // System Configuration
  getSystemConfig: `uci show system`,
  exportSystemConfig: `uci export system`,
};

/**
 * Parse system release info into structured object
 */
export function parseSystemRelease(output: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of output.split("\n")) {
    const match = line.match(/^(\w+)='([^']*)'/);
    if (match) {
      result[match[1]] = match[2];
    }
  }

  return result;
}

/**
 * Parse memory info into structured object
 */
export function parseMemInfo(output: string): Record<string, number> {
  const result: Record<string, number> = {};

  for (const line of output.split("\n")) {
    const match = line.match(/^(\w+):\s+(\d+)/);
    if (match) {
      result[match[1]] = parseInt(match[2], 10) * 1024; // Convert KB to bytes
    }
  }

  return result;
}

/**
 * Parse storage info from df output
 */
export function parseStorageInfo(output: string): Array<{
  filesystem: string;
  size: string;
  used: string;
  available: string;
  usePercent: number;
  mountpoint: string;
}> {
  const lines = output.split("\n").slice(1); // Skip header
  const result: Array<{
    filesystem: string;
    size: string;
    used: string;
    available: string;
    usePercent: number;
    mountpoint: string;
  }> = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 6) {
      result.push({
        filesystem: parts[0],
        size: parts[1],
        used: parts[2],
        available: parts[3],
        usePercent: parseInt(parts[4].replace("%", ""), 10) || 0,
        mountpoint: parts[5],
      });
    }
  }

  return result;
}

/**
 * Parse service list into structured array
 */
export function parseServiceList(output: string): string[] {
  return output
    .split("\n")
    .map(s => s.trim())
    .filter(s => s.length > 0);
}
