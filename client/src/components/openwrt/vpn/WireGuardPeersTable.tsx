import { useMemo, useState, useCallback } from "react";
import {
  Shield,
  Settings2,
  Plus,
  Trash2,
  Copy,
  Check,
  Globe,
  Loader2,
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
import { WireGuardPeerForm } from "./WireGuardPeerForm";

interface WireGuardPeerRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  interface: string;
  publicKey: string;
  endpoint: string;
  allowedIps: string[];
  persistentKeepalive: number;
  latestHandshake: number;
  transferRx: number;
  transferTx: number;
  enabled: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatHandshake(timestamp: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function truncateKey(key: string): string {
  if (!key || key.length < 12) return key;
  return `${key.slice(0, 6)}...${key.slice(-6)}`;
}

interface WireGuardPeersTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function WireGuardPeersTable({ deviceId, globalActions }: WireGuardPeersTableProps) {
  const peerIds = useRowIds("wireguardPeers");
  const peersData = useTable("wireguardPeers");
  const devicesData = useTable("openwrtDevices");
  const [isCreating, setIsCreating] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  const queueDelete = useCallback(async (devId: string, peerId: string) => {
    if (!confirm("Queue deletion of this WireGuard peer?")) return;

    setDeletingIds((prev) => new Set(prev).add(peerId));
    try {
      await fetch(`/api/openwrt/devices/${devId}/wireguard/peers/${peerId}`, {
        method: "DELETE",
      });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(peerId);
        return next;
      });
    }
  }, []);

  const data = useMemo<WireGuardPeerRow[]>(() => {
    const result: WireGuardPeerRow[] = [];
    for (const id of peerIds) {
      const row = peersData[id] || {};
      const devId = (row.deviceId as string) || "";

      if (deviceId && devId !== deviceId) continue;

      const device = devicesData[devId] || {};

      let allowedIps: string[] = [];
      try {
        allowedIps = JSON.parse((row.allowedIps as string) || "[]");
      } catch {
        allowedIps = [(row.allowedIps as string) || ""];
      }

      result.push({
        id,
        deviceId: devId,
        deviceHostname: (device.hostname as string) || devId,
        interface: (row.interface as string) || "wg0",
        publicKey: (row.publicKey as string) || "",
        endpoint: (row.endpoint as string) || "",
        allowedIps,
        persistentKeepalive: (row.persistentKeepalive as number) || 0,
        latestHandshake: (row.latestHandshake as number) || 0,
        transferRx: (row.transferRx as number) || 0,
        transferTx: (row.transferTx as number) || 0,
        enabled: (row.enabled as boolean) ?? true,
      });
    }
    return result;
  }, [peerIds, peersData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<WireGuardPeerRow>[]>(
    () => [
      {
        accessorKey: "publicKey",
        header: "Peer",
        size: 180,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-500" />
            <div>
              <div className="font-mono text-sm flex items-center gap-1">
                {truncateKey(row.original.publicKey)}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => copyToClipboard(row.original.publicKey, row.original.id)}
                >
                  {copiedKey === row.original.id ? (
                    <Check className="h-3 w-3 text-green-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {row.original.interface}
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
              cell: ({ row }: { row: { original: WireGuardPeerRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<WireGuardPeerRow>,
          ]
        : []),
      {
        accessorKey: "endpoint",
        header: "Endpoint",
        size: 160,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Globe className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono text-sm">
              {row.original.endpoint || "Dynamic"}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "allowedIps",
        header: "Allowed IPs",
        size: 180,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.allowedIps.slice(0, 2).map((ip) => (
              <Badge key={ip} variant="outline" className="font-mono text-xs">
                {ip}
              </Badge>
            ))}
            {row.original.allowedIps.length > 2 && (
              <Badge variant="secondary" className="text-xs">
                +{row.original.allowedIps.length - 2}
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: "transfer",
        header: "Transfer",
        size: 140,
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="text-green-500">↓ {formatBytes(row.original.transferRx)}</div>
            <div className="text-blue-500">↑ {formatBytes(row.original.transferTx)}</div>
          </div>
        ),
      },
      {
        accessorKey: "latestHandshake",
        header: "Handshake",
        size: 100,
        cell: ({ row }) => {
          const recent = row.original.latestHandshake > Date.now() - 180000;
          return (
            <span className={`text-sm ${recent ? "text-green-500" : "text-muted-foreground"}`}>
              {formatHandshake(row.original.latestHandshake)}
            </span>
          );
        },
      },
      {
        accessorKey: "enabled",
        header: "Status",
        size: 80,
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? "success" : "secondary"}>
            {row.original.enabled ? "Active" : "Disabled"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 100,
        enableHiding: false,
        cell: ({ row }) => {
          const isDeleting = deletingIds.has(row.original.id);
          return (
            <div className="flex gap-1">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" title="Edit peer">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-lg overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Edit WireGuard Peer</SheetTitle>
                    <SheetDescription>
                      Configure peer settings. Changes will be queued for approval.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6">
                    <WireGuardPeerForm peerData={row.original} />
                  </div>
                </SheetContent>
              </Sheet>
              <Button
                variant="ghost"
                size="icon"
                title="Delete peer"
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
    [deviceId, copiedKey, copyToClipboard, deletingIds, queueDelete]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="publicKey"
      filterPlaceholder="Filter by public key..."
      className="h-full"
      globalActions={
        <>
          {globalActions}
          <Sheet open={isCreating} onOpenChange={setIsCreating}>
            <SheetTrigger asChild>
              <Button className="gap-1">
                <Plus className="h-4 w-4" />
                Add Peer
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Add WireGuard Peer</SheetTitle>
                <SheetDescription>
                  Configure a new WireGuard peer. The change will be queued for approval.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6">
                <WireGuardPeerForm
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
