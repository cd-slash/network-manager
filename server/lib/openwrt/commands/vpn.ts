// OpenWRT VPN Commands
// Commands for WireGuard and OpenVPN management

export const WireGuardCommands = {
  // Check if WireGuard is installed
  isInstalled: `opkg list-installed | grep -q wireguard && echo "yes" || echo "no"`,

  // List WireGuard interfaces
  listInterfaces: `wg show interfaces 2>/dev/null || echo ""`,

  // Get interface status
  showInterface: (iface: string) => `wg show ${iface}`,
  showInterfaceJson: (iface: string) => `wg show ${iface} dump`,

  // Get all WireGuard configuration
  showAll: `wg show all`,
  showAllDump: `wg show all dump`,

  // UCI WireGuard config
  getConfig: `uci show network | grep -E "wireguard|wg"`,
  getInterfaceConfig: (iface: string) => `uci show network.${iface}`,
  getPeers: (iface: string) => `uci show network | grep -E "network\\.@wireguard_${iface}\\[" | cut -d'.' -f2 | cut -d'=' -f1 | sort -u`,

  // Generate keys
  generatePrivateKey: `wg genkey`,
  generatePublicKey: (privateKey: string) => `echo "${privateKey}" | wg pubkey`,
  generatePresharedKey: `wg genpsk`,

  // Create interface
  createInterface: (iface: string, privateKey: string, listenPort: number) => [
    `uci set network.${iface}=interface`,
    `uci set network.${iface}.proto='wireguard'`,
    `uci set network.${iface}.private_key='${privateKey}'`,
    `uci set network.${iface}.listen_port='${listenPort}'`,
  ].join(" && "),

  // Add peer
  addPeer: (iface: string, publicKey: string, allowedIps: string[], endpoint?: string, keepalive?: number) => {
    const cmds = [
      `uci add network wireguard_${iface}`,
      `uci set network.@wireguard_${iface}[-1].public_key='${publicKey}'`,
      `uci set network.@wireguard_${iface}[-1].allowed_ips='${allowedIps.join(" ")}'`,
    ];
    if (endpoint) {
      cmds.push(`uci set network.@wireguard_${iface}[-1].endpoint_host='${endpoint.split(":")[0]}'`);
      cmds.push(`uci set network.@wireguard_${iface}[-1].endpoint_port='${endpoint.split(":")[1] || "51820"}'`);
    }
    if (keepalive) {
      cmds.push(`uci set network.@wireguard_${iface}[-1].persistent_keepalive='${keepalive}'`);
    }
    return cmds.join(" && ");
  },

  // Delete peer
  deletePeer: (iface: string, index: number) => `uci delete network.@wireguard_${iface}[${index}]`,

  // Commit and restart
  commit: `uci commit network && /etc/init.d/network reload`,
  restartInterface: (iface: string) => `ifdown ${iface} && ifup ${iface}`,

  // Get transfer stats
  getTransferStats: (iface: string) => `wg show ${iface} transfer`,

  // Get latest handshakes
  getHandshakes: (iface: string) => `wg show ${iface} latest-handshakes`,

  // Get endpoints
  getEndpoints: (iface: string) => `wg show ${iface} endpoints`,
};

export const OpenVPNCommands = {
  // Check if OpenVPN is installed
  isInstalled: `opkg list-installed | grep -q "^openvpn" && echo "yes" || echo "no"`,

  // List OpenVPN instances
  listInstances: `ls -1 /etc/openvpn/*.conf 2>/dev/null | xargs -I {} basename {} .conf`,

  // Get UCI OpenVPN config
  getConfig: `uci show openvpn`,
  getInstanceConfig: (name: string) => `uci show openvpn.${name}`,

  // Instance management
  start: (name: string) => `/etc/init.d/openvpn start ${name}`,
  stop: (name: string) => `/etc/init.d/openvpn stop ${name}`,
  restart: (name: string) => `/etc/init.d/openvpn restart ${name}`,
  status: (name: string) => `pgrep -f "openvpn.*${name}" && echo "running" || echo "stopped"`,

  // Service management
  enable: `/etc/init.d/openvpn enable`,
  disable: `/etc/init.d/openvpn disable`,

  // Get status of all instances
  getStatus: `for conf in /etc/openvpn/*.conf; do name=$(basename "$conf" .conf); pid=$(pgrep -f "openvpn.*$name"); echo "$name:$pid"; done`,

  // Get connection status (for client mode)
  getConnectionStatus: (name: string) => `cat /var/run/openvpn.${name}.status 2>/dev/null || echo "No status"`,

  // Get management interface info (if enabled)
  getManagementStatus: (port: number) => `echo "status" | nc 127.0.0.1 ${port} 2>/dev/null`,

  // Create client instance
  createClient: (name: string, remote: string, port: number = 1194, proto: string = "udp") => [
    `uci set openvpn.${name}=openvpn`,
    `uci set openvpn.${name}.enabled='1'`,
    `uci set openvpn.${name}.client='1'`,
    `uci set openvpn.${name}.dev='tun'`,
    `uci set openvpn.${name}.proto='${proto}'`,
    `uci set openvpn.${name}.remote='${remote}'`,
    `uci set openvpn.${name}.port='${port}'`,
    `uci set openvpn.${name}.resolv_retry='infinite'`,
    `uci set openvpn.${name}.nobind='1'`,
    `uci set openvpn.${name}.persist_key='1'`,
    `uci set openvpn.${name}.persist_tun='1'`,
  ].join(" && "),

  // Create server instance
  createServer: (name: string, port: number = 1194, proto: string = "udp", subnet: string = "10.8.0.0") => [
    `uci set openvpn.${name}=openvpn`,
    `uci set openvpn.${name}.enabled='1'`,
    `uci set openvpn.${name}.port='${port}'`,
    `uci set openvpn.${name}.proto='${proto}'`,
    `uci set openvpn.${name}.dev='tun'`,
    `uci set openvpn.${name}.server='${subnet} 255.255.255.0'`,
    `uci set openvpn.${name}.keepalive='10 120'`,
    `uci set openvpn.${name}.persist_key='1'`,
    `uci set openvpn.${name}.persist_tun='1'`,
    `uci set openvpn.${name}.verb='3'`,
  ].join(" && "),

  // Set certificates
  setCertificates: (name: string, ca: string, cert: string, key: string) => [
    `cat > /etc/openvpn/${name}_ca.crt << 'CERT'\n${ca}\nCERT`,
    `cat > /etc/openvpn/${name}_cert.crt << 'CERT'\n${cert}\nCERT`,
    `cat > /etc/openvpn/${name}_key.key << 'CERT'\n${key}\nCERT`,
    `uci set openvpn.${name}.ca='/etc/openvpn/${name}_ca.crt'`,
    `uci set openvpn.${name}.cert='/etc/openvpn/${name}_cert.crt'`,
    `uci set openvpn.${name}.key='/etc/openvpn/${name}_key.key'`,
  ].join(" && "),

  // Delete instance
  deleteInstance: (name: string) => [
    `uci delete openvpn.${name}`,
    `rm -f /etc/openvpn/${name}*.crt /etc/openvpn/${name}*.key`,
  ].join(" && "),

  // Import .ovpn file
  importConfig: (name: string, content: string) => `cat > /etc/openvpn/${name}.conf << 'EOF'\n${content}\nEOF`,

  // Commit changes
  commit: `uci commit openvpn && /etc/init.d/openvpn restart`,

  // Get logs
  getLogs: (name: string, lines: number = 50) => `logread | grep -i openvpn | grep -i "${name}" | tail -${lines}`,

  // Check for TUN device
  checkTunDevice: `ls /dev/net/tun 2>/dev/null && echo "yes" || echo "no"`,
  createTunDevice: `mkdir -p /dev/net && mknod /dev/net/tun c 10 200 && chmod 600 /dev/net/tun`,
};

/**
 * Parse WireGuard dump output
 */
export function parseWireGuardDump(output: string): {
  interface: {
    privateKey: string;
    publicKey: string;
    listenPort: number;
    fwmark: string;
  };
  peers: Array<{
    publicKey: string;
    presharedKey: string;
    endpoint: string;
    allowedIps: string[];
    latestHandshake: number;
    transferRx: number;
    transferTx: number;
    persistentKeepalive: number;
  }>;
} {
  const lines = output.trim().split("\n");
  const result = {
    interface: {
      privateKey: "",
      publicKey: "",
      listenPort: 0,
      fwmark: "",
    },
    peers: [] as Array<{
      publicKey: string;
      presharedKey: string;
      endpoint: string;
      allowedIps: string[];
      latestHandshake: number;
      transferRx: number;
      transferTx: number;
      persistentKeepalive: number;
    }>,
  };

  if (lines.length === 0) return result;

  // First line is interface info
  const ifaceParts = lines[0].split("\t");
  if (ifaceParts.length >= 4) {
    result.interface = {
      privateKey: ifaceParts[0],
      publicKey: ifaceParts[1],
      listenPort: parseInt(ifaceParts[2], 10) || 0,
      fwmark: ifaceParts[3],
    };
  }

  // Remaining lines are peers
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split("\t");
    if (parts.length >= 8) {
      result.peers.push({
        publicKey: parts[0],
        presharedKey: parts[1],
        endpoint: parts[2],
        allowedIps: parts[3].split(",").map((ip) => ip.trim()),
        latestHandshake: parseInt(parts[4], 10) * 1000 || 0, // Convert to ms
        transferRx: parseInt(parts[5], 10) || 0,
        transferTx: parseInt(parts[6], 10) || 0,
        persistentKeepalive: parseInt(parts[7], 10) || 0,
      });
    }
  }

  return result;
}

/**
 * Parse OpenVPN status file
 */
export function parseOpenVPNStatus(output: string): {
  version: string;
  updatedAt: number;
  clients: Array<{
    commonName: string;
    realAddress: string;
    virtualAddress: string;
    bytesReceived: number;
    bytesSent: number;
    connectedSince: number;
  }>;
  routing: Array<{
    virtualAddress: string;
    commonName: string;
    realAddress: string;
    lastRef: number;
  }>;
} {
  const result = {
    version: "",
    updatedAt: 0,
    clients: [] as Array<{
      commonName: string;
      realAddress: string;
      virtualAddress: string;
      bytesReceived: number;
      bytesSent: number;
      connectedSince: number;
    }>,
    routing: [] as Array<{
      virtualAddress: string;
      commonName: string;
      realAddress: string;
      lastRef: number;
    }>,
  };

  let section = "";

  for (const line of output.split("\n")) {
    if (line.startsWith("OpenVPN")) {
      result.version = line;
      continue;
    }

    if (line.startsWith("Updated,")) {
      result.updatedAt = new Date(line.split(",")[1]).getTime();
      continue;
    }

    if (line.startsWith("HEADER,CLIENT_LIST")) {
      section = "clients";
      continue;
    }

    if (line.startsWith("HEADER,ROUTING_TABLE")) {
      section = "routing";
      continue;
    }

    if (line.startsWith("CLIENT_LIST,")) {
      const parts = line.split(",");
      if (parts.length >= 8) {
        result.clients.push({
          commonName: parts[1],
          realAddress: parts[2],
          virtualAddress: parts[3],
          bytesReceived: parseInt(parts[4], 10) || 0,
          bytesSent: parseInt(parts[5], 10) || 0,
          connectedSince: new Date(parts[7]).getTime(),
        });
      }
    }

    if (line.startsWith("ROUTING_TABLE,")) {
      const parts = line.split(",");
      if (parts.length >= 5) {
        result.routing.push({
          virtualAddress: parts[1],
          commonName: parts[2],
          realAddress: parts[3],
          lastRef: new Date(parts[4]).getTime(),
        });
      }
    }
  }

  return result;
}
