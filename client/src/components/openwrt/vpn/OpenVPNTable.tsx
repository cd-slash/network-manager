import { useMemo, useState, useCallback } from "react";
import {
  Network,
  Settings2,
  Plus,
  Play,
  Square,
  Trash2,
  Loader2,
  Upload,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OpenVPNForm } from "./OpenVPNForm";

interface OpenVPNRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  name: string;
  mode: string; // client | server
  protocol: string;
  port: number;
  device: string;
  remote: string;
  status: string;
  connectedClients: number;
  bytesIn: number;
  bytesOut: number;
  enabled: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface OpenVPNTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function OpenVPNTable({ deviceId, globalActions }: OpenVPNTableProps) {
  const vpnIds = useRowIds("openvpnInstances");
  const vpnData = useTable("openvpnInstances");
  const devicesData = useTable("openwrtDevices");
  const deviceIds = useRowIds("openwrtDevices");

  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importDeviceId, setImportDeviceId] = useState(deviceId || "");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [actionIds, setActionIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const queueAction = useCallback(async (devId: string, vpnId: string, action: string) => {
    setActionIds((prev) => new Set(prev).add(vpnId));
    try {
      await fetch(`/api/openwrt/devices/${devId}/openvpn/${vpnId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    } finally {
      setActionIds((prev) => {
        const next = new Set(prev);
        next.delete(vpnId);
        return next;
      });
    }
  }, []);

  const queueDelete = useCallback(async (devId: string, vpnId: string) => {
    if (!confirm("Queue deletion of this OpenVPN instance?")) return;

    setDeletingIds((prev) => new Set(prev).add(vpnId));
    try {
      await fetch(`/api/openwrt/devices/${devId}/openvpn/${vpnId}`, {
        method: "DELETE",
      });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(vpnId);
        return next;
      });
    }
  }, []);

  const handleImport = useCallback(async () => {
    if (!importDeviceId || !importFile) return;

    const formData = new FormData();
    formData.append("config", importFile);

    try {
      await fetch(`/api/openwrt/devices/${importDeviceId}/openvpn/import`, {
        method: "POST",
        body: formData,
      });
      setIsImporting(false);
      setImportFile(null);
    } catch (err) {
      console.error("Import failed:", err);
    }
  }, [importDeviceId, importFile]);

  const data = useMemo<OpenVPNRow[]>(() => {
    const result: OpenVPNRow[] = [];
    for (const id of vpnIds) {
      const row = vpnData[id] || {};
      const devId = (row.deviceId as string) || "";

      if (deviceId && devId !== deviceId) continue;

      const device = devicesData[devId] || {};

      result.push({
        id,
        deviceId: devId,
        deviceHostname: (device.hostname as string) || devId,
        name: (row.name as string) || "",
        mode: (row.mode as string) || "client",
        protocol: (row.protocol as string) || "udp",
        port: (row.port as number) || 1194,
        device: (row.device as string) || "tun0",
        remote: (row.remote as string) || "",
        status: (row.status as string) || "stopped",
        connectedClients: (row.connectedClients as number) || 0,
        bytesIn: (row.bytesIn as number) || 0,
        bytesOut: (row.bytesOut as number) || 0,
        enabled: (row.enabled as boolean) ?? true,
      });
    }
    return result;
  }, [vpnIds, vpnData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<OpenVPNRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Instance",
        size: 180,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-orange-500" />
            <div>
              <div className="font-medium">{row.original.name}</div>
              <div className="text-xs text-muted-foreground">
                {row.original.device}
              </div>
            </div>
          </div>
        ),
      },
      ...(!deviceId
        ? [
            {
              accessorKey: "deviceHostname",
              header: "Device",
              size: 120,
              cell: ({ row }: { row: { original: OpenVPNRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<OpenVPNRow>,
          ]
        : []),
      {
        accessorKey: "mode",
        header: "Mode",
        size: 100,
        cell: ({ row }) => (
          <Badge variant={row.original.mode === "server" ? "default" : "secondary"}>
            {row.original.mode === "server" ? "Server" : "Client"}
          </Badge>
        ),
      },
      {
        id: "connection",
        header: "Connection",
        size: 160,
        cell: ({ row }) => (
          <div className="text-sm font-mono">
            <div>
              {row.original.protocol.toUpperCase()}:{row.original.port}
            </div>
            {row.original.remote && (
              <div className="text-xs text-muted-foreground truncate max-w-[140px]">
                {row.original.remote}
              </div>
            )}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 100,
        cell: ({ row }) => {
          const status = row.original.status;
          const variant =
            status === "connected" || status === "running"
              ? "success"
              : status === "connecting"
              ? "default"
              : "secondary";
          return <Badge variant={variant}>{status}</Badge>;
        },
      },
      {
        id: "traffic",
        header: "Traffic",
        size: 140,
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="text-green-500">↓ {formatBytes(row.original.bytesIn)}</div>
            <div className="text-blue-500">↑ {formatBytes(row.original.bytesOut)}</div>
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 140,
        enableHiding: false,
        cell: ({ row }) => {
          const isActing = actionIds.has(row.original.id);
          const isDeleting = deletingIds.has(row.original.id);
          const isRunning =
            row.original.status === "connected" || row.original.status === "running";

          return (
            <div className="flex gap-1">
              {isRunning ? (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Stop"
                  onClick={() =>
                    queueAction(row.original.deviceId, row.original.id, "stop")
                  }
                  disabled={isActing}
                >
                  {isActing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4 text-red-500" />
                  )}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Start"
                  onClick={() =>
                    queueAction(row.original.deviceId, row.original.id, "start")
                  }
                  disabled={isActing}
                >
                  {isActing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 text-green-500" />
                  )}
                </Button>
              )}
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" title="Edit">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-lg overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Edit OpenVPN: {row.original.name}</SheetTitle>
                    <SheetDescription>
                      Configure OpenVPN settings. Changes will be queued for approval.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6">
                    <OpenVPNForm vpnData={row.original} />
                  </div>
                </SheetContent>
              </Sheet>
              <Button
                variant="ghost"
                size="icon"
                title="Delete"
                onClick={() => queueDelete(row.original.deviceId, row.original.id)}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 text-destructive" />
                )}
              </Button>
            </div>
          );
        },
      },
    ],
    [deviceId, actionIds, deletingIds, queueAction, queueDelete]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="name"
      filterPlaceholder="Filter by name..."
      className="h-full"
      facetedFilters={[
        {
          column: "mode",
          title: "Mode",
          options: [
            { label: "Client", value: "client" },
            { label: "Server", value: "server" },
          ],
        },
      ]}
      globalActions={
        <>
          {globalActions}
          <Dialog open={isImporting} onOpenChange={setIsImporting}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-1">
                <Upload className="h-4 w-4" />
                Import .ovpn
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import OpenVPN Configuration</DialogTitle>
                <DialogDescription>
                  Upload an .ovpn file to import the configuration.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {!deviceId && (
                  <div className="space-y-2">
                    <Label>Device</Label>
                    <Select value={importDeviceId} onValueChange={setImportDeviceId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select device" />
                      </SelectTrigger>
                      <SelectContent>
                        {deviceIds.map((id) => (
                          <SelectItem key={id} value={id}>
                            {(devicesData[id]?.hostname as string) || id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Configuration File</Label>
                  <Input
                    type="file"
                    accept=".ovpn,.conf"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsImporting(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!importDeviceId || !importFile}
                >
                  Import
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Sheet open={isCreating} onOpenChange={setIsCreating}>
            <SheetTrigger asChild>
              <Button className="gap-1">
                <Plus className="h-4 w-4" />
                Add OpenVPN
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Create OpenVPN Instance</SheetTitle>
                <SheetDescription>
                  Configure a new OpenVPN client or server.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6">
                <OpenVPNForm
                  isNew
                  deviceId={deviceId}
                  onSuccess={() => setIsCreating(false)}
                />
              </div>
            </SheetContent>
          </Sheet>
        </>
      }
    />
  );
}
