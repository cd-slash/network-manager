import { useCallback, useMemo, useState } from "react";
import {
  Radio,
  Settings2,
  RefreshCw,
  Loader2,
  Power,
  PowerOff,
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
import { RadioForm } from "./RadioForm";

interface RadioRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  name: string;
  type: string;
  hwmode: string;
  path: string;
  band: string;
  channel: number;
  htmode: string;
  txpower: number;
  country: string;
  disabled: boolean;
}

const bandConfig: Record<string, { label: string; color: string }> = {
  "2g": { label: "2.4 GHz", color: "text-green-500" },
  "5g": { label: "5 GHz", color: "text-blue-500" },
  "6g": { label: "6 GHz", color: "text-purple-500" },
};

const htmodeConfig: Record<string, string> = {
  HT20: "20 MHz",
  HT40: "40 MHz",
  VHT20: "20 MHz",
  VHT40: "40 MHz",
  VHT80: "80 MHz",
  VHT160: "160 MHz",
  HE20: "20 MHz",
  HE40: "40 MHz",
  HE80: "80 MHz",
  HE160: "160 MHz",
};

interface RadiosTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function RadiosTable({ deviceId, globalActions }: RadiosTableProps) {
  const radioIds = useRowIds("wirelessRadios");
  const radiosData = useTable("wirelessRadios");
  const devicesData = useTable("openwrtDevices");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());

  const syncRadios = useCallback(async (devId: string, host: string) => {
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

  const data = useMemo<RadioRow[]>(() => {
    return radioIds
      .map((id) => {
        const row = radiosData[id] || {};
        const devId = (row.deviceId as string) || "";

        if (deviceId && devId !== deviceId) return null;

        const device = devicesData[devId] || {};

        return {
          id,
          deviceId: devId,
          deviceHostname: (device.hostname as string) || devId,
          name: (row.name as string) || "",
          type: (row.type as string) || "mac80211",
          hwmode: (row.hwmode as string) || "",
          path: (row.path as string) || "",
          band: (row.band as string) || "",
          channel: (row.channel as number) || 0,
          htmode: (row.htmode as string) || "",
          txpower: (row.txpower as number) || 0,
          country: (row.country as string) || "US",
          disabled: (row.disabled as boolean) || false,
        };
      })
      .filter((row): row is RadioRow => row !== null);
  }, [radioIds, radiosData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<RadioRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Radio",
        size: 140,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{row.original.name}</div>
              <div className="text-xs text-muted-foreground">{row.original.type}</div>
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
              cell: ({ row }: { row: { original: RadioRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<RadioRow>,
          ]
        : []),
      {
        accessorKey: "band",
        header: "Band",
        size: 100,
        cell: ({ row }) => {
          const config = bandConfig[row.original.band] || { label: row.original.band || "-", color: "" };
          return (
            <span className={`font-medium ${config.color}`}>{config.label}</span>
          );
        },
      },
      {
        accessorKey: "channel",
        header: "Channel",
        size: 100,
        cell: ({ row }) => (
          <Badge variant="outline">
            Ch {row.original.channel || "Auto"}
          </Badge>
        ),
      },
      {
        accessorKey: "htmode",
        header: "Width",
        size: 100,
        cell: ({ row }) => (
          <span className="text-sm">
            {htmodeConfig[row.original.htmode] || row.original.htmode || "-"}
          </span>
        ),
      },
      {
        accessorKey: "txpower",
        header: "TX Power",
        size: 100,
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.txpower ? `${row.original.txpower} dBm` : "Auto"}
          </span>
        ),
      },
      {
        accessorKey: "country",
        header: "Country",
        size: 80,
        cell: ({ row }) => (
          <Badge variant="secondary">{row.original.country}</Badge>
        ),
      },
      {
        accessorKey: "disabled",
        header: "Status",
        size: 100,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {row.original.disabled ? (
              <>
                <PowerOff className="h-3 w-3 text-destructive" />
                <span className="text-destructive">Disabled</span>
              </>
            ) : (
              <>
                <Power className="h-3 w-3 text-green-500" />
                <span className="text-green-500">Enabled</span>
              </>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Configure radio"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="sm:max-w-lg">
                  <SheetHeader>
                    <SheetTitle>Configure Radio: {row.original.name}</SheetTitle>
                    <SheetDescription>
                      Configure wireless radio settings. Changes will be queued for approval.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6">
                    <RadioForm radioData={row.original} />
                  </div>
                </SheetContent>
              </Sheet>
              <Button
                variant="ghost"
                size="icon"
                title="Refresh"
                onClick={() => syncRadios(row.original.deviceId, host)}
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
    [deviceId, syncingIds, syncRadios, devicesData]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="name"
      filterPlaceholder="Filter by radio name..."
      className="h-full"
      facetedFilters={[
        {
          column: "band",
          title: "Band",
          options: [
            { label: "2.4 GHz", value: "2g" },
            { label: "5 GHz", value: "5g" },
            { label: "6 GHz", value: "6g" },
          ],
        },
      ]}
      globalActions={globalActions}
    />
  );
}
