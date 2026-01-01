import { useMemo, useState } from "react";
import {
  Waypoints,
  Settings2,
  SignalHigh,
  SignalMedium,
  SignalLow,
  Link,
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
import { MeshConfigForm } from "./MeshConfigForm";

interface MeshNodeRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  meshId: string;
  macAddress: string;
  protocol: string;
  role: string;
  channel: number;
  neighbors: number;
  txRate: number;
  rxRate: number;
  metric: number;
  lastSeen: number;
  active: boolean;
}

function getSignalIcon(metric: number) {
  // Lower metric = better path
  if (metric < 100) return SignalHigh;
  if (metric < 500) return SignalMedium;
  return SignalLow;
}

function getSignalColor(metric: number): string {
  if (metric < 100) return "text-green-500";
  if (metric < 500) return "text-yellow-500";
  return "text-red-500";
}

function formatRate(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(1)} Gbps`;
  }
  return `${mbps} Mbps`;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Unknown";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const protocolConfig: Record<string, { label: string; color: string }> = {
  "802.11s": { label: "802.11s", color: "text-blue-500" },
  "batman-adv": { label: "B.A.T.M.A.N.", color: "text-purple-500" },
  babel: { label: "Babel", color: "text-green-500" },
};

const roleConfig: Record<string, { label: string; color: string }> = {
  gate: { label: "Gateway", color: "text-primary" },
  node: { label: "Node", color: "text-muted-foreground" },
  leaf: { label: "Leaf", color: "text-muted-foreground" },
};

interface MeshNodesTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function MeshNodesTable({ deviceId, globalActions }: MeshNodesTableProps) {
  const nodeIds = useRowIds("meshNodes");
  const nodesData = useTable("meshNodes");
  const devicesData = useTable("openwrtDevices");
  const [isConfiguring, setIsConfiguring] = useState(false);

  const data = useMemo<MeshNodeRow[]>(() => {
    return nodeIds
      .map((id) => {
        const row = nodesData[id] || {};
        const devId = (row.deviceId as string) || "";

        if (deviceId && devId !== deviceId) return null;

        const device = devicesData[devId] || {};

        return {
          id,
          deviceId: devId,
          deviceHostname: (device.hostname as string) || devId,
          meshId: (row.meshId as string) || "",
          macAddress: (row.macAddress as string) || "",
          protocol: (row.protocol as string) || "802.11s",
          role: (row.role as string) || "node",
          channel: (row.channel as number) || 0,
          neighbors: (row.neighbors as number) || 0,
          txRate: (row.txRate as number) || 0,
          rxRate: (row.rxRate as number) || 0,
          metric: (row.metric as number) || 0,
          lastSeen: (row.lastSeen as number) || 0,
          active: (row.active as boolean) ?? true,
        };
      })
      .filter((row): row is MeshNodeRow => row !== null);
  }, [nodeIds, nodesData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<MeshNodeRow>[]>(
    () => [
      {
        accessorKey: "deviceHostname",
        header: "Node",
        size: 180,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Waypoints className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{row.original.deviceHostname}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {row.original.macAddress}
              </div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "protocol",
        header: "Protocol",
        size: 120,
        cell: ({ row }) => {
          const config = protocolConfig[row.original.protocol] || {
            label: row.original.protocol,
            color: "",
          };
          return (
            <Badge variant="outline" className={config.color}>
              {config.label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "role",
        header: "Role",
        size: 100,
        cell: ({ row }) => {
          const config = roleConfig[row.original.role] || roleConfig.node;
          return (
            <span className={`font-medium ${config.color}`}>{config.label}</span>
          );
        },
      },
      {
        accessorKey: "neighbors",
        header: "Neighbors",
        size: 100,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Link className="h-3 w-3 text-muted-foreground" />
            <span>{row.original.neighbors}</span>
          </div>
        ),
      },
      {
        accessorKey: "metric",
        header: "Path Quality",
        size: 120,
        cell: ({ row }) => {
          const SignalIcon = getSignalIcon(row.original.metric);
          const color = getSignalColor(row.original.metric);
          return (
            <div className={`flex items-center gap-1 ${color}`}>
              <SignalIcon className="h-4 w-4" />
              <span className="text-sm">{row.original.metric}</span>
            </div>
          );
        },
      },
      {
        id: "rates",
        header: "Link Rate",
        size: 140,
        accessorFn: (row) => Math.max(row.rxRate, row.txRate),
        sortingFn: "basic",
        cell: ({ row }) => (
          <div className="text-sm">
            <div>TX: {formatRate(row.original.txRate)}</div>
            <div className="text-muted-foreground">
              RX: {formatRate(row.original.rxRate)}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "active",
        header: "Status",
        size: 100,
        cell: ({ row }) => (
          <Badge variant={row.original.active ? "success" : "secondary"}>
            {row.original.active ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        accessorKey: "lastSeen",
        header: "Last Seen",
        size: 100,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatTimeAgo(row.original.lastSeen)}
          </span>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 80,
        enableHiding: false,
        cell: ({ row }) => (
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" title="Configure mesh">
                <Settings2 className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Mesh Configuration: {row.original.deviceHostname}</SheetTitle>
                <SheetDescription>
                  Configure mesh networking settings. Changes will be queued for approval.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6">
                <MeshConfigForm nodeData={row.original} />
              </div>
            </SheetContent>
          </Sheet>
        ),
      },
    ],
    []
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="deviceHostname"
      filterPlaceholder="Filter by node..."
      className="h-full"
      facetedFilters={[
        {
          column: "protocol",
          title: "Protocol",
          options: [
            { label: "802.11s", value: "802.11s" },
            { label: "B.A.T.M.A.N.", value: "batman-adv" },
          ],
        },
        {
          column: "role",
          title: "Role",
          options: [
            { label: "Gateway", value: "gate" },
            { label: "Node", value: "node" },
          ],
        },
      ]}
      globalActions={
        <>
          {globalActions}
          <Sheet open={isConfiguring} onOpenChange={setIsConfiguring}>
            <SheetTrigger asChild>
              <Button className="gap-1">
                <Plus className="h-4 w-4" />
                Enable Mesh
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Enable Mesh Networking</SheetTitle>
                <SheetDescription>
                  Configure mesh networking on a device. The change will be queued for approval.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6">
                <MeshConfigForm
                  isNew
                  deviceId={deviceId}
                  onSuccess={() => setIsConfiguring(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      }
    />
  );
}
