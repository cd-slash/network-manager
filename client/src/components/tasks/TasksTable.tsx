import { useMemo } from "react";
import { CheckCircle2, Clock, GitPullRequest, Play, Trash2 } from "lucide-react";
import { useRowIds, useTable, useStore } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { TaskStatusBadge } from "./TaskStatusBadge";
import type { TaskStatus } from "@/store";

interface TasksTableProps {
  globalActions?: React.ReactNode;
  onStartTask?: (taskId: string) => void;
  onTaskClick?: (taskId: string) => void;
}

interface TaskRow {
  id: string;
  phaseId: string;
  phaseName: string;
  type: string;
  title: string;
  description: string;
  status: TaskStatus;
  containerId: string;
  containerHostname: string;
  agentId: string;
  agentType: string;
  prUrl: string;
  prNumber: number;
  createdAt: number;
  startedAt: number;
  completedAt: number;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface TasksTableProps {
  globalActions?: React.ReactNode;
  onStartTask?: (taskId: string) => void;
}

export function TasksTable({ globalActions, onStartTask, onTaskClick }: TasksTableProps) {
  const store = useStore();
  const taskIds = useRowIds("tasks");
  const tasksData = useTable("tasks");

  const data = useMemo<TaskRow[]>(() => {
    return taskIds.map((id) => {
      const row = tasksData[id] || {};
      const phaseId = row.phaseId as string;
      const phaseData = phaseId ? (store?.getCell("phases", phaseId, "name") as string) : "";
      
      const containerId = row.containerId as string;
      const containerData = containerId ? (store?.getCell("containers", containerId, "hostname") as string) : "";
      
      const agentId = row.agentId as string;
      const agentData = agentId ? (store?.getCell("agents", agentId, "type") as string) : "";

      return {
        id,
        phaseId,
        phaseName: phaseData || "",
        type: (row.type as string) || "",
        title: (row.title as string) || "",
        description: (row.description as string) || "",
        status: ((row.status as string) || "pending") as TaskStatus,
        containerId,
        containerHostname: containerData || "",
        agentId,
        agentType: agentData || "",
        prUrl: (row.prUrl as string) || "",
        prNumber: (row.prNumber as number) || 0,
        createdAt: (row.createdAt as number) || 0,
        startedAt: (row.startedAt as number) || 0,
        completedAt: (row.completedAt as number) || 0,
      };
    });
  }, [taskIds, tasksData, store]);

  const columns = useMemo<ColumnDef<TaskRow>[]>(
    () => [
      {
        accessorKey: "title",
        header: "Task",
        size: 200,
        minSize: 150,
        cell: ({ row }) => (
          <button
            onClick={() => onTaskClick?.(row.original.id)}
            className="min-w-0 text-left hover:text-primary transition-colors"
          >
            <div className="font-medium truncate">{row.original.title || "-"}</div>
            <div className="text-muted-foreground text-xs truncate">{row.original.description || ""}</div>
          </button>
        ),
      },
      {
        accessorKey: "type",
        header: "Type",
        size: 80,
        minSize: 60,
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
        cell: ({ row }) => (
          <span className="text-sm truncate block capitalize">{row.original.type || "-"}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 100,
        minSize: 80,
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
        cell: ({ row }) => <TaskStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "phaseName",
        header: "Phase",
        size: 100,
        minSize: 70,
        cell: ({ row }) => (
          <span className="text-sm truncate block">{row.original.phaseName || "-"}</span>
        ),
      },
      {
        id: "assignment",
        header: "Assignment",
        size: 120,
        minSize: 100,
        cell: ({ row }) => {
          const { containerHostname, agentType } = row.original;
          if (containerHostname && agentType) {
            return (
              <div className="text-sm truncate flex items-center gap-1">
                <span>{containerHostname}</span>
                <span className="text-muted-foreground">•</span>
                <span className="capitalize">{agentType}</span>
              </div>
            );
          }
          return <span className="text-muted-foreground text-sm truncate">Unassigned</span>;
        },
      },
      {
        id: "pr",
        header: "PR",
        size: 70,
        minSize: 60,
        cell: ({ row }) => {
          if (row.original.prUrl) {
            return (
              <a
                href={row.original.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-sm hover:underline flex items-center gap-1"
              >
                <GitPullRequest className="h-3 w-3" />
                #{row.original.prNumber}
              </a>
            );
          }
          return <span className="text-muted-foreground text-sm">-</span>;
        },
      },
      {
        id: "timing",
        header: "Timing",
        size: 100,
        minSize: 80,
        cell: ({ row }) => {
          const { status, createdAt, startedAt, completedAt } = row.original;
          if (status === "pending" && createdAt) {
            return (
              <div className="text-sm truncate flex items-center gap-1">
                <Clock className="h-3 w-3 text-muted-foreground" />
                {formatTimeAgo(createdAt)}
              </div>
            );
          }
          if (status !== "pending" && status !== "completed" && startedAt) {
            return (
              <div className="text-sm truncate flex items-center gap-1">
                <Play className="h-3 w-3 text-muted-foreground" />
                {formatTimeAgo(startedAt)}
              </div>
            );
          }
          if (status === "completed" && completedAt) {
            return (
              <div className="text-sm truncate flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-muted-foreground" />
                {formatTimeAgo(completedAt)}
              </div>
            );
          }
          return <span className="text-muted-foreground text-sm">-</span>;
        },
      },
      {
        id: "actions",
        header: "",
        size: 70,
        minSize: 60,
        enableHiding: false,
        cell: ({ row }) => {
          const handleStart = () => {
            if (onStartTask) {
              onStartTask(row.original.id);
            }
          };
          const handleDelete = () => {
            store?.delRow("tasks", row.original.id);
          };
          
          const canStart = row.original.status === "pending";
          
          return (
            <div className="flex gap-1 justify-end">
              {canStart && onStartTask && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Start task"
                  onClick={handleStart}
                  className="h-8 w-8"
                >
                  <Play className="h-3 w-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                title="Remove"
                onClick={handleDelete}
                className="h-8 w-8"
              >
                <Trash2 className="h-3 w-3 text-destructive" />
              </Button>
            </div>
          );
        },
      },
    ],
    [store, onStartTask]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="title"
      filterPlaceholder="Filter by task..."
      className="h-full"
      facetedFilters={[
        {
          column: "status",
          title: "Status",
          options: [
            { label: "Pending", value: "pending" },
            { label: "Spawning", value: "spawning" },
            { label: "Implementing", value: "implementing" },
            { label: "Reviewing", value: "reviewing" },
            { label: "Ready", value: "ready" },
            { label: "Approved", value: "approved" },
            { label: "Merging", value: "merging" },
            { label: "Completed", value: "completed" },
          ],
        },
        {
          column: "type",
          title: "Type",
          options: [
            { label: "Feature", value: "feature" },
            { label: "Bug", value: "bug" },
            { label: "Refactor", value: "refactor" },
            { label: "Test", value: "test" },
            { label: "Docs", value: "docs" },
          ],
        },
      ]}
      globalActions={globalActions}
    />
  );
}
