import { useMemo, useState, useCallback } from "react";
import {
  Archive,
  Download,
  Upload,
  Trash2,
  RotateCcw,
  Loader2,
  Plus,
  HardDrive,
  Clock,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { type ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BackupRow {
  id: string;
  deviceId: string;
  deviceHostname: string;
  filename: string;
  size: number;
  createdAt: number;
  type: string; // full | config | packages
  description: string;
  status: string; // completed | failed | in_progress
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

interface BackupsManagerProps {
  deviceId?: string;
  globalActions?: React.ReactNode;
}

export function BackupsManager({ deviceId, globalActions }: BackupsManagerProps) {
  const backupIds = useRowIds("configBackups");
  const backupsData = useTable("configBackups");
  const devicesData = useTable("openwrtDevices");
  const deviceIds = useRowIds("openwrtDevices");

  const [isCreating, setIsCreating] = useState(false);
  const [, setIsRestoring] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedDeviceId, setSelectedDeviceId] = useState(deviceId || "");
  const [backupType, setBackupType] = useState("full");
  const [backupDescription, setBackupDescription] = useState("");
  const [includePackages, setIncludePackages] = useState(true);
  const [restoreBackupId, setRestoreBackupId] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [actionIds, setActionIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const createBackup = useCallback(async () => {
    if (!selectedDeviceId) return;

    setActionIds((prev) => new Set(prev).add("create"));
    try {
      await fetch(`/api/openwrt/devices/${selectedDeviceId}/backups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: backupType,
          description: backupDescription,
          includePackages,
        }),
      });
      setIsCreating(false);
      setBackupDescription("");
    } finally {
      setActionIds((prev) => {
        const next = new Set(prev);
        next.delete("create");
        return next;
      });
    }
  }, [selectedDeviceId, backupType, backupDescription, includePackages]);

  const restoreBackup = useCallback(async () => {
    if (!restoreBackupId) return;

    const backup = backupsData[restoreBackupId];
    if (!backup) return;

    setActionIds((prev) => new Set(prev).add(restoreBackupId));
    try {
      await fetch(
        `/api/openwrt/devices/${backup.deviceId}/backups/${restoreBackupId}/restore`,
        {
          method: "POST",
        }
      );
      setIsRestoring(false);
      setRestoreBackupId(null);
    } finally {
      setActionIds((prev) => {
        const next = new Set(prev);
        next.delete(restoreBackupId);
        return next;
      });
    }
  }, [restoreBackupId, backupsData]);

  const downloadBackup = useCallback(async (devId: string, backupId: string) => {
    const response = await fetch(
      `/api/openwrt/devices/${devId}/backups/${backupId}/download`
    );
    if (!response.ok) return;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-${backupId}.tar.gz`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const deleteBackup = useCallback(async (devId: string, backupId: string) => {
    setDeletingIds((prev) => new Set(prev).add(backupId));
    try {
      await fetch(`/api/openwrt/devices/${devId}/backups/${backupId}`, {
        method: "DELETE",
      });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(backupId);
        return next;
      });
    }
  }, []);

  const uploadBackup = useCallback(async () => {
    if (!selectedDeviceId || !uploadFile) return;

    const formData = new FormData();
    formData.append("backup", uploadFile);

    setActionIds((prev) => new Set(prev).add("upload"));
    try {
      await fetch(`/api/openwrt/devices/${selectedDeviceId}/backups/upload`, {
        method: "POST",
        body: formData,
      });
      setIsUploading(false);
      setUploadFile(null);
    } finally {
      setActionIds((prev) => {
        const next = new Set(prev);
        next.delete("upload");
        return next;
      });
    }
  }, [selectedDeviceId, uploadFile]);

  const data = useMemo<BackupRow[]>(() => {
    const result: BackupRow[] = [];
    for (const id of backupIds) {
      const row = backupsData[id] || {};
      const devId = (row.deviceId as string) || "";

      if (deviceId && devId !== deviceId) continue;

      const device = devicesData[devId] || {};

      result.push({
        id,
        deviceId: devId,
        deviceHostname: (device.hostname as string) || devId,
        filename: (row.filename as string) || "",
        size: (row.size as number) || 0,
        createdAt: (row.createdAt as number) || 0,
        type: (row.type as string) || "full",
        description: (row.description as string) || "",
        status: (row.status as string) || "completed",
      });
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  }, [backupIds, backupsData, devicesData, deviceId]);

  const columns = useMemo<ColumnDef<BackupRow>[]>(
    () => [
      {
        accessorKey: "filename",
        header: "Backup",
        size: 220,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{row.original.filename || "Backup"}</div>
              {row.original.description && (
                <div className="text-xs text-muted-foreground line-clamp-1">
                  {row.original.description}
                </div>
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
              cell: ({ row }: { row: { original: BackupRow } }) => (
                <span className="truncate block">{row.original.deviceHostname}</span>
              ),
            } as ColumnDef<BackupRow>,
          ]
        : []),
      {
        accessorKey: "type",
        header: "Type",
        size: 100,
        cell: ({ row }) => {
          const type = row.original.type;
          const variant =
            type === "full" ? "default" : type === "config" ? "secondary" : "outline";
          return (
            <Badge variant={variant}>
              {type === "full" ? "Full" : type === "config" ? "Config" : "Packages"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "size",
        header: "Size",
        size: 80,
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-sm">
            <HardDrive className="h-3 w-3 text-muted-foreground" />
            {formatBytes(row.original.size)}
          </div>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        size: 160,
        cell: ({ row }) => (
          <div className="flex items-center gap-1 text-sm">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {formatDate(row.original.createdAt)}
          </div>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 100,
        cell: ({ row }) => {
          const status = row.original.status;
          if (status === "completed") {
            return (
              <div className="flex items-center gap-1 text-green-500">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">Complete</span>
              </div>
            );
          }
          if (status === "failed") {
            return (
              <div className="flex items-center gap-1 text-red-500">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">Failed</span>
              </div>
            );
          }
          return (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Running</span>
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        size: 140,
        enableHiding: false,
        cell: ({ row }) => {
          const isDeleting = deletingIds.has(row.original.id);
          const isActing = actionIds.has(row.original.id);

          return (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                title="Download"
                onClick={() =>
                  downloadBackup(row.original.deviceId, row.original.id)
                }
              >
                <Download className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Restore"
                    disabled={isActing}
                    onClick={() => setRestoreBackupId(row.original.id)}
                  >
                    {isActing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4 text-blue-500" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restore Backup?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will restore the configuration from this backup. The device
                      will be rebooted after restoration. This action will be queued
                      for approval.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={restoreBackup}>
                      Queue Restore
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Backup?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete this backup. This action cannot be
                      undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() =>
                        deleteBackup(row.original.deviceId, row.original.id)
                      }
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          );
        },
      },
    ],
    [deviceId, actionIds, deletingIds, downloadBackup, restoreBackup, deleteBackup]
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      filterColumn="filename"
      filterPlaceholder="Filter backups..."
      className="h-full"
      facetedFilters={[
        {
          column: "type",
          title: "Type",
          options: [
            { label: "Full", value: "full" },
            { label: "Config", value: "config" },
            { label: "Packages", value: "packages" },
          ],
        },
      ]}
      globalActions={
        <>
          {globalActions}
          <Dialog open={isUploading} onOpenChange={setIsUploading}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-1">
                <Upload className="h-4 w-4" />
                Upload
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Backup</DialogTitle>
                <DialogDescription>
                  Upload a previously created backup file.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {!deviceId && (
                  <div className="space-y-2">
                    <Label>Device</Label>
                    <Select
                      value={selectedDeviceId}
                      onValueChange={setSelectedDeviceId}
                    >
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
                  <Label>Backup File</Label>
                  <Input
                    type="file"
                    accept=".tar.gz,.tgz"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsUploading(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={uploadBackup}
                  disabled={
                    !selectedDeviceId || !uploadFile || actionIds.has("upload")
                  }
                >
                  {actionIds.has("upload") ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    "Upload"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={isCreating} onOpenChange={setIsCreating}>
            <DialogTrigger asChild>
              <Button className="gap-1">
                <Plus className="h-4 w-4" />
                Create Backup
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Backup</DialogTitle>
                <DialogDescription>
                  Create a new configuration backup.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {!deviceId && (
                  <div className="space-y-2">
                    <Label>Device</Label>
                    <Select
                      value={selectedDeviceId}
                      onValueChange={setSelectedDeviceId}
                    >
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
                  <Label>Backup Type</Label>
                  <Select value={backupType} onValueChange={setBackupType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">
                        Full (config + installed packages)
                      </SelectItem>
                      <SelectItem value="config">Configuration only</SelectItem>
                      <SelectItem value="packages">Package list only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    value={backupDescription}
                    onChange={(e) => setBackupDescription(e.target.value)}
                    placeholder="Before upgrading firmware..."
                  />
                </div>
                {backupType === "full" && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includePackages"
                      checked={includePackages}
                      onCheckedChange={(checked) =>
                        setIncludePackages(checked === true)
                      }
                    />
                    <Label htmlFor="includePackages" className="text-sm font-normal">
                      Include installed package list
                    </Label>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreating(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={createBackup}
                  disabled={!selectedDeviceId || actionIds.has("create")}
                >
                  {actionIds.has("create") ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Backup"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      }
    />
  );
}
