// UCI Output Parser
// Parses UCI show/export output into structured objects

export interface UCIValue {
  [key: string]: string | string[] | UCIValue;
}

export interface UCISection {
  type: string;
  name: string;
  values: Record<string, string | string[]>;
}

export interface UCIConfig {
  name: string;
  sections: UCISection[];
}

/**
 * Parse UCI show output into a structured object
 * Input format: config.section.option=value or config.section.option='value'
 */
export function parseUCIShow(output: string): Record<string, UCIValue> {
  const result: Record<string, UCIValue> = {};

  const lines = output.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Parse line: config.section.option=value
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;

    const path = trimmed.substring(0, eqIdx);
    let value = trimmed.substring(eqIdx + 1);

    // Remove quotes if present
    if ((value.startsWith("'") && value.endsWith("'")) ||
        (value.startsWith('"') && value.endsWith('"'))) {
      value = value.slice(1, -1);
    }

    // Split path into parts
    const parts = path.split(".");
    if (parts.length < 2) continue;

    // Build nested structure
    let current: UCIValue = result;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!current[part] || typeof current[part] === "string") {
        // Create object if missing or if it was a string (section type declaration)
        current[part] = {};
      }
      current = current[part] as UCIValue;
    }

    const lastPart = parts[parts.length - 1];

    // If this is a section type declaration (e.g., wireless.radio0=wifi-device)
    // and the target already exists as an object, store as ".type"
    if (parts.length === 2 && typeof current[lastPart] === "object") {
      (current[lastPart] as UCIValue)[".type"] = value;
    } else if (parts.length === 2 && !current[lastPart]) {
      // Section declaration - create object with .type
      current[lastPart] = { ".type": value };
    } else {
      // Regular option assignment
      current[lastPart] = value;
    }
  }

  return result;
}

/**
 * Parse UCI export output into structured configs
 * Input format:
 * config section_type 'section_name'
 *   option name 'value'
 *   list name 'value'
 */
export function parseUCIExport(output: string): UCIConfig[] {
  const configs: UCIConfig[] = [];
  let currentConfig: UCIConfig | null = null;
  let currentSection: UCISection | null = null;

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Check for package declaration
    const packageMatch = trimmed.match(/^package\s+(\S+)/);
    if (packageMatch) {
      if (currentConfig) {
        if (currentSection) {
          currentConfig.sections.push(currentSection);
        }
        configs.push(currentConfig);
      }
      currentConfig = { name: packageMatch[1], sections: [] };
      currentSection = null;
      continue;
    }

    // Check for config section
    const configMatch = trimmed.match(/^config\s+(\S+)(?:\s+'([^']*)'|\s+(\S+))?/);
    if (configMatch) {
      if (currentSection && currentConfig) {
        currentConfig.sections.push(currentSection);
      }
      currentSection = {
        type: configMatch[1],
        name: configMatch[2] || configMatch[3] || "",
        values: {},
      };
      continue;
    }

    if (!currentSection) continue;

    // Check for option
    const optionMatch = trimmed.match(/^option\s+(\S+)\s+'([^']*)'/);
    if (optionMatch) {
      currentSection.values[optionMatch[1]] = optionMatch[2];
      continue;
    }

    // Check for list
    const listMatch = trimmed.match(/^list\s+(\S+)\s+'([^']*)'/);
    if (listMatch) {
      const key = listMatch[1];
      const val = listMatch[2];
      if (!currentSection.values[key]) {
        currentSection.values[key] = [];
      }
      (currentSection.values[key] as string[]).push(val);
    }
  }

  // Add final section and config
  if (currentSection && currentConfig) {
    currentConfig.sections.push(currentSection);
  }
  if (currentConfig) {
    configs.push(currentConfig);
  }

  return configs;
}

/**
 * Generate UCI commands from a diff between old and new values
 */
export function generateUCICommands(
  configName: string,
  sectionName: string,
  oldValues: Record<string, string | string[]>,
  newValues: Record<string, string | string[]>
): string[] {
  const commands: string[] = [];

  // Find changed, added, and removed keys
  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

  for (const key of allKeys) {
    const oldVal = oldValues[key];
    const newVal = newValues[key];

    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) {
      continue; // No change
    }

    const path = `${configName}.${sectionName}.${key}`;

    if (newVal === undefined) {
      // Deleted
      commands.push(`uci delete ${path}`);
    } else if (Array.isArray(newVal)) {
      // List value - delete and re-add
      if (oldVal !== undefined) {
        commands.push(`uci delete ${path}`);
      }
      for (const item of newVal) {
        commands.push(`uci add_list ${path}='${item}'`);
      }
    } else {
      // Simple value
      commands.push(`uci set ${path}='${newVal}'`);
    }
  }

  return commands;
}

/**
 * Convert a flat key-value object to UCI format for a new section
 */
export function generateNewSectionCommands(
  configName: string,
  sectionType: string,
  sectionName: string,
  values: Record<string, string | string[]>
): string[] {
  const commands: string[] = [];

  // Create the section
  if (sectionName) {
    commands.push(`uci set ${configName}.${sectionName}=${sectionType}`);
  } else {
    commands.push(`uci add ${configName} ${sectionType}`);
  }

  // Add all values
  for (const [key, val] of Object.entries(values)) {
    const path = sectionName
      ? `${configName}.${sectionName}.${key}`
      : `${configName}.@${sectionType}[-1].${key}`;

    if (Array.isArray(val)) {
      for (const item of val) {
        commands.push(`uci add_list ${path}='${item}'`);
      }
    } else {
      commands.push(`uci set ${path}='${val}'`);
    }
  }

  return commands;
}

/**
 * Parse wireless interface status from iwinfo output
 */
export function parseIwinfoOutput(output: string): Array<{
  interface: string;
  ssid: string;
  mode: string;
  channel: number;
  signal: number;
  noise: number;
  bitrate: string;
  encryption: string;
}> {
  const interfaces: Array<{
    interface: string;
    ssid: string;
    mode: string;
    channel: number;
    signal: number;
    noise: number;
    bitrate: string;
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
      mode: "",
      channel: 0,
      signal: 0,
      noise: 0,
      bitrate: "",
      encryption: "",
    };

    for (const line of lines) {
      const modeMatch = line.match(/Mode:\s*(\S+)/);
      if (modeMatch) iface.mode = modeMatch[1];

      const channelMatch = line.match(/Channel:\s*(\d+)/);
      if (channelMatch) iface.channel = parseInt(channelMatch[1], 10);

      const signalMatch = line.match(/Signal:\s*(-?\d+)\s*dBm/);
      if (signalMatch) iface.signal = parseInt(signalMatch[1], 10);

      const noiseMatch = line.match(/Noise:\s*(-?\d+)\s*dBm/);
      if (noiseMatch) iface.noise = parseInt(noiseMatch[1], 10);

      const bitrateMatch = line.match(/Bit Rate:\s*([^\n]+)/);
      if (bitrateMatch) iface.bitrate = bitrateMatch[1].trim();

      const encMatch = line.match(/Encryption:\s*([^\n]+)/);
      if (encMatch) iface.encryption = encMatch[1].trim();
    }

    interfaces.push(iface);
  }

  return interfaces;
}

/**
 * Parse DHCP leases file
 */
export function parseDHCPLeases(output: string): Array<{
  timestamp: number;
  mac: string;
  ip: string;
  hostname: string;
  clientId: string;
}> {
  const leases: Array<{
    timestamp: number;
    mac: string;
    ip: string;
    hostname: string;
    clientId: string;
  }> = [];

  for (const line of output.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;

    leases.push({
      timestamp: parseInt(parts[0], 10),
      mac: parts[1],
      ip: parts[2],
      hostname: parts[3] === "*" ? "" : parts[3],
      clientId: parts[4] || "",
    });
  }

  return leases;
}

/**
 * Parse opkg list output
 */
export function parseOpkgList(output: string): Array<{
  name: string;
  version: string;
  description: string;
}> {
  const packages: Array<{
    name: string;
    version: string;
    description: string;
  }> = [];

  for (const line of output.split("\n")) {
    const match = line.match(/^(\S+)\s+-\s+(\S+)\s*-?\s*(.*)?$/);
    if (match) {
      packages.push({
        name: match[1],
        version: match[2],
        description: match[3] || "",
      });
    }
  }

  return packages;
}
