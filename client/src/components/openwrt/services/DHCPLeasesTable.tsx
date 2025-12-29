import { useMemo } from "react";
import {
  Laptop,
  Smartphone,
  Tv,
  Router,
  Clock,
  Pin,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LeaseRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  macAddress: string;
  ipAddress: string;
  hostname: string;
  expires: number;
  isStatic: boolean;
  interface: string;
}

function formatExpiry(timestamp: number): string {
  if (!timestamp) return "Static";
  const now = Date.now() / 1000;
  const remaining = timestamp - now;
  if (remaining <= 0) return "Expired";
  if (remaining < 60) return `${Math.floor(remaining)}s`;
  if (remaining < 3600) return `${Math.floor(remaining / 60)}m`;
  if (remaining < 86400) return `${Math.floor(remaining / 3600)}h`;
  return `${Math.floor(remaining / 86400)}d`;
}

function getDeviceIcon(hostname: string) {
  const lower = hostname.toLowerCase();
  if (lower.includes("iphone") || lower.includes("android") || lower.includes("pixel") || lower.includes("phone")) {
    return Smartphone;
  }
  if (lower.includes("tv") || lower.includes("roku") || lower.includes("fire") || lower.includes("chromecast")) {
    return Tv;
  }
  if (lower.includes("router") || lower.includes("ap") || lower.includes("switch")) {
    return Router;
  }
  return Laptop;
}

interface DHCPLeasesTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function DHCPLeasesTable({ deviceId, globalActions }: DHCPLeasesTableProps) {
  const leaseIds = useRowIds("dhcpLeases");
  const leasesData = useTable("dhcpLeases");
  const devicesData = useTable("openwrtDevices");

  const data = useMemo<LeaseRow[]>(() => {
    return leaseIds
      .map((id) => {
        const row = leasesData[id] || {};
        const devId = (row.deviceId as string) || "";

        if (deviceId && devId !== deviceId) return null;

        const device = devicesData[devId] || {};

        return {
          id,
          deviceId: devId,
          deviceHostname: (device.hostname as string) || devId,
          macAddress: (row.macAddress as string) || "",
          ipAddress: (row.ipAddress as string) || "",
          hostname: (row.hostname as string) || "",
          expires: (row.expires as number) || 0,
          isStatic: (row.isStatic as boolean) || false,
          interface: (row.interface as string) || "lan",
        };
      })
      .filter((row): row is LeaseRow => row !== null)
      .sort((a, b) => {
        // Static entries first, then by IP
        if (a.isStatic !== b.isStatic) return a.isStatic ? -1 : 1;
        return a.ipAddress.localeCompare(b.ipAddress, undefined, { numeric: true });
      });
  }, [leaseIds, leasesData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<LeaseRow>[]>(
    () => [
      {
        accessorKey: "hostname",
        header: "Host",
        size: 200,
        cell: ({ row }) => {
          const DeviceIcon = getDeviceIcon(row.original.hostname);
          return (
            <div className="flex items-center gap-2">
              <DeviceIcon className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  {row.original.hostname || "Unknown"}
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
              cell: ({ row }: { row: { original: LeaseRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<LeaseRow>,
          ]
        : []),
      {
        accessorKey: "ipAddress",
        header: "IP Address",
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono">{row.original.ipAddress}</span>
        ),
      },
      {
        accessorKey: "interface",
        header: "Interface",
        size: 100,
        cell: ({ row }) => (
          <Badge variant="outline">{row.original.interface}</Badge>
        ),
      },
      {
        accessorKey: "isStatic",
        header: "Type",
        size: 100,
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {row.original.isStatic ? (
              <>
                <Pin className="h-3 w-3 text-primary" />
                <span className="text-primary">Static</span>
              </>
            ) : (
              <>
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Dynamic</span>
              </>
            )}
          </div>
        ),
      },
      {
        accessorKey: "expires",
        header: "Expires",
        size: 100,
        cell: ({ row }) => {
          if (row.original.isStatic) {
            return <span className="text-muted-foreground">Never</span>;
          }
          const expiry = formatExpiry(row.original.expires);
          const isExpiringSoon = row.original.expires - Date.now() / 1000 < 3600;
          return (
            <span className={isExpiringSoon ? "text-warning" : "text-muted-foreground"}>
              {expiry}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        size: 100,
        enableHiding: false,
        cell: ({ row }) => (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1"
                  disabled={row.original.isStatic}
                >
                  <Pin className="h-3 w-3" />
                  Make Static
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {row.original.isStatic
                  ? "Already a static lease"
                  : "Convert to static DHCP reservation"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
      facetedFilters={[
        {
          column: "isStatic",
          title: "Type",
          options: [
            { label: "Static", value: "true" },
            { label: "Dynamic", value: "false" },
          ],
        },
      ]}
      globalActions={globalActions}
    />
  );
}
