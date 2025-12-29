import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Settings2,
  Plus,
  Trash2,
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
import { PortForwardForm } from "./PortForwardForm";

interface PortForwardRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  name: string;
  src: string;
  srcDport: string;
  dest: string;
  destIp: string;
  destPort: string;
  proto: string;
  enabled: boolean;
}

interface PortForwardsTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function PortForwardsTable({ deviceId, globalActions }: PortForwardsTableProps) {
  const forwardIds = useRowIds("portForwards");
  const forwardsData = useTable("portForwards");
  const devicesData = useTable("openwrtDevices");
  const [isCreating, setIsCreating] = useState(false);

  const data = useMemo<PortForwardRow[]>(() => {
    return forwardIds
      .map((id) => {
        const row = forwardsData[id] || {};
        const devId = (row.deviceId as string) || "";

        if (deviceId && devId !== deviceId) return null;

        const device = devicesData[devId] || {};

        return {
          id,
          deviceId: devId,
          deviceHostname: (device.hostname as string) || devId,
          name: (row.name as string) || "",
          src: (row.src as string) || "wan",
          srcDport: (row.srcDport as string) || "",
          dest: (row.dest as string) || "lan",
          destIp: (row.destIp as string) || "",
          destPort: (row.destPort as string) || "",
          proto: (row.proto as string) || "tcp",
          enabled: (row.enabled as boolean) ?? true,
        };
      })
      .filter((row): row is PortForwardRow => row !== null);
  }, [forwardIds, forwardsData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<PortForwardRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        size: 180,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{row.original.name || "Unnamed"}</div>
              {!row.original.enabled && (
                <Badge variant="secondary" className="text-xs">Disabled</Badge>
              )}
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
              cell: ({ row }: { row: { original: PortForwardRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<PortForwardRow>,
          ]
        : []),
      {
        accessorKey: "proto",
        header: "Protocol",
        size: 100,
        cell: ({ row }) => (
          <Badge variant="outline" className="uppercase">
            {row.original.proto}
          </Badge>
        ),
      },
      {
        accessorKey: "srcDport",
        header: "External Port",
        size: 120,
        cell: ({ row }) => (
          <div className="font-mono text-sm">
            <span className="text-muted-foreground">{row.original.src}:</span>
            <span className="text-primary">{row.original.srcDport}</span>
          </div>
        ),
      },
      {
        id: "arrow",
        header: "",
        size: 40,
        cell: () => <span className="text-muted-foreground">→</span>,
      },
      {
        id: "internal",
        header: "Internal Target",
        size: 180,
        cell: ({ row }) => (
          <div className="font-mono text-sm">
            <span className="text-primary">{row.original.destIp}</span>
            <span className="text-muted-foreground">:{row.original.destPort || row.original.srcDport}</span>
          </div>
        ),
      },
      {
        accessorKey: "enabled",
        header: "Status",
        size: 100,
        cell: ({ row }) => (
          <Badge variant={row.original.enabled ? "success" : "secondary"}>
            {row.original.enabled ? "Active" : "Disabled"}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "Actions",
        size: 120,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" title="Edit port forward">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>Edit Port Forward</SheetTitle>
                  <SheetDescription>
                    Configure port forwarding. Changes will be queued for approval.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  <PortForwardForm forwardData={row.original} />
                  </div>
                </SheetContent>
              </Sheet>
              <Button
                variant="ghost"
                size="icon"
                title="Delete"
                onClick={() => {
                  if (confirm("Queue deletion of this port forward?")) {
                    // Queue deletion
                  }
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
          </div>
        ),
      },
    ],
    [deviceId, devicesData]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="name"
      filterPlaceholder="Filter by name..."
      className="h-full"
      globalActions={
        <>
          {globalActions}
          <Sheet open={isCreating} onOpenChange={setIsCreating}>
            <SheetTrigger asChild>
              <Button className="gap-1">
                <Plus className="h-4 w-4" />
                Add Port Forward
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>Create Port Forward</SheetTitle>
                <SheetDescription>
                  Add a new port forward rule. The change will be queued for approval.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6">
                <PortForwardForm
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
