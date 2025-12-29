// OpenWRT Package Management Commands
// Commands for opkg package manager

export const PackageCommands = {
  // Update Package Lists
  update: `opkg update`,

  // List Packages
  listInstalled: `opkg list-installed`,
  listAvailable: `opkg list`,
  listUpgradable: `opkg list-upgradable`,

  // Search Packages
  search: (query: string) => `opkg find "*${query}*"`,
  searchDescription: (query: string) => `opkg list | grep -i "${query}"`,

  // Package Information
  info: (pkg: string) => `opkg info ${pkg}`,
  status: (pkg: string) => `opkg status ${pkg}`,
  files: (pkg: string) => `opkg files ${pkg}`,
  depends: (pkg: string) => `opkg depends ${pkg}`,
  whatDepends: (pkg: string) => `opkg whatdepends ${pkg}`,

  // Install/Remove
  install: (pkg: string) => `opkg install ${pkg}`,
  installForce: (pkg: string) => `opkg install --force-depends ${pkg}`,
  remove: (pkg: string) => `opkg remove ${pkg}`,
  removeAutoremove: (pkg: string) => `opkg remove --autoremove ${pkg}`,
  upgrade: (pkg: string) => `opkg upgrade ${pkg}`,

  // Check Installation Status
  isInstalled: (pkg: string) =>
    `opkg status ${pkg} 2>/dev/null | grep -q "Status: install ok installed" && echo "yes" || echo "no"`,

  // Storage Information
  getFreespace: `df /overlay 2>/dev/null | tail -1 | awk '{print $4}'`,
  getOverlayUsage: `df -h /overlay 2>/dev/null`,

  // Package Configuration
  listConffiles: (pkg: string) => `opkg conffiles ${pkg}`,

  // Destination Information
  listDestinations: `cat /etc/opkg.conf | grep dest`,

  // Feeds
  listFeeds: `cat /etc/opkg/distfeeds.conf 2>/dev/null; cat /etc/opkg/customfeeds.conf 2>/dev/null`,

  // Clean
  clean: `rm -rf /var/opkg-lists/*`,
};

/**
 * Parse installed packages list
 */
export function parseInstalledPackages(output: string): Array<{
  name: string;
  version: string;
}> {
  const packages: Array<{
    name: string;
    version: string;
  }> = [];

  for (const line of output.split("\n")) {
    const match = line.match(/^(\S+)\s+-\s+(\S+)/);
    if (match) {
      packages.push({
        name: match[1],
        version: match[2],
      });
    }
  }

  return packages;
}

/**
 * Parse available packages list
 */
export function parseAvailablePackages(output: string): Array<{
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
    const match = line.match(/^(\S+)\s+-\s+(\S+)\s*(?:-\s*(.*))?$/);
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

/**
 * Parse upgradable packages list
 */
export function parseUpgradablePackages(output: string): Array<{
  name: string;
  currentVersion: string;
  availableVersion: string;
}> {
  const packages: Array<{
    name: string;
    currentVersion: string;
    availableVersion: string;
  }> = [];

  for (const line of output.split("\n")) {
    // Format: package - current_version - available_version
    const match = line.match(/^(\S+)\s+-\s+(\S+)\s+-\s+(\S+)/);
    if (match) {
      packages.push({
        name: match[1],
        currentVersion: match[2],
        availableVersion: match[3],
      });
    }
  }

  return packages;
}

/**
 * Parse package info output
 */
export function parsePackageInfo(output: string): {
  name: string;
  version: string;
  depends: string[];
  size: number;
  section: string;
  architecture: string;
  installedSize: number;
  description: string;
  maintainer: string;
  source: string;
} | null {
  if (!output.trim()) return null;

  const info: {
    name: string;
    version: string;
    depends: string[];
    size: number;
    section: string;
    architecture: string;
    installedSize: number;
    description: string;
    maintainer: string;
    source: string;
  } = {
    name: "",
    version: "",
    depends: [],
    size: 0,
    section: "",
    architecture: "",
    installedSize: 0,
    description: "",
    maintainer: "",
    source: "",
  };

  for (const line of output.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.substring(0, colonIdx).trim().toLowerCase();
    const value = line.substring(colonIdx + 1).trim();

    switch (key) {
      case "package":
        info.name = value;
        break;
      case "version":
        info.version = value;
        break;
      case "depends":
        info.depends = value.split(",").map(s => s.trim());
        break;
      case "size":
        info.size = parseInt(value, 10) || 0;
        break;
      case "section":
        info.section = value;
        break;
      case "architecture":
        info.architecture = value;
        break;
      case "installed-size":
        info.installedSize = parseInt(value, 10) || 0;
        break;
      case "description":
        info.description = value;
        break;
      case "maintainer":
        info.maintainer = value;
        break;
      case "source":
        info.source = value;
        break;
    }
  }

  return info.name ? info : null;
}

/**
 * Parse package status output
 */
export function parsePackageStatus(output: string): {
  installed: boolean;
  version: string;
  status: string;
} {
  const result = {
    installed: false,
    version: "",
    status: "",
  };

  for (const line of output.split("\n")) {
    if (line.startsWith("Version:")) {
      result.version = line.substring(8).trim();
    }
    if (line.startsWith("Status:")) {
      result.status = line.substring(7).trim();
      result.installed = result.status.includes("install ok installed");
    }
  }

  return result;
}
