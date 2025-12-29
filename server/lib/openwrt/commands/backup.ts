// OpenWRT Backup and System Upgrade Commands
// Commands for configuration backup, restore, and firmware upgrade

export const BackupCommands = {
  // Create Backup
  createBackup: `sysupgrade -b /tmp/backup-$(date +%Y%m%d-%H%M%S).tar.gz && ls -1t /tmp/backup-*.tar.gz | head -1`,
  createBackupToPath: (path: string) => `sysupgrade -b ${path}`,

  // List Backups
  listBackups: `ls -la /tmp/backup-*.tar.gz 2>/dev/null || echo ""`,
  listBackupContents: (path: string) => `tar -tzf ${path} 2>/dev/null | head -50`,

  // Download/Upload backup (get path for SCP)
  getBackupPath: `ls -1t /tmp/backup-*.tar.gz 2>/dev/null | head -1`,

  // Export UCI Configuration
  exportAllConfig: `uci export`,
  exportConfig: (config: string) => `uci export ${config}`,

  // Show all UCI changes (uncommitted)
  showChanges: `uci changes`,

  // Revert uncommitted changes
  revertAll: `uci revert`,
  revertConfig: (config: string) => `uci revert ${config}`,

  // Restore Backup
  restoreBackup: (path: string) => `sysupgrade -r ${path}`,

  // Firmware Information
  getFirmwareInfo: `cat /etc/openwrt_release`,
  getBoardInfo: `cat /tmp/sysinfo/board_name 2>/dev/null`,
  getModelInfo: `cat /tmp/sysinfo/model 2>/dev/null`,
  getFlashSize: `cat /proc/mtd 2>/dev/null`,

  // Check for Firmware Upgrade
  getInstalledVersion: `cat /etc/openwrt_version 2>/dev/null || grep DISTRIB_RELEASE /etc/openwrt_release | cut -d"'" -f2`,
  checkUpgradeAvailable: `opkg update >/dev/null 2>&1 && opkg list-upgradable | wc -l`,

  // Firmware Upgrade
  sysupgradePreserve: (imagePath: string) => `sysupgrade ${imagePath}`,
  sysupgradeClean: (imagePath: string) => `sysupgrade -n ${imagePath}`,
  sysupgradeTest: (imagePath: string) => `sysupgrade --test ${imagePath}`,

  // Download Firmware (example)
  downloadFirmware: (url: string) => `cd /tmp && wget -q "${url}" -O firmware.bin && echo "Downloaded to /tmp/firmware.bin"`,

  // Verify Firmware
  verifyFirmware: (path: string) => `sysupgrade --test ${path} 2>&1`,

  // Flash Layout
  getFlashLayout: `cat /proc/mtd`,
  getPartitionInfo: `cat /proc/partitions`,

  // Installed Files to Preserve
  getPreservedFiles: `cat /etc/sysupgrade.conf 2>/dev/null; cat /lib/upgrade/keep.d/* 2>/dev/null`,

  // Package State
  exportPackageList: `opkg list-installed | awk '{print $1}' | sort`,
  exportUserPackages: `opkg list-installed | awk '{print $1}' | sort > /tmp/packages.txt && comm -23 /tmp/packages.txt /rom/usr/lib/opkg/info/*.list 2>/dev/null | sort -u || cat /tmp/packages.txt`,

  // Factory Reset
  factoryReset: `firstboot -y && reboot`,
  resetToDefaults: `mtd -r erase rootfs_data`,

  // Safe Mode Check
  isInSafeMode: `grep -q "failsafe" /proc/cmdline && echo "yes" || echo "no"`,
};

/**
 * Parse firmware/release information
 */
export function parseReleaseInfo(output: string): {
  distrib: string;
  release: string;
  revision: string;
  target: string;
  arch: string;
  description: string;
} {
  const info = {
    distrib: "",
    release: "",
    revision: "",
    target: "",
    arch: "",
    description: "",
  };

  for (const line of output.split("\n")) {
    const match = line.match(/^(\w+)='([^']*)'/);
    if (!match) continue;

    switch (match[1]) {
      case "DISTRIB_ID":
        info.distrib = match[2];
        break;
      case "DISTRIB_RELEASE":
        info.release = match[2];
        break;
      case "DISTRIB_REVISION":
        info.revision = match[2];
        break;
      case "DISTRIB_TARGET":
        info.target = match[2];
        break;
      case "DISTRIB_ARCH":
        info.arch = match[2];
        break;
      case "DISTRIB_DESCRIPTION":
        info.description = match[2];
        break;
    }
  }

  return info;
}

/**
 * Parse MTD partitions
 */
export function parseMTDInfo(output: string): Array<{
  device: string;
  size: number;
  eraseSize: number;
  name: string;
}> {
  const partitions: Array<{
    device: string;
    size: number;
    eraseSize: number;
    name: string;
  }> = [];

  const lines = output.split("\n").slice(1); // Skip header

  for (const line of lines) {
    const match = line.match(/^(mtd\d+):\s+([0-9a-f]+)\s+([0-9a-f]+)\s+"([^"]+)"/i);
    if (match) {
      partitions.push({
        device: match[1],
        size: parseInt(match[2], 16),
        eraseSize: parseInt(match[3], 16),
        name: match[4],
      });
    }
  }

  return partitions;
}

/**
 * Parse backup file listing
 */
export function parseBackupList(output: string): Array<{
  filename: string;
  size: number;
  date: string;
  path: string;
}> {
  const backups: Array<{
    filename: string;
    size: number;
    date: string;
    path: string;
  }> = [];

  for (const line of output.split("\n")) {
    if (!line.trim() || !line.includes("backup-")) continue;

    const parts = line.trim().split(/\s+/);
    if (parts.length >= 9) {
      const path = parts[parts.length - 1];
      const filename = path.split("/").pop() || "";

      backups.push({
        filename,
        size: parseInt(parts[4], 10) || 0,
        date: `${parts[5]} ${parts[6]} ${parts[7]}`,
        path,
      });
    }
  }

  return backups;
}

/**
 * Parse sysupgrade test output
 */
export function parseSysupgradeTest(output: string): {
  valid: boolean;
  message: string;
  imageType?: string;
  checksumValid?: boolean;
} {
  const result = {
    valid: false,
    message: "",
    imageType: undefined as string | undefined,
    checksumValid: undefined as boolean | undefined,
  };

  if (output.includes("Invalid image") || output.includes("not supported")) {
    result.valid = false;
    result.message = output.trim();
  } else if (output.includes("valid") || output.includes("Image check passed")) {
    result.valid = true;
    result.message = "Firmware image is valid";
  } else {
    result.message = output.trim();
  }

  // Check for image type
  if (output.includes("sysupgrade")) {
    result.imageType = "sysupgrade";
  } else if (output.includes("factory")) {
    result.imageType = "factory";
  }

  // Check for checksum validation
  if (output.includes("checksum OK")) {
    result.checksumValid = true;
  } else if (output.includes("checksum failed")) {
    result.checksumValid = false;
  }

  return result;
}

/**
 * Generate list of commands to restore packages after upgrade
 */
export function generatePackageRestoreCommands(packages: string[]): string[] {
  const commands = ["opkg update"];

  // Split into batches of 10 for efficiency
  const batchSize = 10;
  for (let i = 0; i < packages.length; i += batchSize) {
    const batch = packages.slice(i, i + batchSize);
    commands.push(`opkg install ${batch.join(" ")}`);
  }

  return commands;
}
