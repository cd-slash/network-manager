// OpenWRT Wireless Commands
// Commands for radio and SSID management

export const WirelessCommands = {
  // Wireless Configuration
  getWirelessConfig: `uci show wireless`,
  exportWirelessConfig: `uci export wireless`,

  // Wireless Status
  getWirelessStatus: `ubus call network.wireless status 2>/dev/null`,
  getRadioInfo: `iwinfo`,
  getRadioList: `iw phy`,

  // Channel Information
  getRadioChannels: (radio: string) => `iwinfo ${radio} freqlist`,
  getCurrentChannel: (iface: string) => `iwinfo ${iface} info | grep Channel`,

  // Connected Clients
  getAssocList: `for iface in $(iwinfo 2>/dev/null | grep ESSID | cut -d' ' -f1); do echo "=== $iface ==="; iwinfo $iface assoclist; done`,
  // More detailed station dump with tx/rx bytes
  getStationDumpAll: `for iface in $(iw dev 2>/dev/null | grep Interface | awk '{print $2}'); do echo "=== $iface ==="; iw dev $iface station dump 2>/dev/null; done`,
  getHostapdClients: (iface: string) =>
    `ubus call hostapd.${iface} get_clients '{}' 2>/dev/null`,
  getStationDump: (iface: string) => `iw dev ${iface} station dump`,

  // Site Survey
  scanNetworks: (iface: string) => `iwinfo ${iface} scan`,
  iwScan: (iface: string) => `iw dev ${iface} scan`,

  // Radio Configuration UCI
  setRadioChannel: (radio: string, channel: number) =>
    `uci set wireless.${radio}.channel='${channel}'`,
  setRadioHtmode: (radio: string, htmode: string) =>
    `uci set wireless.${radio}.htmode='${htmode}'`,
  setRadioTxpower: (radio: string, power: number) =>
    `uci set wireless.${radio}.txpower='${power}'`,
  setRadioCountry: (radio: string, country: string) =>
    `uci set wireless.${radio}.country='${country}'`,
  enableRadio: (radio: string) => `uci set wireless.${radio}.disabled='0'`,
  disableRadio: (radio: string) => `uci set wireless.${radio}.disabled='1'`,

  // SSID Configuration
  createSSID: (name: string, options: Record<string, string>) => {
    const cmds = [`uci set wireless.${name}=wifi-iface`];
    for (const [key, val] of Object.entries(options)) {
      cmds.push(`uci set wireless.${name}.${key}='${val}'`);
    }
    return cmds.join(" && ");
  },
  setSSIDOption: (name: string, option: string, value: string) =>
    `uci set wireless.${name}.${option}='${value}'`,
  deleteSSID: (name: string) => `uci delete wireless.${name}`,

  // 802.11r Fast Transition
  enableFastTransition: (ssid: string, mobilityDomain: string) => [
    `uci set wireless.${ssid}.ieee80211r='1'`,
    `uci set wireless.${ssid}.mobility_domain='${mobilityDomain}'`,
    `uci set wireless.${ssid}.ft_psk_generate_local='1'`,
  ].join(" && "),

  // 802.11k/v Roaming
  enable80211kv: (ssid: string) => [
    `uci set wireless.${ssid}.ieee80211k='1'`,
    `uci set wireless.${ssid}.ieee80211v='1'`,
    `uci set wireless.${ssid}.bss_transition='1'`,
  ].join(" && "),

  // Commit and Reload
  commitWireless: `uci commit wireless`,
  reloadWireless: `wifi reload`,
  restartWireless: `wifi`,
  wifiDown: `wifi down`,
  wifiUp: `wifi up`,

  // Hostapd Control
  reloadHostapd: (iface: string) =>
    `ubus call hostapd.${iface} reload '{}' 2>/dev/null`,

  // Wireless Extensions Info
  getIwconfig: (iface: string) => `iwconfig ${iface} 2>/dev/null`,

  // Signal Quality
  getSignalQuality: (iface: string) =>
    `iwinfo ${iface} info | grep -E "(Signal|Noise|Bit Rate)"`,
};

/**
 * Parse iwinfo output for radio interfaces
 */
export function parseIwinfo(output: string): Array<{
  interface: string;
  ssid: string;
  accessPoint: string;
  mode: string;
  channel: number;
  txPower: number;
  signal: number;
  noise: number;
  bitRate: string;
  encryption: string;
}> {
  const interfaces: Array<{
    interface: string;
    ssid: string;
    accessPoint: string;
    mode: string;
    channel: number;
    txPower: number;
    signal: number;
    noise: number;
    bitRate: string;
    encryption: string;
  }> = [];

  const blocks = output.split(/\n(?=\S)/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const lines = block.split("\n");
    const firstLine = lines[0];

    const ifaceMatch = firstLine.match(/^(\S+)\s+ESSID:\s*"([^"]*)"/);
    if (!ifaceMatch) continue;

    const iface = {
      interface: ifaceMatch[1],
      ssid: ifaceMatch[2],
      accessPoint: "",
      mode: "",
      channel: 0,
      txPower: 0,
      signal: 0,
      noise: 0,
      bitRate: "",
      encryption: "",
    };

    for (const line of lines) {
      const apMatch = line.match(/Access Point:\s*(\S+)/);
      if (apMatch) iface.accessPoint = apMatch[1];

      const modeMatch = line.match(/Mode:\s*(\S+)/);
      if (modeMatch) iface.mode = modeMatch[1];

      const channelMatch = line.match(/Channel:\s*(\d+)/);
      if (channelMatch) iface.channel = parseInt(channelMatch[1], 10);

      const txMatch = line.match(/Tx-Power:\s*(\d+)\s*dBm/);
      if (txMatch) iface.txPower = parseInt(txMatch[1], 10);

      const signalMatch = line.match(/Signal:\s*(-?\d+)\s*dBm/);
      if (signalMatch) iface.signal = parseInt(signalMatch[1], 10);

      const noiseMatch = line.match(/Noise:\s*(-?\d+)\s*dBm/);
      if (noiseMatch) iface.noise = parseInt(noiseMatch[1], 10);

      const bitrateMatch = line.match(/Bit Rate:\s*([^\n]+)/);
      if (bitrateMatch) iface.bitRate = bitrateMatch[1].trim();

      const encMatch = line.match(/Encryption:\s*([^\n]+)/);
      if (encMatch) iface.encryption = encMatch[1].trim();
    }

    interfaces.push(iface);
  }

  return interfaces;
}

/**
 * Parse iwinfo assoclist output for connected clients
 * Format:
 *   AA:BB:CC:DD:EE:FF  -65 dBm / -95 dBm (SNR 30)  1000 ms ago
 *           RX: 866.7 MBit/s                                     4095 Pkts.
 *           TX: 866.7 MBit/s                                     1272 Pkts.
 */
export function parseAssocList(output: string): Array<{
  mac: string;
  signal: number;
  noise: number;
  rxRate: number;
  txRate: number;
  rxPackets: number;
  txPackets: number;
}> {
  const clients: Array<{
    mac: string;
    signal: number;
    noise: number;
    rxRate: number;
    txRate: number;
    rxPackets: number;
    txPackets: number;
  }> = [];

  const lines = output.split("\n");
  let currentClient: {
    mac: string;
    signal: number;
    noise: number;
    rxRate: number;
    txRate: number;
    rxPackets: number;
    txPackets: number;
  } | null = null;

  for (const line of lines) {
    // Check for MAC address line (starts with MAC, not indented)
    const macMatch = line.match(/^([0-9A-Fa-f:]{17})/);
    if (macMatch) {
      // Save previous client if exists
      if (currentClient) {
        clients.push(currentClient);
      }

      currentClient = {
        mac: macMatch[1].toUpperCase(),
        signal: 0,
        noise: 0,
        rxRate: 0,
        txRate: 0,
        rxPackets: 0,
        txPackets: 0,
      };

      // Parse signal/noise from same line
      const signalMatch = line.match(/(-?\d+)\s*dBm/);
      if (signalMatch) currentClient.signal = parseInt(signalMatch[1], 10);

      const noiseMatch = line.match(/\/\s*(-?\d+)\s*dBm/);
      if (noiseMatch) currentClient.noise = parseInt(noiseMatch[1], 10);

      continue;
    }

    // Parse RX/TX lines (indented, belong to current client)
    if (currentClient) {
      // RX line: "        RX: 866.7 MBit/s                                     4095 Pkts."
      // Also handle "RX: 866.7 Mbps" or "RX: 866700.0 Kbit/s"
      const rxMatch = line.match(/RX:\s*([\d.]+)\s*(?:MBit|Mbps|Mbit)/i);
      if (rxMatch) {
        currentClient.rxRate = parseFloat(rxMatch[1]);
        const rxPktsMatch = line.match(/([\d]+)\s*Pkts/i);
        if (rxPktsMatch) currentClient.rxPackets = parseInt(rxPktsMatch[1], 10);
      }

      // TX line: "        TX: 866.7 MBit/s                                     1272 Pkts."
      const txMatch = line.match(/TX:\s*([\d.]+)\s*(?:MBit|Mbps|Mbit)/i);
      if (txMatch) {
        currentClient.txRate = parseFloat(txMatch[1]);
        const txPktsMatch = line.match(/([\d]+)\s*Pkts/i);
        if (txPktsMatch) currentClient.txPackets = parseInt(txPktsMatch[1], 10);
      }
    }
  }

  // Don't forget the last client
  if (currentClient) {
    clients.push(currentClient);
  }

  return clients;
}

/**
 * Parse iw station dump output for detailed client info
 */
export function parseStationDump(output: string): Array<{
  mac: string;
  interface: string;
  signal: number;
  txBitrate: number;
  rxBitrate: number;
  txBytes: number;
  rxBytes: number;
  txPackets: number;
  rxPackets: number;
  connectedTime: number;
}> {
  const clients: Array<{
    mac: string;
    interface: string;
    signal: number;
    txBitrate: number;
    rxBitrate: number;
    txBytes: number;
    rxBytes: number;
    txPackets: number;
    rxPackets: number;
    connectedTime: number;
  }> = [];

  let currentInterface = "";
  let currentClient: {
    mac: string;
    interface: string;
    signal: number;
    txBitrate: number;
    rxBitrate: number;
    txBytes: number;
    rxBytes: number;
    txPackets: number;
    rxPackets: number;
    connectedTime: number;
  } | null = null;

  for (const line of output.split("\n")) {
    // Interface header
    if (line.includes("===")) {
      const match = line.match(/===\s*(\S+)\s*===/);
      if (match) {
        currentInterface = match[1];
      }
      continue;
    }

    // New station entry
    const stationMatch = line.match(/^Station\s+([0-9A-Fa-f:]{17})/);
    if (stationMatch) {
      if (currentClient) {
        clients.push(currentClient);
      }
      currentClient = {
        mac: stationMatch[1].toUpperCase(),
        interface: currentInterface,
        signal: 0,
        txBitrate: 0,
        rxBitrate: 0,
        txBytes: 0,
        rxBytes: 0,
        txPackets: 0,
        rxPackets: 0,
        connectedTime: 0,
      };
      continue;
    }

    if (!currentClient) continue;

    // Parse stats - handle various output formats
    // Signal: "signal:" or "signal avg:" followed by dBm value
    const signalMatch = line.match(/signal(?:\s+avg)?:\s*(-?\d+)\s*(?:\[-?\d+\])?\s*dBm/i);
    if (signalMatch) {
      currentClient.signal = parseInt(signalMatch[1], 10);
    }

    // TX bitrate: handle MBit/s, Mbps, or Mbit/s formats
    const txBitrateMatch = line.match(/tx\s+bitrate:\s*([\d.]+)\s*(?:MBit|Mbps|Mbit)/i);
    if (txBitrateMatch) {
      currentClient.txBitrate = parseFloat(txBitrateMatch[1]);
    }

    // RX bitrate: handle MBit/s, Mbps, or Mbit/s formats
    const rxBitrateMatch = line.match(/rx\s+bitrate:\s*([\d.]+)\s*(?:MBit|Mbps|Mbit)/i);
    if (rxBitrateMatch) {
      currentClient.rxBitrate = parseFloat(rxBitrateMatch[1]);
    }

    // TX bytes
    const txBytesMatch = line.match(/tx\s+bytes:\s*(\d+)/i);
    if (txBytesMatch) {
      currentClient.txBytes = parseInt(txBytesMatch[1], 10);
    }

    // RX bytes
    const rxBytesMatch = line.match(/rx\s+bytes:\s*(\d+)/i);
    if (rxBytesMatch) {
      currentClient.rxBytes = parseInt(rxBytesMatch[1], 10);
    }

    // TX packets
    const txPacketsMatch = line.match(/tx\s+packets:\s*(\d+)/i);
    if (txPacketsMatch) {
      currentClient.txPackets = parseInt(txPacketsMatch[1], 10);
    }

    // RX packets
    const rxPacketsMatch = line.match(/rx\s+packets:\s*(\d+)/i);
    if (rxPacketsMatch) {
      currentClient.rxPackets = parseInt(rxPacketsMatch[1], 10);
    }

    // Connected time
    const connectedMatch = line.match(/connected\s+time:\s*(\d+)\s*seconds/i);
    if (connectedMatch) {
      currentClient.connectedTime = parseInt(connectedMatch[1], 10);
    }
  }

  if (currentClient) {
    clients.push(currentClient);
  }

  return clients;
}

/**
 * Parse site survey results
 */
export function parseSiteSurvey(output: string): Array<{
  ssid: string;
  bssid: string;
  channel: number;
  signal: number;
  encryption: string;
  mode: string;
}> {
  const networks: Array<{
    ssid: string;
    bssid: string;
    channel: number;
    signal: number;
    encryption: string;
    mode: string;
  }> = [];

  const blocks = output.split(/Cell \d+/);

  for (const block of blocks) {
    if (!block.trim()) continue;

    const network = {
      ssid: "",
      bssid: "",
      channel: 0,
      signal: 0,
      encryption: "",
      mode: "",
    };

    const ssidMatch = block.match(/ESSID:\s*"([^"]*)"/);
    if (ssidMatch) network.ssid = ssidMatch[1];

    const bssidMatch = block.match(/Address:\s*([0-9A-Fa-f:]{17})/);
    if (bssidMatch) network.bssid = bssidMatch[1].toUpperCase();

    const channelMatch = block.match(/Channel:\s*(\d+)/);
    if (channelMatch) network.channel = parseInt(channelMatch[1], 10);

    const signalMatch = block.match(/Signal:\s*(-?\d+)\s*dBm/);
    if (signalMatch) network.signal = parseInt(signalMatch[1], 10);

    const encMatch = block.match(/Encryption:\s*([^\n]+)/);
    if (encMatch) network.encryption = encMatch[1].trim();

    const modeMatch = block.match(/Mode:\s*(\S+)/);
    if (modeMatch) network.mode = modeMatch[1];

    if (network.bssid) {
      networks.push(network);
    }
  }

  return networks;
}
