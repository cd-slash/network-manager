import { useCallback, useMemo, useState } from "react";
import { Server, Trash2, RefreshCw, Loader2 } from "lucide-react";
import { useRowIds, useTable, useStore } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ServerStatusBadge } from "./ServerStatusBadge";
import type { ServerStatus } from "@/store";

interface ServerRow {
  id: string;
  hostname: string;
  tailscaleIp: string;
  status: ServerStatus;
  cpuLoad: number;
  memoryTotal: number;
  memoryAvailable: number;
  containerCapacity: number;
  activeContainers: number;
  lastHealthCheck: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface ServersTableProps {
  globalActions?: React.ReactNode;
}

export function ServersTable({ globalActions }: ServersTableProps) {
  const store = useStore();
  const serverIds = useRowIds("servers");
  const serversData = useTable("servers");
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());

  const refreshServer = useCallback(async (id: string, host: string) => {
    setRefreshingIds((prev) => new Set(prev).add(id));

    try {
      await fetch(`/api/servers/${id}/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host }),
      });
      // Server updates store, which syncs to client automatically
    } finally {
      setRefreshingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const data = useMemo<ServerRow[]>(() => {
    return serverIds.map((id) => {
      const row = serversData[id] || {};
      return {
        id,
        hostname: (row.hostname as string) || "",
        tailscaleIp: (row.tailscaleIp as string) || "",
        status: ((row.status as string) || "offline") as ServerStatus,
        cpuLoad: (row.cpuLoad as number) || 0,
        memoryTotal: (row.memoryTotal as number) || 0,
        memoryAvailable: (row.memoryAvailable as number) || 0,
        containerCapacity: (row.containerCapacity as number) || 4,
        activeContainers: (row.activeContainers as number) || 0,
        lastHealthCheck: (row.lastHealthCheck as number) || 0,
      };
    });
  }, [serverIds, serversData]);

  const columns = useMemo<ColumnDef<ServerRow>[]>(
    () => [
      {
        accessorKey: "hostname",
        header: "Hostname",
        size: 180,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <Server className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{row.original.hostname}</span>
          </div>
        ),
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
        cell: ({ row }) => <ServerStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "cpuLoad",
        header: () => <span className="flex-1 text-right">CPU Load</span>,
        size: 100,
        cell: ({ row }) => (
          <span className="text-right block truncate">{row.original.cpuLoad.toFixed(2)}</span>
        ),
      },
      {
        id: "memory",
        header: () => <span className="flex-1 text-right">Memory</span>,
        size: 180,
        accessorFn: (row) => row.memoryTotal - row.memoryAvailable,
        cell: ({ row }) => {
          const memUsed = row.original.memoryTotal - row.original.memoryAvailable;
          const memPercent =
            row.original.memoryTotal > 0
              ? Math.round((memUsed / row.original.memoryTotal) * 100)
              : 0;
          return (
            <span className="text-right block truncate">
              {formatBytes(memUsed)} / {formatBytes(row.original.memoryTotal)} ({memPercent}%)
            </span>
          );
        },
      },
      {
        id: "containers",
        header: () => <span className="flex-1 text-right">Containers</span>,
        size: 100,
        accessorFn: (row) => row.activeContainers,
        cell: ({ row }) => (
          <span className="text-right block truncate">
            {row.original.activeContainers} / {row.original.containerCapacity}
          </span>
        ),
      },
      {
        accessorKey: "lastHealthCheck",
        header: "Last Check",
        size: 100,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm truncate block">
            {formatTimeAgo(row.original.lastHealthCheck)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 100,
        enableHiding: false,
        cell: ({ row }) => {
          const isRefreshing = refreshingIds.has(row.original.id);
          const handleRefresh = () => {
            refreshServer(row.original.id, row.original.tailscaleIp);
          };
          const handleDelete = () => {
            store?.delRow("servers", row.original.id);
          };
          return (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                title="Refresh stats"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
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
    [store, refreshingIds, refreshServer]
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
            { label: "Busy", value: "busy" },
            { label: "Draining", value: "draining" },
            { label: "Offline", value: "offline" },
          ],
        },
      ]}
      globalActions={globalActions}
    />
  );
}
