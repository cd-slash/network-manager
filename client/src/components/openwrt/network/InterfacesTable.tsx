import { useCallback, useMemo, useState } from "react";
import {
  Network,
  Wifi,
  Globe,
  Settings2,
  RefreshCw,
  Loader2,
  ArrowUp,
  ArrowDown,
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
import { InterfaceForm } from "./InterfaceForm";

interface InterfaceRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  name: string;
  ifname: string;
  proto: string;
  ipaddr: string;
  netmask: string;
  gateway: string;
  macaddr: string;
  mtu: number;
  enabled: boolean;
  type: string;
  status: string;
  rxBytes: number;
  txBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const protoConfig: Record<string, { label: string; color: string }> = {
  static: { label: "Static", color: "text-blue-500" },
  dhcp: { label: "DHCP", color: "text-green-500" },
  pppoe: { label: "PPPoE", color: "text-purple-500" },
  none: { label: "None", color: "text-muted-foreground" },
};

interface InterfacesTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function InterfacesTable({ deviceId, globalActions }: InterfacesTableProps) {
  const interfaceIds = useRowIds("networkInterfaces");
  const interfacesData = useTable("networkInterfaces");
  const devicesData = useTable("openwrtDevices");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const syncInterfaces = useCallback(async (devId: string, host: string) => {
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

  const data = useMemo<InterfaceRow[]>(() => {
    return interfaceIds
      .map((id) => {
        const row = interfacesData[id] || {};
        const devId = (row.deviceId as string) || "";

        // Filter by deviceId if provided
        if (deviceId && devId !== deviceId) return null;

        const device = devicesData[devId] || {};

        return {
          id,
          deviceId: devId,
          deviceHostname: (device.hostname as string) || devId,
          name: (row.name as string) || "",
          ifname: (row.ifname as string) || "",
          proto: (row.proto as string) || "static",
          ipaddr: (row.ipaddr as string) || "",
          netmask: (row.netmask as string) || "",
          gateway: (row.gateway as string) || "",
          macaddr: (row.macaddr as string) || "",
          mtu: (row.mtu as number) || 1500,
          enabled: (row.enabled as boolean) ?? true,
          type: (row.type as string) || "",
          status: (row.status as string) || "unknown",
          rxBytes: (row.rxBytes as number) || 0,
          txBytes: (row.txBytes as number) || 0,
        };
      })
      .filter((row): row is InterfaceRow => row !== null);
  }, [interfaceIds, interfacesData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<InterfaceRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Interface",
        size: 140,
        cell: ({ row }) => {
          const name = row.original.name.toLowerCase();
          const Icon = name.includes("wan")
            ? Globe
            : name.includes("wlan") || name.includes("wifi")
            ? Wifi
            : Network;
          return (
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">{row.original.name}</div>
                <div className="text-xs text-muted-foreground">{row.original.ifname}</div>
              </div>
            </div>
          );
        },
      },
      ...(!deviceId
        ? [
            {
              accessorKey: "deviceHostname",
              header: "Device",
              size: 120,
              cell: ({ row }: { row: { original: InterfaceRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<InterfaceRow>,
          ]
        : []),
      {
        accessorKey: "proto",
        header: "Protocol",
        size: 100,
        cell: ({ row }) => {
          const config = protoConfig[row.original.proto] || protoConfig.none;
          return (
            <span className={`font-medium ${config.color}`}>{config.label}</span>
          );
        },
      },
      {
        accessorKey: "ipaddr",
        header: "IP Address",
        size: 160,
        cell: ({ row }) => (
          <div className="font-mono text-sm">
            <div>{row.original.ipaddr || "-"}</div>
            {row.original.netmask && (
              <div className="text-xs text-muted-foreground">/{row.original.netmask}</div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "gateway",
        header: "Gateway",
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.gateway || "-"}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 100,
        cell: ({ row }) => {
          const isUp = row.original.status === "up";
          return (
            <Badge variant={isUp ? "success" : "secondary"}>
              {isUp ? "Up" : row.original.status || "Down"}
            </Badge>
          );
        },
      },
      {
        id: "traffic",
        header: () => <span className="flex-1 text-right">Traffic</span>,
        size: 140,
        cell: ({ row }) => (
          <div className="text-right text-sm">
            <div className="flex items-center justify-end gap-1">
              <ArrowDown className="h-3 w-3 text-green-500" />
              {formatBytes(row.original.rxBytes)}
            </div>
            <div className="flex items-center justify-end gap-1 text-muted-foreground">
              <ArrowUp className="h-3 w-3 text-blue-500" />
              {formatBytes(row.original.txBytes)}
            </div>
          </div>
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
                    title="Edit interface"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-lg">
                  <SheetHeader>
                    <SheetTitle>Edit Interface: {row.original.name}</SheetTitle>
                    <SheetDescription>
                      Configure network interface settings. Changes will be queued for approval.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6">
                    <InterfaceForm interfaceData={row.original} />
                  </div>
                </SheetContent>
              </Sheet>
              <Button
                variant="ghost"
                size="icon"
                title="Refresh"
                onClick={() => syncInterfaces(row.original.deviceId, host)}
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
    [deviceId, syncingIds, syncInterfaces, devicesData]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="name"
      filterPlaceholder="Filter by interface name..."
      className="h-full"
      facetedFilters={[
        {
          column: "proto",
          title: "Protocol",
          options: [
            { label: "Static", value: "static" },
            { label: "DHCP", value: "dhcp" },
            { label: "PPPoE", value: "pppoe" },
            { label: "None", value: "none" },
          ],
        },
        {
          column: "status",
          title: "Status",
          options: [
            { label: "Up", value: "up" },
            { label: "Down", value: "down" },
          ],
        },
      ]}
      globalActions={globalActions}
    />
  );
}
