import { useCallback, useMemo, useState } from "react";
import {
  Check,
  X,
  AlertTriangle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import type { ChangeStatus, ChangeImpact, ChangeCategory } from "@/store";

interface ChangeRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  category: ChangeCategory;
  operation: string;
  targetName: string;
  impact: ChangeImpact;
  status: ChangeStatus;
  requiresReboot: boolean;
  createdAt: number;
  uciCommands: string[];
  sshCommands: string[];
}

const impactConfig: Record<
  ChangeImpact,
  { label: string; variant: "destructive" | "warning" | "secondary" | "default" }
> = {
  critical: { label: "Critical", variant: "destructive" },
  high: { label: "High", variant: "warning" },
  medium: { label: "Medium", variant: "secondary" },
  low: { label: "Low", variant: "default" },
};

const categoryConfig: Record<ChangeCategory, { label: string; color: string }> = {
  network: { label: "Network", color: "text-blue-500" },
  wireless: { label: "Wireless", color: "text-purple-500" },
  firewall: { label: "Firewall", color: "text-red-500" },
  dhcp: { label: "DHCP", color: "text-green-500" },
  sqm: { label: "QoS", color: "text-yellow-500" },
  packages: { label: "Packages", color: "text-cyan-500" },
  mesh: { label: "Mesh", color: "text-pink-500" },
  system: { label: "System", color: "text-orange-500" },
};

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Unknown";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface PendingChangesTableProps {
  globalActions?: React.ReactNode;
}

export function PendingChangesTable({ globalActions }: PendingChangesTableProps) {
  const changeIds = useRowIds("pendingChanges");
  const changesData = useTable("pendingChanges");
  const devicesData = useTable("openwrtDevices");
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const approveChange = useCallback(async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));

    try {
      const res = await fetch(`/api/openwrt/changes/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewedBy: "admin" }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("Failed to approve:", data.error);
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const rejectChange = useCallback(async (id: string) => {
    setProcessingIds((prev) => new Set(prev).add(id));

    try {
      await fetch(`/api/openwrt/changes/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewedBy: "admin", reason: "Rejected by user" }),
      });
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const data = useMemo<ChangeRow[]>(() => {
    return changeIds
      .map((id) => {
        const row = changesData[id] || {};
        const status = (row.status as string) || "pending";

        // Only show pending changes in this table
        if (status !== "pending") return null;

        const deviceId = (row.deviceId as string) || "";
        const device = devicesData[deviceId] || {};

        let uciCommands: string[] = [];
        let sshCommands: string[] = [];
        try {
          uciCommands = JSON.parse((row.uciCommands as string) || "[]");
        } catch {
          uciCommands = [];
        }
        try {
          sshCommands = JSON.parse((row.sshCommands as string) || "[]");
        } catch {
          sshCommands = [];
        }

        return {
          id,
          deviceId,
          deviceHostname: (device.hostname as string) || deviceId,
          category: ((row.category as string) || "system") as ChangeCategory,
          operation: (row.operation as string) || "update",
          targetName: (row.targetName as string) || "",
          impact: ((row.impact as string) || "low") as ChangeImpact,
          status: status as ChangeStatus,
          requiresReboot: (row.requiresReboot as boolean) || false,
          createdAt: (row.createdAt as number) || 0,
          uciCommands,
          sshCommands,
        };
      })
      .filter((row): row is ChangeRow => row !== null)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [changeIds, changesData, devicesData]);

  const columns = useMemo<ColumnDef<ChangeRow>[]>(
    () => [
      {
        id: "expander",
        size: 40,
        header: () => null,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => toggleExpanded(row.original.id)}
          >
            {expandedIds.has(row.original.id) ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ),
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
        cell: ({ row }) => {
          const config = categoryConfig[row.original.category];
          return (
            <span className={`font-medium ${config?.color || ""}`}>
              {config?.label || row.original.category}
            </span>
          );
        },
      },
      {
        accessorKey: "operation",
        header: "Operation",
        size: 100,
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.original.operation}
          </Badge>
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
        accessorKey: "impact",
        header: "Impact",
        size: 100,
        cell: ({ row }) => {
          const config = impactConfig[row.original.impact];
          return (
            <div className="flex items-center gap-1">
              {(row.original.impact === "critical" || row.original.impact === "high") && (
                <AlertTriangle className="h-3 w-3 text-warning" />
              )}
              <Badge variant={config?.variant || "default"}>
                {config?.label || row.original.impact}
              </Badge>
            </div>
          );
        },
      },
      {
        accessorKey: "requiresReboot",
        header: "Reboot",
        size: 80,
        cell: ({ row }) =>
          row.original.requiresReboot ? (
            <Badge variant="destructive">Yes</Badge>
          ) : (
            <span className="text-muted-foreground">No</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        size: 100,
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatTimeAgo(row.original.createdAt)}
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 120,
        enableHiding: false,
        cell: ({ row }) => {
          const isProcessing = processingIds.has(row.original.id);
          return (
            <div className="flex gap-1">
              <Button
                variant="default"
                size="sm"
                title="Approve and execute"
                onClick={() => approveChange(row.original.id)}
                disabled={isProcessing}
                className="gap-1"
              >
                {isProcessing ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                Approve
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title="Reject"
                onClick={() => rejectChange(row.original.id)}
                disabled={isProcessing}
              >
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        },
      },
    ],
    [processingIds, approveChange, rejectChange, expandedIds]
  );

  const renderSubComponent = ({ row }: { row: { original: ChangeRow } }) => {
    if (!expandedIds.has(row.original.id)) return null;

    const hasUciCommands = row.original.uciCommands.length > 0;
    const hasSshCommands = row.original.sshCommands.length > 0;
    const hasAnyCommands = hasUciCommands || hasSshCommands;

    return (
      <div className="px-4 py-3 bg-muted/50 border-t">
        <div className="text-sm font-medium mb-2">
          {hasUciCommands ? "UCI Commands" : hasSshCommands ? "SSH Commands" : "Commands"} to Execute:
        </div>
        <div className="bg-background rounded border p-3 font-mono text-xs space-y-1">
          {hasAnyCommands ? (
            <>
              {hasUciCommands && row.original.uciCommands.map((cmd, i) => (
                <div key={`uci-${i}`} className="text-muted-foreground">
                  $ {cmd}
                </div>
              ))}
              {hasSshCommands && row.original.sshCommands.map((cmd, i) => (
                <div key={`ssh-${i}`} className="text-muted-foreground">
                  $ {cmd}
                </div>
              ))}
            </>
          ) : (
            <div className="text-muted-foreground">No commands</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full">
      <DataTable
        columns={columns}
        data={data}
        filterColumn="targetName"
        filterPlaceholder="Filter by target..."
        className="h-full"
        globalActions={globalActions}
      />
      {data.map((row) => expandedIds.has(row.id) && (
        <Collapsible key={row.id} open={expandedIds.has(row.id)}>
          <CollapsibleContent>
            {renderSubComponent({ row: { original: row } })}
          </CollapsibleContent>
        </Collapsible>
      ))}
    </div>
  );
}
