import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  Package,
  Trash2,
  RefreshCw,
  Loader2,
  Search,
  Plus,
  ArrowUpCircle,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, createSelectionColumn } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface PackageRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  name: string;
  version: string;
  size: number;
  description: string;
  installed: boolean;
  upgradable: boolean;
  newVersion?: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface PackagesTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function PackagesTable({ deviceId, globalActions }: PackagesTableProps) {
  const rawPackageIds = useRowIds("packages");
  const rawPackagesData = useTable("packages");
  const devicesData = useTable("openwrtDevices");
  const deviceIds = useRowIds("openwrtDevices");

  // Debounce package data to prevent flickering during rapid updates
  // Only update displayed data after store has been stable for 500ms when shrinking
  const [stablePackageIds, setStablePackageIds] = useState<string[]>(rawPackageIds);
  const [stablePackagesData, setStablePackagesData] = useState(rawPackagesData);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastStableLengthRef = useRef(rawPackageIds.length);

  useEffect(() => {
    // Clear any pending update
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // If the data grew or stayed the same, update immediately (feels responsive)
    // If the data shrank significantly, debounce to avoid flickering during refresh
    const sizeDiff = rawPackageIds.length - lastStableLengthRef.current;
    if (sizeDiff >= 0 || rawPackageIds.length === 0) {
      lastStableLengthRef.current = rawPackageIds.length;
      setStablePackageIds(rawPackageIds);
      setStablePackagesData(rawPackagesData);
    } else {
      // Data shrank - debounce to wait for refresh to complete
      debounceRef.current = setTimeout(() => {
        lastStableLengthRef.current = rawPackageIds.length;
        setStablePackageIds(rawPackageIds);
        setStablePackagesData(rawPackagesData);
      }, 500);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [rawPackageIds, rawPackagesData]);

  // Use stable data for rendering
  const packageIds = stablePackageIds;
  const packagesData = stablePackagesData;

  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [isInstalling, setIsInstalling] = useState(false);
  const [installPackage, setInstallPackage] = useState("");
  const [selectedDeviceId, setSelectedDeviceId] = useState(deviceId || "");
  const [isUpdatingList, setIsUpdatingList] = useState(false);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);
  const [selectedRows, setSelectedRows] = useState<PackageRow[]>([]);
  const [filteredRows, setFilteredRows] = useState<PackageRow[]>([]);

  const queueInstall = useCallback(async (devId: string, pkgName: string) => {
    setUpdatingIds((prev) => new Set(prev).add(`${devId}-${pkgName}`));
    try {
      await fetch(`/api/openwrt/devices/${devId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "install",
          package: pkgName,
        }),
      });
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(`${devId}-${pkgName}`);
        return next;
      });
    }
  }, []);

  const queueRemove = useCallback(async (devId: string, pkgName: string) => {
    if (!confirm(`Queue removal of package "${pkgName}"?`)) return;

    setUpdatingIds((prev) => new Set(prev).add(`${devId}-${pkgName}`));
    try {
      await fetch(`/api/openwrt/devices/${devId}/packages/${pkgName}`, {
        method: "DELETE",
      });
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(`${devId}-${pkgName}`);
        return next;
      });
    }
  }, []);

  const queueUpgrade = useCallback(async (devId: string, pkgName: string) => {
    setUpdatingIds((prev) => new Set(prev).add(`${devId}-${pkgName}`));
    try {
      await fetch(`/api/openwrt/devices/${devId}/packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upgrade",
          package: pkgName,
        }),
      });
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(`${devId}-${pkgName}`);
        return next;
      });
    }
  }, []);

  const updatePackageList = useCallback(async (devId?: string) => {
    setIsUpdatingList(true);
    try {
      // If a specific device, update just that one
      // Otherwise update all devices
      const devicesToUpdate = devId ? [devId] : deviceIds;

      for (const id of devicesToUpdate) {
        const device = devicesData[id];
        const host = (device?.tailscaleIp as string) || "";
        if (!host) continue;

        await fetch(`/api/openwrt/devices/${id}/packages/update`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host }),
        });
      }
    } finally {
      setIsUpdatingList(false);
    }
  }, [devicesData, deviceIds]);

  // Handle selection changes from the table
  const handleSelectionChange = useCallback((selected: PackageRow[], filtered: PackageRow[]) => {
    setSelectedRows(selected);
    setFilteredRows(filtered);
  }, []);

  // Get packages to upgrade based on selection or filters
  const packagesToUpgrade = useMemo(() => {
    // If rows are selected, use only the selected upgradable packages
    if (selectedRows.length > 0) {
      return selectedRows.filter((pkg) => pkg.upgradable);
    }
    // Otherwise use all filtered upgradable packages
    return filteredRows.filter((pkg) => pkg.upgradable);
  }, [selectedRows, filteredRows]);

  const updateAllPackages = useCallback(async () => {
    if (packagesToUpgrade.length === 0) return;

    setIsUpdatingAll(true);
    try {
      // Queue upgrade for each upgradable package
      for (const pkg of packagesToUpgrade) {
        await fetch(`/api/openwrt/devices/${pkg.deviceId}/packages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "upgrade",
            package: pkg.name,
          }),
        });
      }
    } finally {
      setIsUpdatingAll(false);
    }
  }, [packagesToUpgrade]);

  const handleInstall = useCallback(async () => {
    if (!selectedDeviceId || !installPackage.trim()) return;

    await queueInstall(selectedDeviceId, installPackage.trim());
    setInstallPackage("");
    setIsInstalling(false);
  }, [selectedDeviceId, installPackage, queueInstall]);

  const data = useMemo<PackageRow[]>(() => {
    const result: PackageRow[] = [];
    for (const id of packageIds) {
      const row = packagesData[id] || {};
      const devId = (row.deviceId as string) || "";

      if (deviceId && devId !== deviceId) continue;

      const device = devicesData[devId] || {};
      const newVer = row.newVersion as string | undefined;

      result.push({
        id,
        deviceId: devId,
        deviceHostname: (device.hostname as string) || devId,
        name: (row.name as string) || "",
        version: (row.version as string) || "",
        size: (row.size as number) || 0,
        description: (row.description as string) || "",
        installed: (row.installed as boolean) ?? true,
        upgradable: (row.upgradable as boolean) || false,
        newVersion: newVer,
      });
    }
    return result;
  }, [packageIds, packagesData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<PackageRow>[]>(
    () => [
      createSelectionColumn<PackageRow>(),
      {
        accessorKey: "name",
        header: "Package",
        size: 200,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{row.original.name}</div>
              {row.original.description && (
                <div className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                  {row.original.description}
                </div>
              )}
            </div>
          </div>
        ),
      },
      ...(!deviceId
        ? [
            {
              accessorKey: "deviceHostname",
              header: "Device",
              size: 120,
              cell: ({ row }: { row: { original: PackageRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<PackageRow>,
          ]
        : []),
      {
        accessorKey: "version",
        header: "Version",
        size: 140,
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="font-mono">{row.original.version}</div>
            {row.original.upgradable && row.original.newVersion && (
              <div className="text-xs text-green-500 font-mono">
                {row.original.newVersion}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "size",
        header: "Size",
        size: 80,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatSize(row.original.size)}
          </span>
        ),
      },
      {
        accessorKey: "upgradable",
        header: "Status",
        size: 140,
        // Convert boolean to string for filtering to work with faceted filters
        accessorFn: (row) => (row.upgradable ? "upgradable" : "current"),
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.upgradable ? (
              <Badge variant="default" className="bg-blue-500">
                Update Available
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Up to Date
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 120,
        enableHiding: false,
        cell: ({ row }) => {
          const isUpdating = updatingIds.has(
            `${row.original.deviceId}-${row.original.name}`
          );

          return (
            <div className="flex gap-1">
              {row.original.upgradable && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Upgrade package"
                  onClick={() =>
                    queueUpgrade(row.original.deviceId, row.original.name)
                  }
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="h-4 w-4 text-blue-500" />
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                title="Remove package"
                onClick={() =>
                  queueRemove(row.original.deviceId, row.original.name)
                }
                disabled={isUpdating}
              >
                {isUpdating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 text-destructive" />
                )}
              </Button>
            </div>
          );
        },
      },
    ],
    [deviceId, updatingIds, queueRemove, queueUpgrade]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="name"
      filterPlaceholder="Search packages..."
      className="h-full"
      onSelectionChange={handleSelectionChange}
      getRowId={(row) => row.id}
      facetedFilters={[
        {
          column: "upgradable",
          title: "Updates",
          options: [
            { label: "Update Available", value: "upgradable" },
            { label: "Up to Date", value: "current" },
          ],
        },
        // Only show device filter when viewing all devices
        ...(!deviceId
          ? [
              {
                column: "deviceHostname",
                title: "Device",
                options: deviceIds.map((id) => ({
                  label: (devicesData[id]?.hostname as string) || id,
                  value: (devicesData[id]?.hostname as string) || id,
                })),
              },
            ]
          : []),
      ]}
      globalActions={
        <>
          {globalActions}
          <Button
            variant="outline"
            className="gap-1"
            onClick={() => updatePackageList(deviceId)}
            disabled={isUpdatingList}
          >
            {isUpdatingList ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
          {(packagesToUpgrade.length > 0 || selectedRows.length > 0) && (
            <Button
              variant="default"
              className="gap-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              onClick={updateAllPackages}
              disabled={isUpdatingAll || packagesToUpgrade.length === 0}
              title={
                selectedRows.length > 0
                  ? packagesToUpgrade.length > 0
                    ? `Update ${packagesToUpgrade.length} selected upgradable package(s)`
                    : "No upgradable packages in selection"
                  : "Update all filtered packages"
              }
            >
              {isUpdatingAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="h-4 w-4" />
              )}
              {selectedRows.length > 0 ? "Update Selected" : "Update All"} ({packagesToUpgrade.length})
            </Button>
          )}
          <Dialog open={isInstalling} onOpenChange={setIsInstalling}>
            <DialogTrigger asChild>
              <Button className="gap-1">
                <Plus className="h-4 w-4" />
                Install Package
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Install Package</DialogTitle>
                <DialogDescription>
                  Enter the package name to install. The installation will be
                  queued for approval.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {!deviceId && (
                  <div className="space-y-2">
                    <Label>Device</Label>
                    <Select
                      value={selectedDeviceId}
                      onValueChange={setSelectedDeviceId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select device" />
                      </SelectTrigger>
                      <SelectContent>
                        {deviceIds.map((id) => (
                          <SelectItem key={id} value={id}>
                            {(devicesData[id]?.hostname as string) || id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Package Name</Label>
                  <div className="flex gap-2">
                    <Search className="h-4 w-4 mt-3 text-muted-foreground" />
                    <Input
                      value={installPackage}
                      onChange={(e) => setInstallPackage(e.target.value)}
                      placeholder="e.g., luci-app-sqm"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsInstalling(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleInstall}
                  disabled={!selectedDeviceId || !installPackage.trim()}
                >
                  Queue Installation
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    />
  );
}
