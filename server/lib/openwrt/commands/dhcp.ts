// OpenWRT DHCP and DNS Commands
// Commands for DHCP leases and dnsmasq configuration

export const DHCPCommands = {
  // DHCP Configuration
  getDHCPConfig: `uci show dhcp`,
  exportDHCPConfig: `uci export dhcp`,

  // Active DHCP Leases
  getLeases: `cat /tmp/dhcp.leases 2>/dev/null`,
  getLeasesFormatted: `cat /tmp/dhcp.leases 2>/dev/null | awk '{print $2" "$3" "$4" "$1}'`,

  // Static Leases (hosts)
  listStaticLeases: `uci show dhcp | grep "=host"`,

  addStaticLease: (mac: string, ip: string, hostname: string) => [
    `uci add dhcp host`,
    `uci set dhcp.@host[-1].mac='${mac}'`,
    `uci set dhcp.@host[-1].ip='${ip}'`,
    `uci set dhcp.@host[-1].name='${hostname}'`,
  ].join(" && "),

  updateStaticLease: (index: number, option: string, value: string) =>
    `uci set dhcp.@host[${index}].${option}='${value}'`,

  deleteStaticLease: (index: number) => `uci delete dhcp.@host[${index}]`,

  // DHCP Pool Configuration
  getDHCPPool: (interface_: string) => `uci show dhcp.${interface_}`,

  setDHCPPool: (
    interface_: string,
    start: number,
    limit: number,
    leaseTime: string
  ) => [
    `uci set dhcp.${interface_}.start='${start}'`,
    `uci set dhcp.${interface_}.limit='${limit}'`,
    `uci set dhcp.${interface_}.leasetime='${leaseTime}'`,
  ].join(" && "),

  disableDHCP: (interface_: string) =>
    `uci set dhcp.${interface_}.ignore='1'`,

  enableDHCP: (interface_: string) =>
    `uci set dhcp.${interface_}.ignore='0'`,

  // DNS Settings
  getDNSConfig: `uci show dhcp | grep dnsmasq`,

  setDNSServers: (servers: string[]) => {
    const cmds = [`uci delete dhcp.@dnsmasq[0].server 2>/dev/null; true`];
    for (const server of servers) {
      cmds.push(`uci add_list dhcp.@dnsmasq[0].server='${server}'`);
    }
    return cmds.join(" && ");
  },

  setLocalDomain: (domain: string) =>
    `uci set dhcp.@dnsmasq[0].domain='${domain}'`,

  enableDNSRebindProtection: () =>
    `uci set dhcp.@dnsmasq[0].rebind_protection='1'`,

  disableDNSRebindProtection: () =>
    `uci set dhcp.@dnsmasq[0].rebind_protection='0'`,

  // DNS Entries (domain records)
  listDNSEntries: `uci show dhcp | grep "=domain"`,

  addDNSEntry: (name: string, ip: string) => [
    `uci add dhcp domain`,
    `uci set dhcp.@domain[-1].name='${name}'`,
    `uci set dhcp.@domain[-1].ip='${ip}'`,
  ].join(" && "),

  deleteDNSEntry: (index: number) => `uci delete dhcp.@domain[${index}]`,

  // CNAME Records
  addCNAME: (cname: string, target: string) => [
    `uci add dhcp cname`,
    `uci set dhcp.@cname[-1].cname='${cname}'`,
    `uci set dhcp.@cname[-1].target='${target}'`,
  ].join(" && "),

  // Hosts File
  getHostsFile: `cat /etc/hosts`,
  getEthersFile: `cat /etc/ethers 2>/dev/null`,

  // Dnsmasq Status
  getDnsmasqLeaseFile: `cat /tmp/dhcp.leases`,
  restartDnsmasq: `/etc/init.d/dnsmasq restart`,
  reloadDnsmasq: `/etc/init.d/dnsmasq reload`,

  // Commit
  commitDHCP: `uci commit dhcp`,

  // odhcpd (IPv6 DHCP)
  getOdhcpdConfig: `uci show dhcp | grep odhcpd`,
  restartOdhcpd: `/etc/init.d/odhcpd restart 2>/dev/null`,
};

/**
 * Parse DHCP leases file
 */
export function parseDHCPLeases(output: string): Array<{
  expiresAt: number;
  mac: string;
  ip: string;
  hostname: string;
  clientId: string;
}> {
  const leases: Array<{
    expiresAt: number;
    mac: string;
    ip: string;
    hostname: string;
    clientId: string;
  }> = [];

  for (const line of output.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;

    leases.push({
      expiresAt: parseInt(parts[0], 10) * 1000, // Convert to milliseconds
      mac: parts[1].toUpperCase(),
      ip: parts[2],
      hostname: parts[3] === "*" ? "" : parts[3],
      clientId: parts[4] || "",
    });
  }

  return leases;
}

/**
 * Parse static leases from UCI output
 */
export function parseStaticLeases(output: string): Array<{
  index: number;
  mac: string;
  ip: string;
  hostname: string;
  duid: string;
}> {
  const leases: Array<{
    index: number;
    mac: string;
    ip: string;
    hostname: string;
    duid: string;
  }> = [];

  const blocks = new Map<number, Record<string, string>>();

  for (const line of output.split("\n")) {
    const match = line.match(/dhcp\.@host\[(\d+)\]\.(\w+)='?([^']*)'?/);
    if (match) {
      const index = parseInt(match[1], 10);
      const key = match[2];
      const value = match[3];

      if (!blocks.has(index)) {
        blocks.set(index, {});
      }
      blocks.get(index)![key] = value;
    }
  }

  for (const [index, block] of blocks) {
    leases.push({
      index,
      mac: (block.mac || "").toUpperCase(),
      ip: block.ip || "",
      hostname: block.name || "",
      duid: block.duid || "",
    });
  }

  return leases.sort((a, b) => a.index - b.index);
}

/**
 * Parse dnsmasq configuration
 */
export function parseDnsmasqConfig(output: string): {
  domain: string;
  localService: boolean;
  rebindProtection: boolean;
  rebindLocalhost: boolean;
  expandHosts: boolean;
  authoritative: boolean;
  readEthers: boolean;
  servers: string[];
  cacheSize: number;
} {
  const config = {
    domain: "",
    localService: true,
    rebindProtection: true,
    rebindLocalhost: false,
    expandHosts: true,
    authoritative: true,
    readEthers: true,
    servers: [] as string[],
    cacheSize: 150,
  };

  for (const line of output.split("\n")) {
    if (line.includes(".domain=")) {
      const match = line.match(/='([^']*)'/);
      if (match) config.domain = match[1];
    }
    if (line.includes(".localservice=")) {
      config.localService = line.includes("'1'");
    }
    if (line.includes(".rebind_protection=")) {
      config.rebindProtection = line.includes("'1'");
    }
    if (line.includes(".rebind_localhost=")) {
      config.rebindLocalhost = line.includes("'1'");
    }
    if (line.includes(".expandhosts=")) {
      config.expandHosts = line.includes("'1'");
    }
    if (line.includes(".authoritative=")) {
      config.authoritative = line.includes("'1'");
    }
    if (line.includes(".readethers=")) {
      config.readEthers = line.includes("'1'");
    }
    if (line.includes(".server=")) {
      const match = line.match(/='([^']*)'/);
      if (match) config.servers.push(match[1]);
    }
    if (line.includes(".cachesize=")) {
      const match = line.match(/='?(\d+)'?/);
      if (match) config.cacheSize = parseInt(match[1], 10);
    }
  }

  return config;
}
