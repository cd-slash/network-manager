import { useMemo } from "react";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  RotateCcw,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import type { ChangeStatus, ChangeImpact, ChangeCategory } from "@/store";

interface HistoryRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  category: ChangeCategory;
  operation: string;
  targetName: string;
  impact: ChangeImpact;
  status: ChangeStatus;
  createdAt: number;
  executedAt: number;
  result: string;
  errorMessage: string;
}

const statusConfig: Record<
  ChangeStatus,
  { label: string; icon: typeof CheckCircle; color: string }
> = {
  pending: { label: "Pending", icon: Clock, color: "text-muted-foreground" },
  approved: { label: "Approved", icon: CheckCircle, color: "text-blue-500" },
  executing: { label: "Executing", icon: Clock, color: "text-yellow-500" },
  completed: { label: "Completed", icon: CheckCircle, color: "text-green-500" },
  failed: { label: "Failed", icon: XCircle, color: "text-red-500" },
  cancelled: { label: "Cancelled", icon: AlertCircle, color: "text-muted-foreground" },
};

const categoryConfig: Record<ChangeCategory, { label: string }> = {
  network: { label: "Network" },
  wireless: { label: "Wireless" },
  firewall: { label: "Firewall" },
  dhcp: { label: "DHCP" },
  sqm: { label: "QoS" },
  packages: { label: "Packages" },
  mesh: { label: "Mesh" },
  system: { label: "System" },
};

function formatTime(timestamp: number): string {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString();
}

export function ChangeHistoryTable() {
  const changeIds = useRowIds("pendingChanges");
  const changesData = useTable("pendingChanges");
  const devicesData = useTable("openwrtDevices");

  const data = useMemo<HistoryRow[]>(() => {
    return changeIds
      .map((id) => {
        const row = changesData[id] || {};
        const status = (row.status as string) || "pending";

        // Only show non-pending changes in history
        if (status === "pending") return null;

        const deviceId = (row.deviceId as string) || "";
        const device = devicesData[deviceId] || {};

        return {
          id,
          deviceId,
          deviceHostname: (device.hostname as string) || deviceId,
          category: ((row.category as string) || "system") as ChangeCategory,
          operation: (row.operation as string) || "update",
          targetName: (row.targetName as string) || "",
          impact: ((row.impact as string) || "low") as ChangeImpact,
          status: status as ChangeStatus,
          createdAt: (row.createdAt as number) || 0,
          executedAt: (row.executedAt as number) || 0,
          result: (row.result as string) || "",
          errorMessage: (row.errorMessage as string) || "",
        };
      })
      .filter((row): row is HistoryRow => row !== null)
      .sort((a, b) => b.executedAt - a.executedAt);
  }, [changeIds, changesData, devicesData]);

  const columns = useMemo<ColumnDef<HistoryRow>[]>(
    () => [
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        cell: ({ row }) => {
          const config = statusConfig[row.original.status];
          const Icon = config?.icon || Clock;
          return (
            <div className={`flex items-center gap-2 ${config?.color || ""}`}>
              <Icon className="h-4 w-4" />
              <span>{config?.label || row.original.status}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "deviceHostname",
        header: "Device",
        size: 140,
        cell: ({ row }) => (
          <span className="truncate block font-medium">{row.original.deviceHostname}</span>
        ),
      },
      {
        accessorKey: "category",
        header: "Category",
        size: 100,
        cell: ({ row }) => (
          <Badge variant="outline">
            {categoryConfig[row.original.category]?.label || row.original.category}
          </Badge>
        ),
      },
      {
        accessorKey: "operation",
        header: "Operation",
        size: 100,
        cell: ({ row }) => (
          <span className="capitalize">{row.original.operation}</span>
        ),
      },
      {
        accessorKey: "targetName",
        header: "Target",
        size: 180,
        cell: ({ row }) => (
          <span className="truncate block">{row.original.targetName}</span>
        ),
      },
      {
        accessorKey: "executedAt",
        header: "Executed",
        size: 160,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatTime(row.original.executedAt)}
          </span>
        ),
      },
      {
        id: "result",
        header: "Result",
        size: 200,
        cell: ({ row }) => {
          if (row.original.status === "failed") {
            return (
              <span className="text-sm text-destructive truncate block" title={row.original.errorMessage}>
                {row.original.errorMessage || "Failed"}
              </span>
            );
          }
          if (row.original.status === "completed") {
            return <span className="text-sm text-green-500">Success</span>;
          }
          if (row.original.status === "cancelled") {
            return <span className="text-sm text-muted-foreground">Cancelled</span>;
          }
          return <span className="text-sm text-muted-foreground">-</span>;
        },
      },
      {
        id: "actions",
        header: "Actions",
        size: 80,
        enableHiding: false,
        cell: ({ row }) => {
          if (row.original.status !== "completed" && row.original.status !== "failed") {
            return null;
          }
          return (
            <Button
              variant="ghost"
              size="sm"
              title="Create rollback"
              className="gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              Rollback
            </Button>
          );
        },
      },
    ],
    []
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="targetName"
      filterPlaceholder="Filter by target..."
      className="h-full"
      facetedFilters={[
        {
          column: "status",
          title: "Status",
          options: [
            { label: "Completed", value: "completed" },
            { label: "Failed", value: "failed" },
            { label: "Cancelled", value: "cancelled" },
          ],
        },
      ]}
    />
  );
}
