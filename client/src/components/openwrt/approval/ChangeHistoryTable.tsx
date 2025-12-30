import { useMemo, useState } from "react";
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  RotateCcw,
  FileText,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ChangeStatus, ChangeImpact, ChangeCategory } from "@/store";

interface ExecutionLog {
  id: string;
  changeId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  executedAt: number;
  duration: number;
}

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
  const [selectedChange, setSelectedChange] = useState<HistoryRow | null>(null);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchLogs = async (change: HistoryRow) => {
    setSelectedChange(change);
    setLogsLoading(true);
    try {
      const response = await fetch(`/api/openwrt/changes/${change.id}/logs`);
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error("Failed to fetch execution logs:", error);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  };

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
        size: 140,
        enableHiding: false,
        cell: ({ row }) => {
          if (row.original.status !== "completed" && row.original.status !== "failed") {
            return null;
          }
          return (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                title="View execution logs"
                className="gap-1"
                onClick={() => fetchLogs(row.original)}
              >
                <FileText className="h-3 w-3" />
                Logs
              </Button>
              <Button
                variant="ghost"
                size="sm"
                title="Create rollback"
                className="gap-1"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            </div>
          );
        },
      },
    ],
    [fetchLogs]
  );

  return (
    <>
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

      <Dialog open={!!selectedChange} onOpenChange={(open) => !open && setSelectedChange(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Execution Logs</DialogTitle>
            <DialogDescription>
              {selectedChange && (
                <>
                  <span className="capitalize">{selectedChange.operation}</span>{" "}
                  <strong>{selectedChange.targetName}</strong> on{" "}
                  <strong>{selectedChange.deviceHostname}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            {logsLoading ? (
              <div className="text-center py-4 text-muted-foreground">Loading logs...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                No execution logs available for this change.
              </div>
            ) : (
              <div className="space-y-4">
                {logs.map((log) => (
                  <div key={log.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <code className="bg-muted px-2 py-1 rounded font-mono text-xs">
                        {log.command}
                      </code>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>Exit: {log.exitCode}</span>
                        <span>{log.duration}ms</span>
                      </div>
                    </div>
                    {log.stdout && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-muted-foreground">Output:</div>
                        <pre className="bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                          {log.stdout}
                        </pre>
                      </div>
                    )}
                    {log.stderr && (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-destructive">Error:</div>
                        <pre className="bg-destructive/10 text-destructive p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
                          {log.stderr}
                        </pre>
                      </div>
                    )}
                    {!log.stdout && !log.stderr && (
                      <div className="text-xs text-muted-foreground italic">
                        No output
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
