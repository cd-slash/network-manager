import { useCallback, useMemo, useState } from "react";
import {
  Wifi,
  WifiOff,
  Settings2,
  RefreshCw,
  Loader2,
  Lock,
  Unlock,
  Users,
  Plus,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { SSIDForm } from "./SSIDForm";

interface SSIDRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  radioName: string;
  ssid: string;
  mode: string;
  encryption: string;
  band: string;
  channel: number;
  hidden: boolean;
  isolate: boolean;
  network: string;
  disabled: boolean;
  connectedClients: number;
}

const encryptionConfig: Record<string, { label: string; secure: boolean }> = {
  none: { label: "Open", secure: false },
  psk: { label: "WPA-PSK", secure: true },
  psk2: { label: "WPA2-PSK", secure: true },
  "psk-mixed": { label: "WPA/WPA2-PSK", secure: true },
  sae: { label: "WPA3-SAE", secure: true },
  "sae-mixed": { label: "WPA2/WPA3", secure: true },
  wep: { label: "WEP", secure: false },
};

const modeConfig: Record<string, string> = {
  ap: "Access Point",
  sta: "Client",
  adhoc: "Ad-Hoc",
  monitor: "Monitor",
  mesh: "Mesh Point",
};

interface SSIDsTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function SSIDsTable({ deviceId, globalActions }: SSIDsTableProps) {
  const ssidIds = useRowIds("wirelessNetworks");
  const ssidsData = useTable("wirelessNetworks");
  const devicesData = useTable("openwrtDevices");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);

  const syncSSIDs = useCallback(async (devId: string, host: string) => {
    setSyncingIds((prev) => new Set(prev).add(devId));
    try {
      await fetch(`/api/openwrt/devices/${devId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host }),
      });
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(devId);
        return next;
      });
    }
  }, []);

  const data = useMemo<SSIDRow[]>(() => {
    return ssidIds
      .map((id) => {
        const row = ssidsData[id] || {};
        const devId = (row.deviceId as string) || "";

        if (deviceId && devId !== deviceId) return null;

        const device = devicesData[devId] || {};
        const radioName = (row.radioName as string) || "";

        return {
          id,
          deviceId: devId,
          deviceHostname: (device.hostname as string) || devId,
          radioName,
          ssid: (row.ssid as string) || "",
          mode: (row.mode as string) || "ap",
          encryption: (row.encryption as string) || "none",
          band: (row.band as string) || "",
          channel: (row.channel as number) || 0,
          hidden: (row.hidden as boolean) || false,
          isolate: (row.isolate as boolean) || false,
          network: (row.network as string) || "lan",
          disabled: (row.disabled as boolean) || false,
          connectedClients: (row.connectedClients as number) || 0,
        };
      })
      .filter((row): row is SSIDRow => row !== null);
  }, [ssidIds, ssidsData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<SSIDRow>[]>(
    () => [
      {
        accessorKey: "ssid",
        header: "SSID",
        size: 180,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {row.original.disabled ? (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Wifi className="h-4 w-4 text-primary" />
            )}
            <div>
              <div className="font-medium flex items-center gap-1">
                {row.original.ssid}
                {row.original.hidden && (
                  <Badge variant="outline" className="text-xs">Hidden</Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {row.original.radioName} - {row.original.band || "Unknown band"}
              </div>
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
              cell: ({ row }: { row: { original: SSIDRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<SSIDRow>,
          ]
        : []),
      {
        accessorKey: "mode",
        header: "Mode",
        size: 120,
        cell: ({ row }) => (
          <Badge variant="outline">
            {modeConfig[row.original.mode] || row.original.mode}
          </Badge>
        ),
      },
      {
        accessorKey: "encryption",
        header: "Security",
        size: 140,
        cell: ({ row }) => {
          const config = encryptionConfig[row.original.encryption] || {
            label: row.original.encryption,
            secure: false,
          };
          return (
            <div className="flex items-center gap-1">
              {config.secure ? (
                <Lock className="h-3 w-3 text-green-500" />
              ) : (
                <Unlock className="h-3 w-3 text-warning" />
              )}
              <span className={config.secure ? "text-green-500" : "text-warning"}>
                {config.label}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "network",
        header: "Network",
        size: 100,
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.network}</Badge>
        ),
      },
      {
        accessorKey: "connectedClients",
        header: "Clients",
        size: 80,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3 text-muted-foreground" />
            <span>{row.original.connectedClients}</span>
          </div>
        ),
      },
      {
        accessorKey: "disabled",
        header: "Status",
        size: 100,
        cell: ({ row }) => (
          <Badge variant={row.original.disabled ? "secondary" : "success"}>
            {row.original.disabled ? "Disabled" : "Active"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 100,
        enableHiding: false,
        cell: ({ row }) => {
          const isSyncing = syncingIds.has(row.original.deviceId);
          const device = devicesData[row.original.deviceId];
          const host = (device?.tailscaleIp as string) || "";

          return (
            <div className="flex gap-1">
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit SSID"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-lg overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Edit SSID: {row.original.ssid}</SheetTitle>
                    <SheetDescription>
                      Configure wireless network settings. Changes will be queued for approval.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6">
                    <SSIDForm ssidData={row.original} />
                  </div>
                </SheetContent>
              </Sheet>
              <Button
                variant="ghost"
                size="icon"
                title="Refresh"
                onClick={() => syncSSIDs(row.original.deviceId, host)}
                disabled={isSyncing || !host}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          );
        },
      },
    ],
    [deviceId, syncingIds, syncSSIDs, devicesData]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="ssid"
      filterPlaceholder="Filter by SSID..."
      className="h-full"
      facetedFilters={[
        {
          column: "mode",
          title: "Mode",
          options: [
            { label: "Access Point", value: "ap" },
            { label: "Client", value: "sta" },
            { label: "Mesh Point", value: "mesh" },
          ],
        },
        {
          column: "disabled",
          title: "Status",
          options: [
            { label: "Active", value: "false" },
            { label: "Disabled", value: "true" },
          ],
        },
      ]}
      globalActions={
        <>
          {globalActions}
          <Sheet open={isCreating} onOpenChange={setIsCreating}>
            <SheetTrigger asChild>
              <Button className="gap-1">
                <Plus className="h-4 w-4" />
                Add SSID
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Create New SSID</SheetTitle>
                <SheetDescription>
                  Add a new wireless network. The change will be queued for approval.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6">
                <SSIDForm
                  isNew
                  deviceId={deviceId}
                  onSuccess={() => setIsCreating(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      }
    />
  );
}
