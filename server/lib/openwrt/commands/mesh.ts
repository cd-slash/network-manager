// OpenWRT Mesh Networking Commands
// Commands for 802.11s and batman-adv mesh networks

export const MeshCommands = {
  // Check batman-adv installation
  isBatmanInstalled: `lsmod | grep -q batman && echo "yes" || echo "no"`,
  getBatmanVersion: `cat /sys/module/batman_adv/version 2>/dev/null`,

  // Install batman-adv packages
  installBatman: `opkg update && opkg install kmod-batman-adv batctl-full`,
  installBatmanWithLuci: `opkg update && opkg install kmod-batman-adv batctl-full luci-proto-batman-adv`,

  // Check 802.11s support
  is80211sSupported: `iw phy | grep -q "mesh point" && echo "yes" || echo "no"`,

  // Batman-adv Status Commands
  getBatmanOriginators: `batctl o 2>/dev/null`,
  getBatmanNeighbors: `batctl n 2>/dev/null`,
  getBatmanTranslation: `batctl tl 2>/dev/null`,
  getBatmanGateways: `batctl gwl 2>/dev/null`,
  getBatmanInterfaces: `batctl if 2>/dev/null`,
  getBatmanStats: `batctl s 2>/dev/null`,
  getBatmanRoutingAlgo: `batctl ra 2>/dev/null`,

  // Batman-adv Detailed Info
  getBatmanClaimTable: `batctl cl 2>/dev/null`,
  getBatmanBackboneTable: `batctl bla 2>/dev/null`,
  getBatmanDATCache: `batctl dc 2>/dev/null`,
  getBatmanMulticast: `batctl mcast_flags 2>/dev/null`,

  // 802.11s Status
  getMeshStatus: `iw dev | grep -A 20 "type mesh"`,
  getMeshPeers: (iface: string) => `iw dev ${iface} station dump 2>/dev/null`,
  getMeshPath: (iface: string) => `iw dev ${iface} mpath dump 2>/dev/null`,
  getMeshMPP: (iface: string) => `iw dev ${iface} mpp dump 2>/dev/null`,

  // Configure 802.11s Mesh Interface
  create80211sMesh: (
    radio: string,
    meshId: string,
    channel: number,
    options?: {
      encryption?: string;
      key?: string;
      network?: string;
    }
  ) => {
    const cmds = [
      `uci set wireless.wmesh=wifi-iface`,
      `uci set wireless.wmesh.device='${radio}'`,
      `uci set wireless.wmesh.network='${options?.network || "lan"}'`,
      `uci set wireless.wmesh.mode='mesh'`,
      `uci set wireless.wmesh.mesh_id='${meshId}'`,
      `uci set wireless.wmesh.mesh_fwding='0'`, // Use batman for forwarding
      `uci set wireless.wmesh.encryption='${options?.encryption || "none"}'`,
    ];

    if (options?.key) {
      cmds.push(`uci set wireless.wmesh.key='${options.key}'`);
    }

    cmds.push(`uci set wireless.${radio}.channel='${channel}'`);

    return cmds.join(" && ");
  },

  // Configure batman-adv
  createBatmanInterface: (options?: {
    routingAlgo?: string;
    gwMode?: string;
    gwBandwidth?: string;
  }) => {
    const cmds = [
      `uci set network.bat0=interface`,
      `uci set network.bat0.proto='batadv'`,
      `uci set network.bat0.routing_algo='${options?.routingAlgo || "BATMAN_IV"}'`,
      `uci set network.bat0.gw_mode='${options?.gwMode || "off"}'`,
    ];

    if (options?.gwBandwidth) {
      cmds.push(`uci set network.bat0.gw_bandwidth='${options.gwBandwidth}'`);
    }

    return cmds.join(" && ");
  },

  // Add interface to batman mesh
  addInterfaceToBatman: (iface: string) => [
    `uci set network.${iface}_batadv=interface`,
    `uci set network.${iface}_batadv.proto='batadv_hardif'`,
    `uci set network.${iface}_batadv.master='bat0'`,
    `uci set network.${iface}_batadv.mtu='1536'`,
  ].join(" && "),

  // Configure bridge with batman
  addBatmanToBridge: () => [
    `uci add_list network.@device[0].ports='bat0'`,
  ].join(" && "),

  // Set gateway mode
  setGatewayMode: (mode: "off" | "client" | "server", bandwidth?: string) => {
    const cmds = [`uci set network.bat0.gw_mode='${mode}'`];
    if (bandwidth && mode === "server") {
      cmds.push(`uci set network.bat0.gw_bandwidth='${bandwidth}'`);
    }
    return cmds.join(" && ");
  },

  // Commit and Reload
  commitMesh: `uci commit network && uci commit wireless`,
  reloadMesh: `wifi reload && /etc/init.d/network reload`,

  // Remove mesh configuration
  removeBatman: `uci delete network.bat0 2>/dev/null; uci commit network`,
  removeMeshInterface: `uci delete wireless.wmesh 2>/dev/null; uci commit wireless`,
};

/**
 * Parse batman-adv originators table
 */
export function parseBatmanOriginators(output: string): Array<{
  originator: string;
  lastSeen: string;
  nextHop: string;
  outgoingInterface: string;
  tq: number;
}> {
  const originators: Array<{
    originator: string;
    lastSeen: string;
    nextHop: string;
    outgoingInterface: string;
    tq: number;
  }> = [];

  const lines = output.split("\n").slice(2); // Skip header

  for (const line of lines) {
    // Format: * aa:bb:cc:dd:ee:ff    0.100s   (123) aa:bb:cc:dd:ee:ff [  wlan0]
    const match = line.match(
      /\*?\s*([0-9a-f:]{17})\s+([0-9.]+)s\s+\((\d+)\)\s+([0-9a-f:]{17})\s+\[\s*(\S+)\]/i
    );

    if (match) {
      originators.push({
        originator: match[1].toUpperCase(),
        lastSeen: match[2],
        tq: parseInt(match[3], 10),
        nextHop: match[4].toUpperCase(),
        outgoingInterface: match[5],
      });
    }
  }

  return originators;
}

/**
 * Parse batman-adv neighbors table
 */
export function parseBatmanNeighbors(output: string): Array<{
  neighbor: string;
  lastSeen: string;
  interface: string;
}> {
  const neighbors: Array<{
    neighbor: string;
    lastSeen: string;
    interface: string;
  }> = [];

  const lines = output.split("\n").slice(2); // Skip header

  for (const line of lines) {
    // Format: IF             Neighbor              last-seen
    const match = line.match(/(\S+)\s+([0-9a-f:]{17})\s+([0-9.]+)s/i);

    if (match) {
      neighbors.push({
        interface: match[1],
        neighbor: match[2].toUpperCase(),
        lastSeen: match[3],
      });
    }
  }

  return neighbors;
}

/**
 * Parse batman-adv gateway list
 */
export function parseBatmanGateways(output: string): Array<{
  gateway: string;
  tq: number;
  nexthop: string;
  outgoingInterface: string;
  bandwidth: string;
}> {
  const gateways: Array<{
    gateway: string;
    tq: number;
    nexthop: string;
    outgoingInterface: string;
    bandwidth: string;
  }> = [];

  const lines = output.split("\n").slice(1); // Skip header

  for (const line of lines) {
    const match = line.match(
      /[\*\s]\s*([0-9a-f:]{17})\s+\((\d+)\)\s+([0-9a-f:]{17})\s+\[\s*(\S+)\]:\s*(.*)/i
    );

    if (match) {
      gateways.push({
        gateway: match[1].toUpperCase(),
        tq: parseInt(match[2], 10),
        nexthop: match[3].toUpperCase(),
        outgoingInterface: match[4],
        bandwidth: match[5].trim(),
      });
    }
  }

  return gateways;
}

/**
 * Parse 802.11s mesh peers from iw station dump
 */
export function parseMeshPeers(output: string): Array<{
  mac: string;
  inactiveTime: number;
  rxBytes: number;
  txBytes: number;
  signal: number;
  signalAvg: number;
  meshPlink: string;
}> {
  const peers: Array<{
    mac: string;
    inactiveTime: number;
    rxBytes: number;
    txBytes: number;
    signal: number;
    signalAvg: number;
    meshPlink: string;
  }> = [];

  const blocks = output.split(/Station\s+/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const peer = {
      mac: "",
      inactiveTime: 0,
      rxBytes: 0,
      txBytes: 0,
      signal: 0,
      signalAvg: 0,
      meshPlink: "",
    };

    const macMatch = block.match(/^([0-9a-f:]{17})/i);
    if (macMatch) peer.mac = macMatch[1].toUpperCase();

    const inactiveMatch = block.match(/inactive time:\s+(\d+)/);
    if (inactiveMatch) peer.inactiveTime = parseInt(inactiveMatch[1], 10);

    const rxMatch = block.match(/rx bytes:\s+(\d+)/);
    if (rxMatch) peer.rxBytes = parseInt(rxMatch[1], 10);

    const txMatch = block.match(/tx bytes:\s+(\d+)/);
    if (txMatch) peer.txBytes = parseInt(txMatch[1], 10);

    const signalMatch = block.match(/signal:\s+(-?\d+)/);
    if (signalMatch) peer.signal = parseInt(signalMatch[1], 10);

    const signalAvgMatch = block.match(/signal avg:\s+(-?\d+)/);
    if (signalAvgMatch) peer.signalAvg = parseInt(signalAvgMatch[1], 10);

    const plinkMatch = block.match(/mesh plink:\s+(\S+)/);
    if (plinkMatch) peer.meshPlink = plinkMatch[1];

    if (peer.mac) {
      peers.push(peer);
    }
  }

  return peers;
}

/**
 * Parse mesh path table
 */
export function parseMeshPaths(output: string): Array<{
  destination: string;
  nextHop: string;
  interface: string;
  metric: number;
  sn: number;
  flags: string;
  expTime: number;
}> {
  const paths: Array<{
    destination: string;
    nextHop: string;
    interface: string;
    metric: number;
    sn: number;
    flags: string;
    expTime: number;
  }> = [];

  const lines = output.split("\n");

  for (const line of lines) {
    const match = line.match(
      /([0-9a-f:]{17})\s+([0-9a-f:]{17})\s+(\S+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\d+)/i
    );

    if (match) {
      paths.push({
        destination: match[1].toUpperCase(),
        nextHop: match[2].toUpperCase(),
        interface: match[3],
        metric: parseInt(match[4], 10),
        sn: parseInt(match[5], 10),
        flags: match[6],
        expTime: parseInt(match[7], 10),
      });
    }
  }

  return paths;
}
