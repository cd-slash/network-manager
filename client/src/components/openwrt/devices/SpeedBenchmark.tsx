import { useCallback, useMemo, useState } from "react";
import {
  Play,
  Loader2,
  ArrowDownUp,
  Clock,
  Wifi,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface SpeedBenchmarkProps {
  deviceId?: string;
}

function formatSpeed(mbps: number): string {
  if (mbps >= 1000) {
    return `${(mbps / 1000).toFixed(2)} Gbps`;
  }
  return `${mbps.toFixed(2)} Mbps`;
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function SpeedBenchmark({ deviceId }: SpeedBenchmarkProps) {
  const deviceIds = useRowIds("openwrtDevices");
  const devicesData = useTable("openwrtDevices");
  const benchmarkIds = useRowIds("speedBenchmarks");
  const benchmarksData = useTable("speedBenchmarks");

  const [sourceDevice, setSourceDevice] = useState(deviceId || "");
  const [targetDevice, setTargetDevice] = useState("");
  const [isRunning, setIsRunning] = useState(false);

  const devices = useMemo(() => {
    return deviceIds.map((id) => ({
      id,
      hostname: (devicesData[id]?.hostname as string) || id,
      status: (devicesData[id]?.status as string) || "offline",
    }));
  }, [deviceIds, devicesData]);

  const benchmarks = useMemo(() => {
    return benchmarkIds
      .map((id) => {
        const bench = benchmarksData[id];
        if (!bench) return null;

        // Filter by deviceId if provided
        if (deviceId && bench.sourceDeviceId !== deviceId && bench.targetDeviceId !== deviceId) {
          return null;
        }

        const sourceHostname = (devicesData[bench.sourceDeviceId as string]?.hostname as string) || bench.sourceDeviceId;
        const targetHostname = (devicesData[bench.targetDeviceId as string]?.hostname as string) || bench.targetDeviceId;

        return {
          id,
          sourceDeviceId: bench.sourceDeviceId as string,
          targetDeviceId: bench.targetDeviceId as string,
          sourceHostname,
          targetHostname,
          status: bench.status as string,
          downloadSpeed: bench.downloadSpeed as number,
          uploadSpeed: bench.uploadSpeed as number,
          latency: bench.latency as number,
          jitter: bench.jitter as number,
          packetLoss: bench.packetLoss as number,
          startedAt: bench.startedAt as number,
          completedAt: bench.completedAt as number,
          error: bench.error as string,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.startedAt || 0) - (a?.startedAt || 0));
  }, [benchmarkIds, benchmarksData, devicesData, deviceId]);

  const runBenchmark = useCallback(async () => {
    if (!sourceDevice || !targetDevice) return;

    setIsRunning(true);
    try {
      await fetch("/api/openwrt/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceDeviceId: sourceDevice,
          targetDeviceId: targetDevice,
        }),
      });
    } catch (error) {
      console.error("Failed to run benchmark:", error);
    } finally {
      setIsRunning(false);
    }
  }, [sourceDevice, targetDevice]);

  const deleteBenchmark = useCallback(async (benchmarkId: string) => {
    try {
      await fetch(`/api/openwrt/benchmarks/${benchmarkId}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.error("Failed to delete benchmark:", error);
    }
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ArrowDownUp className="h-5 w-5" />
          Speed Benchmark
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Benchmark Controls */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1 block">Source Device</label>
            <Select value={sourceDevice} onValueChange={setSourceDevice}>
              <SelectTrigger>
                <SelectValue placeholder="Select source..." />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem
                    key={device.id}
                    value={device.id}
                    disabled={device.status !== "online"}
                  >
                    {device.hostname}
                    {device.status !== "online" && " (offline)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ArrowDownUp className="h-5 w-5 text-muted-foreground mb-2" />

          <div className="flex-1">
            <label className="text-sm font-medium mb-1 block">Target Device</label>
            <Select value={targetDevice} onValueChange={setTargetDevice}>
              <SelectTrigger>
                <SelectValue placeholder="Select target..." />
              </SelectTrigger>
              <SelectContent>
                {devices
                  .filter((d) => d.id !== sourceDevice)
                  .map((device) => (
                    <SelectItem
                      key={device.id}
                      value={device.id}
                      disabled={device.status !== "online"}
                    >
                      {device.hostname}
                      {device.status !== "online" && " (offline)"}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={runBenchmark}
            disabled={!sourceDevice || !targetDevice || isRunning}
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run Test
          </Button>
        </div>

        {/* Benchmark Results */}
        {benchmarks.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <h4 className="font-medium text-sm">Recent Results</h4>
            {benchmarks.slice(0, 5).map((bench) => (
              <div
                key={bench?.id}
                className="p-3 rounded-lg border bg-card"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{bench?.sourceHostname}</span>
                    <ArrowDownUp className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{bench?.targetHostname}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {bench?.status === "running" ? (
                      <Badge variant="secondary" className="bg-blue-500 text-white">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Running
                      </Badge>
                    ) : bench?.status === "completed" ? (
                      <Badge variant="secondary" className="bg-green-500 text-white">
                        Completed
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="bg-red-500 text-white">
                        Failed
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => bench?.id && deleteBenchmark(bench.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {bench?.status === "completed" && (
                  <div className="grid grid-cols-5 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Download</div>
                      <div className="font-mono font-medium text-green-500">
                        {formatSpeed(bench.downloadSpeed || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Upload</div>
                      <div className="font-mono font-medium text-blue-500">
                        {formatSpeed(bench.uploadSpeed || 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Latency</div>
                      <div className="font-mono">
                        {bench.latency?.toFixed(2)} ms
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Jitter</div>
                      <div className="font-mono">
                        {bench.jitter?.toFixed(2)} ms
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Packet Loss</div>
                      <div className="font-mono">
                        {bench.packetLoss?.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                )}

                {bench?.status === "failed" && bench.error && (
                  <div className="flex items-center gap-2 text-sm text-red-500">
                    <AlertCircle className="h-4 w-4" />
                    {bench.error}
                  </div>
                )}

                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatTimeAgo(bench?.startedAt || 0)}
                </div>
              </div>
            ))}
          </div>
        )}

        {benchmarks.length === 0 && (
          <div className="text-center py-6 text-muted-foreground">
            <Wifi className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No benchmark results yet</p>
            <p className="text-sm">Select two devices and run a speed test</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
