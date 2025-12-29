// OpenWRT SQM (Smart Queue Management) Commands
// Commands for QoS and traffic shaping

export const SQMCommands = {
  // SQM Configuration
  getSQMConfig: `uci show sqm 2>/dev/null`,
  exportSQMConfig: `uci export sqm 2>/dev/null`,

  // Check if SQM is installed
  isInstalled: `opkg status sqm-scripts 2>/dev/null | grep -q "Status: install ok installed" && echo "yes" || echo "no"`,

  // Install SQM packages
  install: `opkg update && opkg install sqm-scripts`,
  installWithLuci: `opkg update && opkg install sqm-scripts luci-app-sqm`,

  // List SQM queues
  listQueues: `uci show sqm | grep "=queue"`,

  // Configure SQM
  createQueue: (
    interface_: string,
    download: number,
    upload: number,
    options?: {
      qdisc?: string;
      script?: string;
      linklayer?: string;
      overhead?: number;
    }
  ) => {
    const name = interface_.replace(/[^a-zA-Z0-9]/g, "_");
    const cmds = [
      `uci set sqm.${name}=queue`,
      `uci set sqm.${name}.interface='${interface_}'`,
      `uci set sqm.${name}.download='${download}'`,
      `uci set sqm.${name}.upload='${upload}'`,
      `uci set sqm.${name}.qdisc='${options?.qdisc || "cake"}'`,
      `uci set sqm.${name}.script='${options?.script || "piece_of_cake.qos"}'`,
      `uci set sqm.${name}.linklayer='${options?.linklayer || "ethernet"}'`,
      `uci set sqm.${name}.overhead='${options?.overhead || 44}'`,
      `uci set sqm.${name}.enabled='1'`,
    ];
    return cmds.join(" && ");
  },

  // Update SQM settings
  setQueueOption: (name: string, option: string, value: string) =>
    `uci set sqm.${name}.${option}='${value}'`,

  // Enable/Disable
  enableQueue: (name: string) => `uci set sqm.${name}.enabled='1'`,
  disableQueue: (name: string) => `uci set sqm.${name}.enabled='0'`,

  // Delete queue
  deleteQueue: (name: string) => `uci delete sqm.${name}`,

  // Commit and Control
  commitSQM: `uci commit sqm`,
  startSQM: `/etc/init.d/sqm start`,
  stopSQM: `/etc/init.d/sqm stop`,
  restartSQM: `/etc/init.d/sqm restart`,
  enableSQMService: `/etc/init.d/sqm enable`,
  disableSQMService: `/etc/init.d/sqm disable`,

  // Status and Stats
  getSQMStatus: `/etc/init.d/sqm status 2>/dev/null; echo "---"; tc -s qdisc show`,
  getQdiscStats: (interface_: string) => `tc -s qdisc show dev ${interface_}`,
  getClassStats: (interface_: string) => `tc -s class show dev ${interface_}`,
  getFilterStats: (interface_: string) => `tc -s filter show dev ${interface_}`,

  // Available scripts
  listScripts: `ls /usr/lib/sqm/*.qos 2>/dev/null | xargs -I {} basename {}`,

  // Available qdiscs
  listQdiscs: `tc qdisc help 2>&1 | head -20`,
};

/**
 * Parse SQM configuration from UCI output
 */
export function parseSQMConfig(output: string): Array<{
  name: string;
  interface: string;
  enabled: boolean;
  download: number;
  upload: number;
  qdisc: string;
  script: string;
  linklayer: string;
  overhead: number;
  linklayerAdaptationMechanism: string;
}> {
  const queues: Array<{
    name: string;
    interface: string;
    enabled: boolean;
    download: number;
    upload: number;
    qdisc: string;
    script: string;
    linklayer: string;
    overhead: number;
    linklayerAdaptationMechanism: string;
  }> = [];

  const blocks = new Map<string, Record<string, string>>();

  for (const line of output.split("\n")) {
    // Match sqm.name=queue
    const queueMatch = line.match(/sqm\.(\w+)=queue/);
    if (queueMatch) {
      const name = queueMatch[1];
      if (!blocks.has(name)) {
        blocks.set(name, {});
      }
      continue;
    }

    // Match sqm.name.option=value
    const optMatch = line.match(/sqm\.(\w+)\.(\w+)='?([^']*)'?/);
    if (optMatch) {
      const name = optMatch[1];
      const key = optMatch[2];
      const value = optMatch[3];

      if (!blocks.has(name)) {
        blocks.set(name, {});
      }
      blocks.get(name)![key] = value;
    }
  }

  for (const [name, block] of blocks) {
    queues.push({
      name,
      interface: block.interface || "",
      enabled: block.enabled === "1",
      download: parseInt(block.download, 10) || 0,
      upload: parseInt(block.upload, 10) || 0,
      qdisc: block.qdisc || "cake",
      script: block.script || "piece_of_cake.qos",
      linklayer: block.linklayer || "ethernet",
      overhead: parseInt(block.overhead, 10) || 0,
      linklayerAdaptationMechanism: block.linklayer_adaptation_mechanism || "",
    });
  }

  return queues;
}

/**
 * Parse tc qdisc stats output
 */
export function parseQdiscStats(output: string): Array<{
  qdisc: string;
  handle: string;
  parent: string;
  bytes: number;
  packets: number;
  dropped: number;
  overlimits: number;
  requeues: number;
  backlog: number;
}> {
  const stats: Array<{
    qdisc: string;
    handle: string;
    parent: string;
    bytes: number;
    packets: number;
    dropped: number;
    overlimits: number;
    requeues: number;
    backlog: number;
  }> = [];

  const blocks = output.split(/(?=qdisc)/);

  for (const block of blocks) {
    if (!block.trim().startsWith("qdisc")) continue;

    const stat = {
      qdisc: "",
      handle: "",
      parent: "",
      bytes: 0,
      packets: 0,
      dropped: 0,
      overlimits: 0,
      requeues: 0,
      backlog: 0,
    };

    const headerMatch = block.match(/qdisc\s+(\S+)\s+(\S+)(?:\s+parent\s+(\S+))?/);
    if (headerMatch) {
      stat.qdisc = headerMatch[1];
      stat.handle = headerMatch[2];
      stat.parent = headerMatch[3] || "root";
    }

    const sentMatch = block.match(/Sent\s+(\d+)\s+bytes\s+(\d+)\s+pkt/);
    if (sentMatch) {
      stat.bytes = parseInt(sentMatch[1], 10);
      stat.packets = parseInt(sentMatch[2], 10);
    }

    const droppedMatch = block.match(/dropped\s+(\d+)/);
    if (droppedMatch) stat.dropped = parseInt(droppedMatch[1], 10);

    const overlimitsMatch = block.match(/overlimits\s+(\d+)/);
    if (overlimitsMatch) stat.overlimits = parseInt(overlimitsMatch[1], 10);

    const requeuesMatch = block.match(/requeues\s+(\d+)/);
    if (requeuesMatch) stat.requeues = parseInt(requeuesMatch[1], 10);

    const backlogMatch = block.match(/backlog\s+(\d+)b/);
    if (backlogMatch) stat.backlog = parseInt(backlogMatch[1], 10);

    if (stat.qdisc) {
      stats.push(stat);
    }
  }

  return stats;
}

/**
 * Recommend SQM settings based on connection speed
 */
export function recommendSQMSettings(
  downloadMbps: number,
  uploadMbps: number,
  connectionType: "fiber" | "cable" | "dsl" | "unknown" = "unknown"
): {
  download: number;
  upload: number;
  overhead: number;
  linklayer: string;
  qdisc: string;
} {
  // Use 90-95% of measured speed for headroom
  const headroom = 0.92;

  // Convert Mbps to kbit/s
  const download = Math.floor(downloadMbps * 1000 * headroom);
  const upload = Math.floor(uploadMbps * 1000 * headroom);

  // Determine overhead based on connection type
  let overhead = 44; // Default ethernet
  let linklayer = "ethernet";

  switch (connectionType) {
    case "fiber":
      overhead = 0;
      linklayer = "none";
      break;
    case "cable":
      overhead = 18;
      linklayer = "ethernet";
      break;
    case "dsl":
      overhead = 44;
      linklayer = "atm";
      break;
    default:
      overhead = 44;
      linklayer = "ethernet";
  }

  return {
    download,
    upload,
    overhead,
    linklayer,
    qdisc: "cake", // CAKE is recommended for most setups
  };
}
