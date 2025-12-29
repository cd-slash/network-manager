import { useMemo } from "react";
import { Bot, Trash2, Container, MessageSquare, Coins, RefreshCw, Loader2, AlertCircle, Activity } from "lucide-react";
import { useRowIds, useTable, useStore } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentStatusBadge } from "./AgentStatusBadge";
import type { AgentStatus } from "@/store";

interface AgentRow {
  id: string;
  containerId: string;
  containerHostname: string;
  type: string;
  status: AgentStatus;
  tokensUsed: number;
  messagesCount: number;
  costEstimate: number;
  lastActivity: number;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatTokens(tokens: number): string {
  if (!tokens) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return tokens.toString();
}

function formatCost(cost: number): string {
  if (!cost) return "$0.00";
  return `$${cost.toFixed(2)}`;
}

interface UsageData {
  tokensUsed: number;
  tokensLimit: number;
  messagesCount: number;
  costEstimate: number;
}

interface AgentsTableProps {
  globalActions?: React.ReactNode;
  usageData?: UsageData | null;
  usageLoading?: boolean;
  usageError?: string | null;
  onRefreshUsage?: () => void;
}

export function AgentsTable({
  globalActions,
  usageData,
  usageLoading,
  usageError,
  onRefreshUsage,
}: AgentsTableProps) {
  const store = useStore();
  const agentIds = useRowIds("agents");
  const agentsData = useTable("agents");

  const data = useMemo<AgentRow[]>(() => {
    return agentIds.map((id) => {
      const row = agentsData[id] || {};
      return {
        id,
        containerId: (row.containerId as string) || "",
        containerHostname: (row.containerHostname as string) || "",
        type: (row.type as string) || "",
        status: ((row.status as string) || "idle") as AgentStatus,
        tokensUsed: (row.tokensUsed as number) || 0,
        messagesCount: (row.messagesCount as number) || 0,
        costEstimate: (row.costEstimate as number) || 0,
        lastActivity: (row.lastActivity as number) || 0,
      };
    });
  }, [agentIds, agentsData]);

  const columns = useMemo<ColumnDef<AgentRow>[]>(
    () => [
      {
        accessorKey: "containerHostname",
        header: "Container",
        size: 150,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <Container className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{row.original.containerHostname || "-"}</span>
          </div>
        ),
      },
      {
        accessorKey: "type",
        header: "Agent",
        size: 100,
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate capitalize">{row.original.type || "-"}</span>
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 90,
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
        cell: ({ row }) => <AgentStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "tokensUsed",
        header: "Tokens",
        size: 80,
        cell: ({ row }) => (
          <span className="font-mono text-sm">{formatTokens(row.original.tokensUsed)}</span>
        ),
      },
      {
        accessorKey: "messagesCount",
        header: "Messages",
        size: 90,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-mono text-sm">{row.original.messagesCount}</span>
          </div>
        ),
      },
      {
        accessorKey: "costEstimate",
        header: "Cost",
        size: 80,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <Coins className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="font-mono text-sm">{formatCost(row.original.costEstimate)}</span>
          </div>
        ),
      },
      {
        accessorKey: "lastActivity",
        header: "Last Activity",
        size: 100,
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm truncate block">
            {formatTimeAgo(row.original.lastActivity)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        size: 50,
        enableHiding: false,
        cell: ({ row }) => {
          const handleDelete = () => {
            store?.delRow("agents", row.original.id);
          };
          return (
            <Button
              variant="ghost"
              size="icon"
              title="Remove"
              onClick={handleDelete}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          );
        },
      },
    ],
    [store]
  );

  const usagePercentage = usageData && usageData.tokensLimit > 0
    ? Math.round((usageData.tokensUsed / usageData.tokensLimit) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Usage Summary Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Claude Code Usage
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshUsage}
            disabled={usageLoading}
          >
            {usageLoading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {usageError ? (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{usageError}</span>
            </div>
          ) : usageData ? (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Tokens</p>
                <p className="text-lg font-semibold font-mono">
                  {usageData.tokensLimit > 0 ? (
                    <>
                      {formatTokens(usageData.tokensUsed)} / {formatTokens(usageData.tokensLimit)}
                    </>
                  ) : (
                    formatTokens(usageData.tokensUsed)
                  )}
                </p>
                {usageData.tokensLimit > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {usagePercentage}% used
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Messages</p>
                <p className="text-lg font-semibold font-mono flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  {usageData.messagesCount.toLocaleString()}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Estimated Cost</p>
                <p className="text-lg font-semibold font-mono flex items-center gap-2">
                  <Coins className="h-4 w-4 text-muted-foreground" />
                  {formatCost(usageData.costEstimate)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {usageLoading ? "Loading usage data..." : "No usage data available"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Agents Table */}
      <div className="flex-1 min-h-0">
        <DataTable
          columns={columns}
          data={data}
          filterColumn="containerHostname"
          filterPlaceholder="Filter by container..."
          className="h-full"
          facetedFilters={[
            {
              column: "status",
              title: "Status",
              options: [
                { label: "Idle", value: "idle" },
                { label: "Working", value: "working" },
                { label: "Paused", value: "paused" },
                { label: "Error", value: "error" },
              ],
            },
            {
              column: "type",
              title: "Agent",
              options: [
                { label: "Claude", value: "claude" },
                { label: "Gemini", value: "gemini" },
                { label: "Codex", value: "codex" },
              ],
            },
          ]}
          globalActions={globalActions}
        />
      </div>
    </div>
  );
}
