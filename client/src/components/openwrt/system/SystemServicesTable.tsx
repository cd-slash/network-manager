import { useMemo, useState, useCallback } from "react";
import {
  Play,
  Square,
  RotateCw,
  Settings2,
  Loader2,
  CheckCircle,
  XCircle,
  Circle,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ServiceRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  name: string;
  displayName: string;
  enabled: boolean;
  running: boolean;
  description: string;
}

interface SystemServicesTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function SystemServicesTable({
  deviceId,
  globalActions,
}: SystemServicesTableProps) {
  const serviceIds = useRowIds("systemServices");
  const servicesData = useTable("systemServices");
  const devicesData = useTable("openwrtDevices");

  const [actionIds, setActionIds] = useState<Set<string>>(new Set());

  const queueServiceAction = useCallback(
    async (devId: string, serviceName: string, action: string) => {
      const key = `${devId}-${serviceName}`;
      setActionIds((prev) => new Set(prev).add(key));
      try {
        await fetch(`/api/openwrt/devices/${devId}/services/${serviceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
      } finally {
        setActionIds((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    []
  );

  const data = useMemo<ServiceRow[]>(() => {
    return serviceIds
      .map((id) => {
        const row = servicesData[id] || {};
        const devId = (row.deviceId as string) || "";

        if (deviceId && devId !== deviceId) return null;

        const device = devicesData[devId] || {};

        return {
          id,
          deviceId: devId,
          deviceHostname: (device.hostname as string) || devId,
          name: (row.name as string) || "",
          displayName: (row.displayName as string) || (row.name as string) || "",
          enabled: (row.enabled as boolean) ?? false,
          running: (row.running as boolean) ?? false,
          description: (row.description as string) || "",
        };
      })
      .filter((row): row is ServiceRow => row !== null);
  }, [serviceIds, servicesData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<ServiceRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Service",
        size: 200,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{row.original.displayName}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {row.original.name}
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
              cell: ({ row }: { row: { original: ServiceRow } }) => (
                <span className="truncate block">
                  {row.original.deviceHostname}
                </span>
              ),
            } as ColumnDef<ServiceRow>,
          ]
        : []),
      {
        accessorKey: "description",
        header: "Description",
        size: 250,
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground line-clamp-2">
            {row.original.description || "No description"}
          </span>
        ),
      },
      {
        accessorKey: "running",
        header: "Status",
        size: 120,
        cell: ({ row }) => {
          const running = row.original.running;
          return (
            <div className="flex items-center gap-1">
              {running ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={running ? "text-green-500" : "text-muted-foreground"}>
                {running ? "Running" : "Stopped"}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "enabled",
        header: "Boot",
        size: 100,
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? "success" : "secondary"}>
            {row.original.enabled ? "Enabled" : "Disabled"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 160,
        enableHiding: false,
        cell: ({ row }) => {
          const isActing = actionIds.has(
            `${row.original.deviceId}-${row.original.name}`
          );

          return (
            <TooltipProvider>
              <div className="flex gap-1">
                {row.original.running ? (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            queueServiceAction(
                              row.original.deviceId,
                              row.original.name,
                              "restart"
                            )
                          }
                          disabled={isActing}
                        >
                          {isActing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCw className="h-4 w-4 text-blue-500" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Restart service</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            queueServiceAction(
                              row.original.deviceId,
                              row.original.name,
                              "stop"
                            )
                          }
                          disabled={isActing}
                        >
                          {isActing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Square className="h-4 w-4 text-red-500" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Stop service</TooltipContent>
                    </Tooltip>
                  </>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          queueServiceAction(
                            row.original.deviceId,
                            row.original.name,
                            "start"
                          )
                        }
                        disabled={isActing}
                      >
                        {isActing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 text-green-500" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Start service</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        queueServiceAction(
                          row.original.deviceId,
                          row.original.name,
                          row.original.enabled ? "disable" : "enable"
                        )
                      }
                      disabled={isActing}
                    >
                      {isActing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : row.original.enabled ? (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {row.original.enabled ? "Disable at boot" : "Enable at boot"}
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          );
        },
      },
    ],
    [deviceId, actionIds, queueServiceAction]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="name"
      filterPlaceholder="Search services..."
      className="h-full"
      facetedFilters={[
        {
          column: "running",
          title: "Status",
          options: [
            { label: "Running", value: "true" },
            { label: "Stopped", value: "false" },
          ],
        },
        {
          column: "enabled",
          title: "Boot",
          options: [
            { label: "Enabled", value: "true" },
            { label: "Disabled", value: "false" },
          ],
        },
      ]}
      globalActions={globalActions}
    />
  );
}
