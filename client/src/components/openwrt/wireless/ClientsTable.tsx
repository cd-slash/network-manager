import { useMemo } from "react";
import {
  Laptop,
  Smartphone,
  Tv,
  Wifi,
  SignalHigh,
  SignalMedium,
  SignalLow,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ClientRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  ssidId: string;
  ssidName: string;
  macAddress: string;
  hostname: string;
  ipAddress: string;
  signalStrength: number;
  noiseLevel: number;
  txRate: number;
  rxRate: number;
  connected: boolean;
  connectedSince: number;
  txBytes: number;
  rxBytes: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRate(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(1)} Gbps`;
  }
  return `${mbps} Mbps`;
}

function formatDuration(ms: number): string {
  if (!ms) return "-";
  const seconds = Math.floor((Date.now() - ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function getSignalIcon(dbm: number) {
  if (dbm >= -50) return SignalHigh;
  if (dbm >= -70) return SignalMedium;
  return SignalLow;
}

function getSignalColor(dbm: number): string {
  if (dbm >= -50) return "text-green-500";
  if (dbm >= -70) return "text-yellow-500";
  return "text-red-500";
}

function getSignalQuality(dbm: number): string {
  if (dbm >= -50) return "Excellent";
  if (dbm >= -60) return "Good";
  if (dbm >= -70) return "Fair";
  return "Poor";
}

// Simple device type detection based on hostname
function getDeviceIcon(_mac: string, hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower.includes("iphone") || lower.includes("android") || lower.includes("pixel")) {
    return Smartphone;
  }
  if (lower.includes("tv") || lower.includes("roku") || lower.includes("fire")) {
    return Tv;
  }
  if (lower.includes("macbook") || lower.includes("laptop") || lower.includes("desktop")) {
    return Laptop;
  }
  return Wifi;
}

interface ClientsTableProps {
  deviceId?: string;
  ssidId?: string;
  globalActions?: React.ReactNode;
}

export function ClientsTable({ deviceId, ssidId, globalActions }: ClientsTableProps) {
  const clientIds = useRowIds("wirelessClients");
  const clientsData = useTable("wirelessClients");
  const devicesData = useTable("openwrtDevices");
  const ssidsData = useTable("wirelessNetworks");

  const data = useMemo<ClientRow[]>(() => {
    return clientIds
      .map((id) => {
        const row = clientsData[id] || {};
        const devId = (row.deviceId as string) || "";
        const ssId = (row.ssidId as string) || "";

        if (deviceId && devId !== deviceId) return null;
        if (ssidId && ssId !== ssidId) return null;

        const device = devicesData[devId] || {};
        const ssid = ssidsData[ssId] || {};

        return {
          id,
          deviceId: devId,
          deviceHostname: (device.hostname as string) || devId,
          ssidId: ssId,
          ssidName: (ssid.ssid as string) || ssId,
          macAddress: (row.macAddress as string) || "",
          hostname: (row.hostname as string) || "",
          ipAddress: (row.ipAddress as string) || "",
          signalStrength: (row.signalStrength as number) || 0,
          noiseLevel: (row.noiseLevel as number) || 0,
          txRate: (row.txRate as number) || 0,
          rxRate: (row.rxRate as number) || 0,
          connected: (row.connected as boolean) ?? true,
          connectedSince: (row.connectedSince as number) || 0,
          txBytes: (row.txBytes as number) || 0,
          rxBytes: (row.rxBytes as number) || 0,
        };
      })
      .filter((row): row is ClientRow => row !== null && row.connected);
  }, [clientIds, clientsData, devicesData, ssidsData, deviceId, ssidId]);

  const columns = useMemo<ColumnDef<ClientRow>[]>(
    () => [
      {
        accessorKey: "hostname",
        header: "Client",
        size: 200,
        cell: ({ row }) => {
          const DeviceIcon = getDeviceIcon(row.original.macAddress, row.original.hostname);
          return (
            <div className="flex items-center gap-2">
              <DeviceIcon className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {row.original.hostname || "Unknown Device"}
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  {row.original.macAddress}
                </div>
              </div>
            </div>
          );
        },
      },
      ...(!deviceId
        ? [
            {
              accessorKey: "deviceHostname",
              header: "Router",
              size: 120,
              cell: ({ row }: { row: { original: ClientRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<ClientRow>,
          ]
        : []),
      {
        accessorKey: "ssidName",
        header: "SSID",
        size: 140,
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.ssidName}</Badge>
        ),
      },
      {
        accessorKey: "ipAddress",
        header: "IP Address",
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.ipAddress || "-"}</span>
        ),
      },
      {
        accessorKey: "signalStrength",
        header: "Signal",
        size: 120,
        cell: ({ row }) => {
          const dbm = row.original.signalStrength;
          const SignalIcon = getSignalIcon(dbm);
          const color = getSignalColor(dbm);
          const snr = dbm - row.original.noiseLevel;

          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className={`flex items-center gap-1 ${color}`}>
                    <SignalIcon className="h-4 w-4" />
                    <span>{dbm} dBm</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="text-xs space-y-1">
                    <div>Quality: {getSignalQuality(dbm)}</div>
                    <div>Noise: {row.original.noiseLevel} dBm</div>
                    <div>SNR: {snr} dB</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        id: "rates",
        header: "Link Rate",
        size: 140,
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="flex items-center gap-1">
              <ArrowDown className="h-3 w-3 text-green-500" />
              {formatRate(row.original.rxRate)}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <ArrowUp className="h-3 w-3 text-blue-500" />
              {formatRate(row.original.txRate)}
            </div>
          </div>
        ),
      },
      {
        id: "traffic",
        header: "Traffic",
        size: 140,
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="flex items-center gap-1">
              <ArrowDown className="h-3 w-3 text-green-500" />
              {formatBytes(row.original.rxBytes)}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <ArrowUp className="h-3 w-3 text-blue-500" />
              {formatBytes(row.original.txBytes)}
            </div>
          </div>
        ),
      },
      {
        accessorKey: "connectedSince",
        header: "Connected",
        size: 100,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatDuration(row.original.connectedSince)}
          </span>
        ),
      },
    ],
    [deviceId]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="hostname"
      filterPlaceholder="Filter by hostname or MAC..."
      className="h-full"
      globalActions={globalActions}
    />
  );
}
