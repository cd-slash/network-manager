import { useCallback, useMemo, useState } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Settings2,
  RefreshCw,
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
import { ZoneForm } from "./ZoneForm";

interface ZoneRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  name: string;
  network: string[];
  input: string;
  output: string;
  forward: string;
  masq: boolean;
  mtuFix: boolean;
  conntrack: boolean;
}

const policyColors: Record<string, string> = {
  ACCEPT: "text-green-500",
  REJECT: "text-red-500",
  DROP: "text-red-700",
};

const policyIcons: Record<string, typeof Shield> = {
  ACCEPT: ShieldCheck,
  REJECT: ShieldX,
  DROP: ShieldX,
};

interface ZonesTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function ZonesTable({ deviceId, globalActions }: ZonesTableProps) {
  const zoneIds = useRowIds("firewallZones");
  const zonesData = useTable("firewallZones");
  const devicesData = useTable("openwrtDevices");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const syncZones = useCallback(async (devId: string, host: string) => {
    setSyncingIds((prev) => new Set(prev).add(devId));
    try {
      await fetch(`/api/openwrt/devices/${devId}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host }),
      });
    } finally {
      setSyncingIds((prev) => {
        const next = new Set(prev);
        next.delete(devId);
        return next;
      });
    }
  }, []);

  const data = useMemo<ZoneRow[]>(() => {
    return zoneIds
      .map((id) => {
        const row = zonesData[id] || {};
        const devId = (row.deviceId as string) || "";

        if (deviceId && devId !== deviceId) return null;

        const device = devicesData[devId] || {};

        let networks: string[] = [];
        try {
          networks = JSON.parse((row.network as string) || "[]");
        } catch {
          networks = [(row.network as string) || ""];
        }

        return {
          id,
          deviceId: devId,
          deviceHostname: (device.hostname as string) || devId,
          name: (row.name as string) || "",
          network: networks,
          input: (row.input as string) || "REJECT",
          output: (row.output as string) || "ACCEPT",
          forward: (row.forward as string) || "REJECT",
          masq: (row.masq as boolean) || false,
          mtuFix: (row.mtuFix as boolean) || false,
          conntrack: (row.conntrack as boolean) ?? true,
        };
      })
      .filter((row): row is ZoneRow => row !== null);
  }, [zoneIds, zonesData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<ZoneRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Zone",
        size: 140,
        cell: ({ row }) => {
          const name = row.original.name.toLowerCase();
          const isWan = name === "wan";
          const isLan = name === "lan";
          return (
            <div className="flex items-center gap-2">
              <Shield
                className={`h-4 w-4 ${
                  isWan ? "text-red-500" : isLan ? "text-green-500" : "text-muted-foreground"
                }`}
              />
              <span className="font-medium uppercase">{row.original.name}</span>
            </div>
          );
        },
      },
      ...(!deviceId
        ? [
            {
              accessorKey: "deviceHostname",
              header: "Device",
              size: 120,
              cell: ({ row }: { row: { original: ZoneRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<ZoneRow>,
          ]
        : []),
      {
        accessorKey: "network",
        header: "Networks",
        size: 160,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.network.map((net) => (
              <Badge key={net} variant="outline" className="text-xs">
                {net}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "input",
        header: "Input",
        size: 100,
        cell: ({ row }) => {
          const policy = row.original.input;
          const Icon = policyIcons[policy] || Shield;
          return (
            <div className={`flex items-center gap-1 ${policyColors[policy] || ""}`}>
              <Icon className="h-3 w-3" />
              <span className="text-xs">{policy}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "output",
        header: "Output",
        size: 100,
        cell: ({ row }) => {
          const policy = row.original.output;
          const Icon = policyIcons[policy] || Shield;
          return (
            <div className={`flex items-center gap-1 ${policyColors[policy] || ""}`}>
              <Icon className="h-3 w-3" />
              <span className="text-xs">{policy}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "forward",
        header: "Forward",
        size: 100,
        cell: ({ row }) => {
          const policy = row.original.forward;
          const Icon = policyIcons[policy] || Shield;
          return (
            <div className={`flex items-center gap-1 ${policyColors[policy] || ""}`}>
              <Icon className="h-3 w-3" />
              <span className="text-xs">{policy}</span>
            </div>
          );
        },
      },
      {
        id: "options",
        header: "Options",
        size: 140,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.masq && (
              <Badge variant="secondary" className="text-xs">NAT</Badge>
            )}
            {row.original.mtuFix && (
              <Badge variant="secondary" className="text-xs">MTU Fix</Badge>
            )}
            {!row.original.conntrack && (
              <Badge variant="outline" className="text-xs">No CT</Badge>
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 100,
        enableHiding: false,
        cell: ({ row }) => {
          const isSyncing = syncingIds.has(row.original.deviceId);
          const device = devicesData[row.original.deviceId];
          const host = (device?.tailscaleIp as string) || "";

          return (
            <div className="flex gap-1">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" title="Edit zone">
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-lg">
                  <SheetHeader>
                    <SheetTitle>Edit Zone: {row.original.name}</SheetTitle>
                    <SheetDescription>
                      Configure firewall zone settings. Changes will be queued for approval.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6">
                    <ZoneForm zoneData={row.original} />
                  </div>
                </SheetContent>
              </Sheet>
              <Button
                variant="ghost"
                size="icon"
                title="Refresh"
                onClick={() => syncZones(row.original.deviceId, host)}
                disabled={isSyncing || !host}
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          );
        },
      },
    ],
    [deviceId, syncingIds, syncZones, devicesData]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="name"
      filterPlaceholder="Filter by zone name..."
      className="h-full"
      globalActions={globalActions}
    />
  );
}
