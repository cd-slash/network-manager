// OpenWRT Network Commands
// Commands for network interface management

export const NetworkCommands = {
  // Network Configuration
  getNetworkConfig: `uci show network`,
  exportNetworkConfig: `uci export network`,

  // Show all interfaces with status
  showAllInterfaces: `ubus call network.interface dump 2>/dev/null`,

  // Interface Status via ubus
  getInterfaceStatus: `ubus call network.interface dump 2>/dev/null`,
  getInterfaceInfo: (iface: string) =>
    `ubus call network.interface.${iface} status 2>/dev/null`,

  // Physical Interface Stats
  getIfaceStats: `cat /proc/net/dev`,
  getIpAddr: `ip -j addr 2>/dev/null || ip addr`,
  getIpRoute: `ip -j route 2>/dev/null || ip route`,
  getIpNeighbor: `ip -j neighbor 2>/dev/null || ip neighbor`,

  // Interface Control
  ifup: (iface: string) => `ifup ${iface}`,
  ifdown: (iface: string) => `ifdown ${iface}`,
  ifstatus: (iface: string) => `ifstatus ${iface}`,

  // UCI Commands for Network
  createInterface: (name: string, options: Record<string, string>) => {
    const cmds = [`uci set network.${name}=interface`];
    for (const [key, val] of Object.entries(options)) {
      cmds.push(`uci set network.${name}.${key}='${val}'`);
    }
    return cmds.join(" && ");
  },

  setInterfaceOption: (name: string, option: string, value: string) =>
    `uci set network.${name}.${option}='${value}'`,

  deleteInterface: (name: string) => `uci delete network.${name}`,

  // Commit and Restart
  commitNetwork: `uci commit network`,
  restartNetwork: `/etc/init.d/network restart`,
  reloadNetwork: `/etc/init.d/network reload`,

  // Bridge Commands
  getBridgeStatus: `brctl show 2>/dev/null`,
  getBridgeMacs: (bridge: string) => `brctl showmacs ${bridge} 2>/dev/null`,

  // VLAN Commands
  getVlanConfig: `uci show network | grep -E '\\.(vid|vlan|device)='`,
  getSwitchConfig: `swconfig list 2>/dev/null && swconfig dev switch0 show 2>/dev/null`,

  // Routing
  getRoutes: `ip route show`,
  getRoutingTable: `cat /proc/net/route`,
  addRoute: (dest: string, gateway: string, iface?: string) => {
    let cmd = `ip route add ${dest} via ${gateway}`;
    if (iface) cmd += ` dev ${iface}`;
    return cmd;
  },
  deleteRoute: (dest: string) => `ip route del ${dest}`,

  // ARP Table
  getArpTable: `cat /proc/net/arp`,

  // DNS Configuration
  getResolv: `cat /etc/resolv.conf`,
  getResolvAuto: `cat /tmp/resolv.conf.auto 2>/dev/null`,

  // Device Configuration (DSA/swconfig)
  getDeviceConfig: `uci show network | grep "=device"`,
  createDevice: (name: string, options: Record<string, string>) => {
    const cmds = [`uci set network.${name}=device`];
    for (const [key, val] of Object.entries(options)) {
      cmds.push(`uci set network.${name}.${key}='${val}'`);
    }
    return cmds.join(" && ");
  },

  // WAN Status
  getWanStatus: `ubus call network.interface.wan status 2>/dev/null`,
  getWan6Status: `ubus call network.interface.wan6 status 2>/dev/null`,

  // PPPoE
  getPPPoEStatus: (iface: string) =>
    `ubus call network.interface.${iface} status 2>/dev/null | jsonfilter -e '@.up' -e '@.data.username'`,
};

/**
 * Parse /proc/net/dev into structured stats
 */
export function parseNetDevStats(output: string): Record<
  string,
  {
    rxBytes: number;
    rxPackets: number;
    rxErrors: number;
    txBytes: number;
    txPackets: number;
    txErrors: number;
  }
> {
  const result: Record<
    string,
    {
      rxBytes: number;
      rxPackets: number;
      rxErrors: number;
      txBytes: number;
      txPackets: number;
      txErrors: number;
    }
  > = {};

  const lines = output.split("\n").slice(2); // Skip headers

  for (const line of lines) {
    const match = line.match(/^\s*(\S+):\s*(\d+)\s+(\d+)\s+(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)\s+(\d+)\s+(\d+)/);
    if (match) {
      result[match[1]] = {
        rxBytes: parseInt(match[2], 10),
        rxPackets: parseInt(match[3], 10),
        rxErrors: parseInt(match[4], 10),
        txBytes: parseInt(match[5], 10),
        txPackets: parseInt(match[6], 10),
        txErrors: parseInt(match[7], 10),
      };
    }
  }

  return result;
}

/**
 * Parse ubus network interface dump
 */
export function parseInterfaceDump(json: string): Array<{
  interface: string;
  up: boolean;
  proto: string;
  device: string;
  ipv4Address?: string;
  ipv4Netmask?: string;
  ipv4Gateway?: string;
  ipv6Addresses?: string[];
  dns?: string[];
  uptime?: number;
}> {
  try {
    const data = JSON.parse(json);
    const interfaces = data.interface || [];

    return interfaces.map((iface: Record<string, unknown>) => {
      const ipv4 = (iface["ipv4-address"] as Array<{ address: string; mask: number }>) || [];
      const ipv6 = (iface["ipv6-address"] as Array<{ address: string }>) || [];
      const routes = (iface.route as Array<{ target: string; nexthop: string }>) || [];
      const dns = (iface["dns-server"] as string[]) || [];

      return {
        interface: iface.interface as string,
        up: iface.up as boolean,
        proto: iface.proto as string,
        device: (iface.device || iface.l3_device) as string,
        ipv4Address: ipv4[0]?.address,
        ipv4Netmask: ipv4[0] ? `/${ipv4[0].mask}` : undefined,
        ipv4Gateway: routes.find(r => r.target === "0.0.0.0")?.nexthop,
        ipv6Addresses: ipv6.map(a => a.address),
        dns,
        uptime: iface.uptime as number,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Parse ARP table
 */
export function parseArpTable(output: string): Array<{
  ip: string;
  hwType: string;
  flags: string;
  mac: string;
  mask: string;
  device: string;
}> {
  const lines = output.split("\n").slice(1); // Skip header
  const result: Array<{
    ip: string;
    hwType: string;
    flags: string;
    mac: string;
    mask: string;
    device: string;
  }> = [];

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 6) {
      result.push({
        ip: parts[0],
        hwType: parts[1],
        flags: parts[2],
        mac: parts[3],
        mask: parts[4],
        device: parts[5],
      });
    }
  }

  return result;
}

/**
 * Parse network interfaces from ubus dump
 */
export function parseNetworkInterfaces(output: string): Array<{
  name: string;
  up: boolean;
  type: string;
  proto: string;
  device: string;
  ipv4Address?: string;
  netmask?: string;
  gateway?: string;
  macAddress?: string;
  rxBytes?: number;
  txBytes?: number;
}> {
  try {
    const data = JSON.parse(output);
    const interfaces = data.interface || [];

    return interfaces.map((iface: Record<string, unknown>) => {
      const ipv4 = (iface["ipv4-address"] as Array<{ address: string; mask: number }>) || [];
      const routes = (iface.route as Array<{ target: string; nexthop: string }>) || [];
      const stats = iface.statistics as { rx_bytes?: number; tx_bytes?: number } | undefined;

      // Calculate netmask from CIDR
      const cidr = ipv4[0]?.mask || 24;
      const netmaskNum = ~((1 << (32 - cidr)) - 1) >>> 0;
      const netmask = [
        (netmaskNum >>> 24) & 255,
        (netmaskNum >>> 16) & 255,
        (netmaskNum >>> 8) & 255,
        netmaskNum & 255,
      ].join(".");

      return {
        name: String(iface.interface || ""),
        up: Boolean(iface.up),
        type: String(iface.proto || "static"),
        proto: String(iface.proto || "static"),
        device: String(iface.device || iface.l3_device || ""),
        ipv4Address: ipv4[0]?.address,
        netmask: ipv4[0] ? netmask : undefined,
        gateway: routes.find(r => r.target === "0.0.0.0")?.nexthop,
        macAddress: iface.macaddr as string | undefined,
        rxBytes: stats?.rx_bytes,
        txBytes: stats?.tx_bytes,
      };
    });
  } catch {
    return [];
  }
}
