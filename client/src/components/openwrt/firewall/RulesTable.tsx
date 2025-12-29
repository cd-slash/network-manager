import { useMemo, useState } from "react";
import {
  ShieldCheck,
  ShieldX,
  Settings2,
  Plus,
  ArrowRight,
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
import { RuleForm } from "./RuleForm";

interface RuleRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  name: string;
  src: string;
  srcIp: string;
  srcPort: string;
  dest: string;
  destIp: string;
  destPort: string;
  proto: string;
  target: string;
  enabled: boolean;
  family: string;
}

interface RulesTableProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function RulesTable({ deviceId, globalActions }: RulesTableProps) {
  const ruleIds = useRowIds("firewallRules");
  const rulesData = useTable("firewallRules");
  const devicesData = useTable("openwrtDevices");
  const [isCreating, setIsCreating] = useState(false);

  const data = useMemo<RuleRow[]>(() => {
    return ruleIds
      .map((id) => {
        const row = rulesData[id] || {};
        const devId = (row.deviceId as string) || "";

        if (deviceId && devId !== deviceId) return null;

        const device = devicesData[devId] || {};

        return {
          id,
          deviceId: devId,
          deviceHostname: (device.hostname as string) || devId,
          name: (row.name as string) || "",
          src: (row.src as string) || "*",
          srcIp: (row.srcIp as string) || "",
          srcPort: (row.srcPort as string) || "",
          dest: (row.dest as string) || "*",
          destIp: (row.destIp as string) || "",
          destPort: (row.destPort as string) || "",
          proto: (row.proto as string) || "any",
          target: (row.target as string) || "ACCEPT",
          enabled: (row.enabled as boolean) ?? true,
          family: (row.family as string) || "any",
        };
      })
      .filter((row): row is RuleRow => row !== null);
  }, [ruleIds, rulesData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<RuleRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Rule",
        size: 180,
        cell: ({ row }) => {
          const isAccept = row.original.target === "ACCEPT";
          return (
            <div className="flex items-center gap-2">
              {isAccept ? (
                <ShieldCheck className="h-4 w-4 text-green-500" />
              ) : (
                <ShieldX className="h-4 w-4 text-red-500" />
              )}
              <div>
                <div className="font-medium">{row.original.name || "Unnamed"}</div>
                {!row.original.enabled && (
                  <Badge variant="secondary" className="text-xs">Disabled</Badge>
                )}
              </div>
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
              cell: ({ row }: { row: { original: RuleRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<RuleRow>,
          ]
        : []),
      {
        id: "source",
        header: "Source",
        size: 160,
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="font-medium">{row.original.src || "*"}</div>
            {(row.original.srcIp || row.original.srcPort) && (
              <div className="text-xs text-muted-foreground">
                {row.original.srcIp && <span>{row.original.srcIp}</span>}
                {row.original.srcPort && <span>:{row.original.srcPort}</span>}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "direction",
        header: "",
        size: 40,
        cell: () => <ArrowRight className="h-4 w-4 text-muted-foreground" />,
      },
      {
        id: "destination",
        header: "Destination",
        size: 160,
        cell: ({ row }) => (
          <div className="text-sm">
            <div className="font-medium">{row.original.dest || "*"}</div>
            {(row.original.destIp || row.original.destPort) && (
              <div className="text-xs text-muted-foreground">
                {row.original.destIp && <span>{row.original.destIp}</span>}
                {row.original.destPort && <span>:{row.original.destPort}</span>}
              </div>
            )}
          </div>
        ),
      },
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
        accessorKey: "target",
        header: "Action",
        size: 100,
        cell: ({ row }) => {
          const isAccept = row.original.target === "ACCEPT";
          return (
            <Badge variant={isAccept ? "success" : "destructive"}>
              {row.original.target}
            </Badge>
          );
        },
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
                <Button variant="ghost" size="icon" title="Edit rule">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-lg overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Edit Rule: {row.original.name || "Unnamed"}</SheetTitle>
                  <SheetDescription>
                    Configure firewall rule. Changes will be queued for approval.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  <RuleForm ruleData={row.original} />
                </div>
              </SheetContent>
              </Sheet>
              <Button
                variant="ghost"
                size="icon"
                title="Delete rule"
                onClick={() => {
                  if (confirm("Queue deletion of this rule?")) {
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
      filterPlaceholder="Filter by rule name..."
      className="h-full"
      facetedFilters={[
        {
          column: "target",
          title: "Action",
          options: [
            { label: "Accept", value: "ACCEPT" },
            { label: "Reject", value: "REJECT" },
            { label: "Drop", value: "DROP" },
          ],
        },
      ]}
      globalActions={
        <>
          {globalActions}
          <Sheet open={isCreating} onOpenChange={setIsCreating}>
            <SheetTrigger asChild>
              <Button className="gap-1">
                <Plus className="h-4 w-4" />
                Add Rule
              </Button>
            </SheetTrigger>
            <SheetContent className="sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Create Firewall Rule</SheetTitle>
                <SheetDescription>
                  Add a new firewall rule. The change will be queued for approval.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-6">
                <RuleForm
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
