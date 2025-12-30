import { useCallback, useMemo, useState } from "react";
import { Router, Trash2, RefreshCw, Loader2, Wifi, Shield } from "lucide-react";
import { useRowIds, useTable, useStore } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { DeviceStatusBadge } from "./DeviceStatusBadge";
import { Badge } from "@/components/ui/badge";
import type { DeviceStatus, DeviceRole } from "@/store";
import { refreshDevice } from "@/lib/api";

interface DeviceRow {
  id: string;
  hostname: string;
  tailscaleIp: string;
  model: string;
  firmwareVersion: string;
  status: DeviceStatus;
  role: DeviceRole;
  meshEnabled: boolean;
  memoryTotal: number;
  memoryFree: number;
  loadAvg1m: number;
  uptime: number;
  lastSeen: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  if (!seconds) return "Unknown";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const roleConfig: Record<DeviceRole, { label: string; icon: typeof Router }> = {
  gateway: { label: "Gateway", icon: Shield },
  mesh_node: { label: "Mesh Node", icon: Wifi },
  access_point: { label: "AP", icon: Wifi },
  switch: { label: "Switch", icon: Router },
};

interface RoutersTableProps {
  globalActions?: React.ReactNode;
}

export function RoutersTable({ globalActions }: RoutersTableProps) {
  const store = useStore();
  const deviceIds = useRowIds("openwrtDevices");
  const devicesData = useTable("openwrtDevices");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const syncDevice = useCallback(async (id: string, host: string) => {
    setSyncingIds((prev) => new Set(prev).add(id));

    try {
      await refreshDevice(id, host);
    } catch (error) {
      console.error("Failed to refresh device:", error);
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const data = useMemo<DeviceRow[]>(() => {
    return deviceIds.map((id) => {
      const row = devicesData[id] || {};
      return {
        id,
        hostname: (row.hostname as string) || "",
        tailscaleIp: (row.tailscaleIp as string) || "",
        model: (row.model as string) || "",
        firmwareVersion: (row.firmwareVersion as string) || "",
        status: ((row.status as string) || "offline") as DeviceStatus,
        role: ((row.role as string) || "gateway") as DeviceRole,
        meshEnabled: (row.meshEnabled as boolean) || false,
        memoryTotal: (row.memoryTotal as number) || 0,
        memoryFree: (row.memoryFree as number) || 0,
        loadAvg1m: (row.loadAvg1m as number) || 0,
        uptime: (row.uptime as number) || 0,
        lastSeen: (row.lastSeen as number) || 0,
      };
    });
  }, [deviceIds, devicesData]);

  const columns = useMemo<ColumnDef<DeviceRow>[]>(
    () => [
      {
        accessorKey: "hostname",
        header: "Device",
        size: 200,
        cell: ({ row }) => {
          const RoleIcon = roleConfig[row.original.role]?.icon || Router;
          return (
            <div className="flex items-center gap-2 min-w-0">
              <RoleIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate font-medium">{row.original.hostname}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {row.original.model || "Unknown model"}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "tailscaleIp",
        header: "IP Address",
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono text-sm truncate block">{row.original.tailscaleIp}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 100,
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
        cell: ({ row }) => <DeviceStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "role",
        header: "Role",
        size: 120,
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
        cell: ({ row }) => {
          const config = roleConfig[row.original.role];
          return (
            <div className="flex items-center gap-1">
              <Badge variant="secondary">{config?.label || row.original.role}</Badge>
              {row.original.meshEnabled && (
                <Badge variant="outline" className="text-xs">Mesh</Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "firmwareVersion",
        header: "Firmware",
        size: 120,
        cell: ({ row }) => (
          <span className="text-sm truncate block">
            {row.original.firmwareVersion || "-"}
          </span>
        ),
      },
      {
        id: "resources",
        header: () => <span className="flex-1 text-right">Resources</span>,
        size: 160,
        accessorFn: (row) => row.loadAvg1m,
        cell: ({ row }) => {
          const memUsed = row.original.memoryTotal - row.original.memoryFree;
          const memPercent =
            row.original.memoryTotal > 0
              ? Math.round((memUsed / row.original.memoryTotal) * 100)
              : 0;
          return (
            <div className="text-right text-sm">
              <div>Load: {row.original.loadAvg1m.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                RAM: {formatBytes(memUsed)} ({memPercent}%)
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "uptime",
        header: "Uptime",
        size: 100,
        cell: ({ row }) => (
          <span className="text-sm truncate block">
            {formatUptime(row.original.uptime)}
          </span>
        ),
      },
      {
        accessorKey: "lastSeen",
        header: "Last Seen",
        size: 100,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm truncate block">
            {formatTimeAgo(row.original.lastSeen)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 100,
        enableHiding: false,
        cell: ({ row }) => {
          const isSyncing = syncingIds.has(row.original.id);
          const handleSync = () => {
            syncDevice(row.original.id, row.original.tailscaleIp);
          };
          const handleDelete = () => {
            store?.delRow("openwrtDevices", row.original.id);
          };
          return (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                title="Sync configuration"
                onClick={handleSync}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Remove"
                onClick={handleDelete}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        },
      },
    ],
    [store, syncingIds, syncDevice]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="hostname"
      filterPlaceholder="Filter by hostname..."
      className="h-full"
      facetedFilters={[
        {
          column: "status",
          title: "Status",
          options: [
            { label: "Online", value: "online" },
            { label: "Offline", value: "offline" },
            { label: "Unreachable", value: "unreachable" },
          ],
        },
        {
          column: "role",
          title: "Role",
          options: [
            { label: "Gateway", value: "gateway" },
            { label: "Mesh Node", value: "mesh_node" },
            { label: "Access Point", value: "access_point" },
            { label: "Switch", value: "switch" },
          ],
        },
      ]}
      globalActions={globalActions}
    />
  );
}
