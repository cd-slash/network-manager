// OpenWRT Firewall Commands
// Commands for firewall zones, rules, and port forwards

export const FirewallCommands = {
  // Firewall Configuration
  getFirewallConfig: `uci show firewall`,
  exportFirewallConfig: `uci export firewall`,

  // Runtime Firewall Rules (nftables)
  getNftRules: `nft list ruleset 2>/dev/null`,
  getNftTables: `nft list tables 2>/dev/null`,
  getIptablesRules: `iptables-save 2>/dev/null`,
  getIp6tablesRules: `ip6tables-save 2>/dev/null`,

  // Zone Management
  listZones: `uci show firewall | grep "=zone"`,
  getZone: (name: string) => `uci show firewall | grep "firewall.${name}"`,

  createZone: (name: string, options: Record<string, string>) => {
    const cmds = [
      `uci add firewall zone`,
      `uci set firewall.@zone[-1].name='${name}'`,
    ];
    for (const [key, val] of Object.entries(options)) {
      cmds.push(`uci set firewall.@zone[-1].${key}='${val}'`);
    }
    return cmds.join(" && ");
  },

  updateZone: (index: number, option: string, value: string) =>
    `uci set firewall.@zone[${index}].${option}='${value}'`,

  deleteZone: (index: number) => `uci delete firewall.@zone[${index}]`,

  // Forwarding (zone to zone)
  listForwardings: `uci show firewall | grep "=forwarding"`,

  createForwarding: (src: string, dest: string) => [
    `uci add firewall forwarding`,
    `uci set firewall.@forwarding[-1].src='${src}'`,
    `uci set firewall.@forwarding[-1].dest='${dest}'`,
  ].join(" && "),

  deleteForwarding: (index: number) => `uci delete firewall.@forwarding[${index}]`,

  // Rule Management
  listRules: `uci show firewall | grep "=rule"`,

  createRule: (options: Record<string, string>) => {
    const cmds = [`uci add firewall rule`];
    for (const [key, val] of Object.entries(options)) {
      cmds.push(`uci set firewall.@rule[-1].${key}='${val}'`);
    }
    return cmds.join(" && ");
  },

  updateRule: (index: number, option: string, value: string) =>
    `uci set firewall.@rule[${index}].${option}='${value}'`,

  deleteRule: (index: number) => `uci delete firewall.@rule[${index}]`,

  // Port Forwards (Redirects)
  listRedirects: `uci show firewall | grep "=redirect"`,

  createRedirect: (options: Record<string, string>) => {
    const cmds = [`uci add firewall redirect`];
    for (const [key, val] of Object.entries(options)) {
      cmds.push(`uci set firewall.@redirect[-1].${key}='${val}'`);
    }
    return cmds.join(" && ");
  },

  updateRedirect: (index: number, option: string, value: string) =>
    `uci set firewall.@redirect[${index}].${option}='${value}'`,

  deleteRedirect: (index: number) => `uci delete firewall.@redirect[${index}]`,

  // NAT Rules
  listNatRules: `uci show firewall | grep "=nat"`,

  // Includes (custom rules)
  listIncludes: `uci show firewall | grep "=include"`,

  // Commit and Reload
  commitFirewall: `uci commit firewall`,
  reloadFirewall: `/etc/init.d/firewall reload`,
  restartFirewall: `/etc/init.d/firewall restart`,

  // Connection Tracking
  getConntrackTable: `cat /proc/net/nf_conntrack 2>/dev/null | head -100`,
  getConntrackStats: `cat /proc/sys/net/netfilter/nf_conntrack_count; cat /proc/sys/net/netfilter/nf_conntrack_max`,

  // Custom Rules File
  getCustomRules: `cat /etc/firewall.user 2>/dev/null`,
};

/**
 * Parse firewall zones from UCI show output
 */
export function parseFirewallZones(output: string): Array<{
  index: number;
  name: string;
  input: string;
  output: string;
  forward: string;
  masq: boolean;
  mtuFix: boolean;
  network: string[];
}> {
  const zones: Array<{
    index: number;
    name: string;
    input: string;
    output: string;
    forward: string;
    masq: boolean;
    mtuFix: boolean;
    network: string[];
  }> = [];

  const zoneBlocks = new Map<number, Record<string, string | string[]>>();

  for (const line of output.split("\n")) {
    const zoneMatch = line.match(/firewall\.@zone\[(\d+)\]\.(\w+)='?([^']*)'?/);
    if (zoneMatch) {
      const index = parseInt(zoneMatch[1], 10);
      const key = zoneMatch[2];
      const value = zoneMatch[3];

      if (!zoneBlocks.has(index)) {
        zoneBlocks.set(index, {});
      }

      const block = zoneBlocks.get(index)!;

      if (key === "network") {
        if (!block.network) block.network = [];
        (block.network as string[]).push(value);
      } else {
        block[key] = value;
      }
    }
  }

  for (const [index, block] of zoneBlocks) {
    zones.push({
      index,
      name: (block.name as string) || "",
      input: (block.input as string) || "REJECT",
      output: (block.output as string) || "ACCEPT",
      forward: (block.forward as string) || "REJECT",
      masq: block.masq === "1",
      mtuFix: block.mtu_fix === "1",
      network: (block.network as string[]) || [],
    });
  }

  return zones.sort((a, b) => a.index - b.index);
}

/**
 * Parse firewall rules from UCI show output
 */
export function parseFirewallRules(output: string): Array<{
  index: number;
  name: string;
  src: string;
  srcIp: string;
  srcPort: string;
  dest: string;
  destIp: string;
  destPort: string;
  proto: string;
  target: string;
  enabled: boolean;
}> {
  const rules: Array<{
    index: number;
    name: string;
    src: string;
    srcIp: string;
    srcPort: string;
    dest: string;
    destIp: string;
    destPort: string;
    proto: string;
    target: string;
    enabled: boolean;
  }> = [];

  const ruleBlocks = new Map<number, Record<string, string>>();

  for (const line of output.split("\n")) {
    const ruleMatch = line.match(/firewall\.@rule\[(\d+)\]\.(\w+)='?([^']*)'?/);
    if (ruleMatch) {
      const index = parseInt(ruleMatch[1], 10);
      const key = ruleMatch[2];
      const value = ruleMatch[3];

      if (!ruleBlocks.has(index)) {
        ruleBlocks.set(index, {});
      }
      ruleBlocks.get(index)![key] = value;
    }
  }

  for (const [index, block] of ruleBlocks) {
    rules.push({
      index,
      name: block.name || "",
      src: block.src || "",
      srcIp: block.src_ip || "",
      srcPort: block.src_port || "",
      dest: block.dest || "",
      destIp: block.dest_ip || "",
      destPort: block.dest_port || "",
      proto: block.proto || "all",
      target: block.target || "ACCEPT",
      enabled: block.enabled !== "0",
    });
  }

  return rules.sort((a, b) => a.index - b.index);
}

/**
 * Parse port forwards from UCI show output
 */
export function parsePortForwards(output: string): Array<{
  index: number;
  name: string;
  src: string;
  srcDport: string;
  dest: string;
  destIp: string;
  destPort: string;
  proto: string;
  enabled: boolean;
}> {
  const forwards: Array<{
    index: number;
    name: string;
    src: string;
    srcDport: string;
    dest: string;
    destIp: string;
    destPort: string;
    proto: string;
    enabled: boolean;
  }> = [];

  const blocks = new Map<number, Record<string, string>>();

  for (const line of output.split("\n")) {
    const match = line.match(/firewall\.@redirect\[(\d+)\]\.(\w+)='?([^']*)'?/);
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
    forwards.push({
      index,
      name: block.name || "",
      src: block.src || "wan",
      srcDport: block.src_dport || "",
      dest: block.dest || "lan",
      destIp: block.dest_ip || "",
      destPort: block.dest_port || "",
      proto: block.proto || "tcp udp",
      enabled: block.enabled !== "0",
    });
  }

  return forwards.sort((a, b) => a.index - b.index);
}
