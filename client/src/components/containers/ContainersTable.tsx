import { useMemo } from "react";
import { Container, Trash2, GitBranch, FolderGit2 } from "lucide-react";
import { useRowIds, useTable, useStore } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { ContainerStatusBadge } from "./ContainerStatusBadge";
import type { ContainerStatus } from "@/store";

interface ContainerRow {
  id: string;
  hostname: string;
  tailscaleIp: string;
  repo: string;
  branch: string;
  status: ContainerStatus;
  lastSeen: number;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatRepo(repo: string): string {
  if (!repo) return "-";
  const match = repo.match(/github\.com[:/]([^/]+\/[^/.]+)/);
  return match ? match[1] : repo;
}

interface ContainersTableProps {
  globalActions?: React.ReactNode;
}

export function ContainersTable({ globalActions }: ContainersTableProps) {
  const store = useStore();
  const containerIds = useRowIds("containers");
  const containersData = useTable("containers");

  const data = useMemo<ContainerRow[]>(() => {
    return containerIds.map((id) => {
      const row = containersData[id] || {};
      return {
        id,
        hostname: (row.hostname as string) || "",
        tailscaleIp: (row.tailscaleIp as string) || "",
        repo: (row.repo as string) || "",
        branch: (row.branch as string) || "",
        status: ((row.status as string) || "stopped") as ContainerStatus,
        lastSeen: (row.lastSeen as number) || 0,
      };
    });
  }, [containerIds, containersData]);

  const columns = useMemo<ColumnDef<ContainerRow>[]>(
    () => [
      {
        accessorKey: "hostname",
        header: "Hostname",
        size: 150,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <Container className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{row.original.hostname}</span>
          </div>
        ),
      },
      {
        accessorKey: "tailscaleIp",
        header: "IP",
        size: 115,
        cell: ({ row }) => (
          <span className="font-mono text-sm truncate block">{row.original.tailscaleIp}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 90,
        filterFn: (row, id, value) => {
          return value.includes(row.getValue(id));
        },
        cell: ({ row }) => <ContainerStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "repo",
        header: "Repository",
        size: 150,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <FolderGit2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{formatRepo(row.original.repo)}</span>
          </div>
        ),
      },
      {
        accessorKey: "branch",
        header: "Branch",
        size: 110,
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{row.original.branch || "-"}</span>
          </div>
        ),
      },
      {
        accessorKey: "lastSeen",
        header: "Last Seen",
        size: 90,
        cell: ({ row }) => (
          <span
            className={`text-sm truncate block ${row.original.status === "connected" ? "text-success" : "text-muted-foreground"}`}
          >
            {row.original.status === "connected"
              ? "Online"
              : formatTimeAgo(row.original.lastSeen)}
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
            store?.delRow("containers", row.original.id);
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
            { label: "Running", value: "running" },
            { label: "Starting", value: "starting" },
            { label: "Stopped", value: "stopped" },
            { label: "Error", value: "error" },
          ],
        },
      ]}
      globalActions={globalActions}
    />
  );
}
