import { useMemo } from "react";
import {
  ArrowLeft,
  Router,
  Wifi,
  Shield,
  Clock,
  Activity,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Gauge,
} from "lucide-react";
import { useRow, useRowIds, useTable } from "tinybase/ui-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeviceStatusBadge } from "./DeviceStatusBadge";
import { SpeedBenchmark } from "./SpeedBenchmark";
import type { DeviceRole, ChangeStatus } from "@/store";

interface DeviceDetailViewProps {
  deviceId: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatUptime(seconds: number): string {
  if (!seconds) return "Unknown";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatDateTime(timestamp: number): string {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString();
}

const roleConfig: Record<DeviceRole, { label: string; icon: typeof Router }> = {
  gateway: { label: "Gateway", icon: Shield },
  mesh_node: { label: "Mesh Node", icon: Wifi },
  access_point: { label: "Access Point", icon: Wifi },
  switch: { label: "Switch", icon: Router },
};

const statusColors: Record<string, string> = {
  queued: "bg-yellow-500",
  processing: "bg-blue-500",
  completed: "bg-green-500",
  failed: "bg-red-500",
  pending: "bg-yellow-500",
  approved: "bg-blue-500",
  executing: "bg-blue-500",
  cancelled: "bg-gray-500",
};

const categoryConfig: Record<string, { label: string; color: string }> = {
  network: { label: "Network", color: "text-blue-500" },
  wireless: { label: "Wireless", color: "text-purple-500" },
  firewall: { label: "Firewall", color: "text-red-500" },
  dhcp: { label: "DHCP", color: "text-green-500" },
  sqm: { label: "QoS", color: "text-yellow-500" },
  packages: { label: "Packages", color: "text-cyan-500" },
  mesh: { label: "Mesh", color: "text-pink-500" },
  system: { label: "System", color: "text-orange-500" },
};

export function DeviceDetailView({ deviceId }: DeviceDetailViewProps) {
  const device = useRow("openwrtDevices", deviceId);
  const queueIds = useRowIds("deviceCommandQueue");
  const queueData = useTable("deviceCommandQueue");
  const changeIds = useRowIds("pendingChanges");
  const changesData = useTable("pendingChanges");

  const hostname = (device.hostname as string) || "Unknown Device";
  const tailscaleIp = (device.tailscaleIp as string) || "";
  const model = (device.model as string) || "Unknown model";
  const firmwareVersion = (device.firmwareVersion as string) || "-";
  const status = (device.status as string) || "offline";
  const role = ((device.role as string) || "gateway") as DeviceRole;
  const meshEnabled = (device.meshEnabled as boolean) || false;
  const memoryTotal = (device.memoryTotal as number) || 0;
  const memoryFree = (device.memoryFree as number) || 0;
  const loadAvg1m = (device.loadAvg1m as number) || 0;
  const loadAvg5m = (device.loadAvg5m as number) || 0;
  const loadAvg15m = (device.loadAvg15m as number) || 0;
  const uptime = (device.uptime as number) || 0;
  const lastSeen = (device.lastSeen as number) || 0;

  const RoleIcon = roleConfig[role]?.icon || Router;
  const memUsed = memoryTotal - memoryFree;
  const memPercent = memoryTotal > 0 ? Math.round((memUsed / memoryTotal) * 100) : 0;

  // Get command queue entries for this device
  const deviceQueue = useMemo(() => {
    return queueIds
      .filter((id) => queueData[id]?.deviceId === deviceId)
      .map((id) => ({
        id,
        changeId: (queueData[id].changeId as string) || "",
        status: (queueData[id].status as string) || "queued",
        queuedAt: (queueData[id].queuedAt as number) || 0,
        startedAt: (queueData[id].startedAt as number) || 0,
        completedAt: (queueData[id].completedAt as number) || 0,
        error: (queueData[id].error as string) || "",
      }))
      .sort((a, b) => b.queuedAt - a.queuedAt);
  }, [queueIds, queueData, deviceId]);

  // Get pending and active queue entries
  const activeQueue = deviceQueue.filter(
    (q) => q.status === "queued" || q.status === "processing"
  );

  // Get completed queue entries (history)
  const queueHistory = deviceQueue.filter(
    (q) => q.status === "completed" || q.status === "failed"
  );

  // Get changes for this device
  const deviceChanges = useMemo(() => {
    return changeIds
      .filter((id) => changesData[id]?.deviceId === deviceId)
      .map((id) => {
        const change = changesData[id];
        return {
          id,
          category: (change.category as string) || "system",
          operation: (change.operation as string) || "update",
          targetName: (change.targetName as string) || "",
          status: (change.status as ChangeStatus) || "pending",
          createdAt: (change.createdAt as number) || 0,
          executedAt: (change.executedAt as number) || 0,
          errorMessage: (change.errorMessage as string) || "",
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [changeIds, changesData, deviceId]);

  // Separate pending vs completed changes
  const pendingChanges = deviceChanges.filter((c) => c.status === "pending" || c.status === "approved" || c.status === "executing");
  const completedChanges = deviceChanges.filter((c) => c.status === "completed" || c.status === "failed" || c.status === "cancelled");

  if (!device.hostname) {
    return (
      <div className="p-6">
        <Button variant="ghost" className="mb-4" onClick={() => window.location.hash = "#devices"}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Devices
        </Button>
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Device not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <Button variant="ghost" className="mb-4" onClick={() => window.location.hash = "#devices"}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Devices
      </Button>

      {/* Device Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="p-3 rounded-lg bg-muted">
          <RoleIcon className="h-8 w-8" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">{hostname}</h1>
            <DeviceStatusBadge status={status as any} />
            <Badge variant="secondary">{roleConfig[role]?.label || role}</Badge>
            {meshEnabled && <Badge variant="outline">Mesh</Badge>}
          </div>
          <div className="text-muted-foreground">
            <span className="font-mono">{tailscaleIp}</span>
            <span className="mx-2">|</span>
            <span>{model}</span>
            <span className="mx-2">|</span>
            <span>Firmware: {firmwareVersion}</span>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Uptime</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatUptime(uptime)}</div>
            <p className="text-xs text-muted-foreground">Last seen: {formatTimeAgo(lastSeen)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Memory</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{memPercent}%</div>
            <p className="text-xs text-muted-foreground">{formatBytes(memUsed)} / {formatBytes(memoryTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Load Average</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{loadAvg1m.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{loadAvg5m.toFixed(2)} / {loadAvg15m.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{activeQueue.length}</div>
            <p className="text-xs text-muted-foreground">
              {activeQueue.filter((q) => q.status === "processing").length > 0 ? "Processing..." : "Idle"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Queue and History */}
      <Tabs defaultValue="queue" className="flex-1">
        <TabsList>
          <TabsTrigger value="queue" className="gap-2">
            <Activity className="h-4 w-4" />
            Command Queue
            {activeQueue.length > 0 && (
              <Badge variant="secondary" className="ml-1">{activeQueue.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pending Changes
            {pendingChanges.length > 0 && (
              <Badge variant="secondary" className="ml-1">{pendingChanges.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <CheckCircle className="h-4 w-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="benchmark" className="gap-2">
            <Gauge className="h-4 w-4" />
            Speed Test
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Active Command Queue</CardTitle>
            </CardHeader>
            <CardContent>
              {activeQueue.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No commands in queue</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeQueue.map((entry, index) => {
                    const change = changesData[entry.changeId];
                    const changeName = change
                      ? `${change.operation} ${change.targetName}`
                      : entry.changeId;
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                      >
                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted text-sm font-medium">
                          {index + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {entry.status === "processing" && (
                              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                            )}
                            {entry.status === "queued" && (
                              <Clock className="h-4 w-4 text-yellow-500" />
                            )}
                            <span className="font-medium truncate">{changeName}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Queued {formatTimeAgo(entry.queuedAt)}
                            {entry.startedAt > 0 && ` | Started ${formatTimeAgo(entry.startedAt)}`}
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className={`${statusColors[entry.status]} text-white`}
                        >
                          {entry.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pending Changes</CardTitle>
            </CardHeader>
            <CardContent>
              {pendingChanges.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pending changes</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingChanges.map((change) => {
                    const catConfig = categoryConfig[change.category];
                    return (
                      <div
                        key={change.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${catConfig?.color || ""}`}>
                              {catConfig?.label || change.category}
                            </span>
                            <span className="text-muted-foreground">|</span>
                            <Badge variant="outline" className="capitalize">
                              {change.operation}
                            </Badge>
                            <span className="truncate">{change.targetName}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Created {formatTimeAgo(change.createdAt)}
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className={`${statusColors[change.status]} text-white`}
                        >
                          {change.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Command History</CardTitle>
            </CardHeader>
            <CardContent>
              {completedChanges.length === 0 && queueHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No command history</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {completedChanges.map((change) => {
                    const catConfig = categoryConfig[change.category];
                    const isSuccess = change.status === "completed";
                    return (
                      <div
                        key={change.id}
                        className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                      >
                        {isSuccess ? (
                          <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                        ) : change.status === "failed" ? (
                          <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-gray-500 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${catConfig?.color || ""}`}>
                              {catConfig?.label || change.category}
                            </span>
                            <span className="text-muted-foreground">|</span>
                            <Badge variant="outline" className="capitalize">
                              {change.operation}
                            </Badge>
                            <span className="truncate">{change.targetName}</span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {change.executedAt > 0
                              ? `Executed ${formatDateTime(change.executedAt)}`
                              : `Created ${formatDateTime(change.createdAt)}`}
                            {change.errorMessage && (
                              <span className="text-red-500 ml-2">- {change.errorMessage}</span>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="secondary"
                          className={`${statusColors[change.status]} text-white`}
                        >
                          {change.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="benchmark" className="mt-4">
          <SpeedBenchmark deviceId={deviceId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
