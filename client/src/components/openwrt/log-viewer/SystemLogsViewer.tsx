import { useState, useCallback, useEffect, useRef } from "react";
import {
  RefreshCw,
  Download,
  Trash2,
  Loader2,
  Search,
  Filter,
  Pause,
  Play,
  ChevronDown,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LogEntry {
  id: string;
  timestamp: number;
  facility: string;
  severity: string;
  hostname: string;
  process: string;
  message: string;
}

const severityColors: Record<string, string> = {
  emerg: "bg-red-700 text-white",
  alert: "bg-red-600 text-white",
  crit: "bg-red-500 text-white",
  err: "bg-red-400 text-white",
  error: "bg-red-400 text-white",
  warning: "bg-yellow-500 text-black",
  warn: "bg-yellow-500 text-black",
  notice: "bg-blue-500 text-white",
  info: "bg-blue-400 text-white",
  debug: "bg-gray-500 text-white",
};

const facilities = [
  "kern",
  "user",
  "mail",
  "daemon",
  "auth",
  "syslog",
  "lpr",
  "news",
  "uucp",
  "cron",
  "authpriv",
  "ftp",
  "local0",
  "local1",
  "local2",
  "local3",
  "local4",
  "local5",
  "local6",
  "local7",
];

const severities = ["emerg", "alert", "crit", "err", "warning", "notice", "info", "debug"];

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

interface SystemLogsViewerProps {
  deviceId?: string;
}

export function SystemLogsViewer({ deviceId }: SystemLogsViewerProps) {
  const deviceIds = useRowIds("openwrtDevices");
  const devicesData = useTable("openwrtDevices");
  const logIds = useRowIds("systemLogs");
  const logsData = useTable("systemLogs");

  const [selectedDeviceId, setSelectedDeviceId] = useState(deviceId || "");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFacilities, setSelectedFacilities] = useState<Set<string>>(new Set());
  const [selectedSeverities, setSelectedSeverities] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const logs = useCallback((): LogEntry[] => {
    const result: LogEntry[] = [];
    for (const id of logIds) {
      const log = logsData[id];
      if (!log) continue;

      const devId = (log.deviceId as string) || "";
      if (selectedDeviceId && devId !== selectedDeviceId) continue;

      result.push({
        id,
        timestamp: (log.timestamp as number) || Date.now(),
        facility: (log.facility as string) || "daemon",
        severity: (log.severity as string) || "info",
        hostname: (log.hostname as string) || "",
        process: (log.process as string) || "",
        message: (log.message as string) || "",
      });
    }
    return result.sort((a, b) => a.timestamp - b.timestamp);
  }, [logIds, logsData, selectedDeviceId]);

  const filteredLogs = useCallback(() => {
    let result = logs();

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (log) =>
          log.message.toLowerCase().includes(query) ||
          log.process.toLowerCase().includes(query)
      );
    }

    if (selectedFacilities.size > 0) {
      result = result.filter((log) => selectedFacilities.has(log.facility));
    }

    if (selectedSeverities.size > 0) {
      result = result.filter((log) => selectedSeverities.has(log.severity));
    }

    return result;
  }, [logs, searchQuery, selectedFacilities, selectedSeverities]);

  const refreshLogs = useCallback(async () => {
    if (!selectedDeviceId) return;

    setIsLoading(true);
    try {
      const device = devicesData[selectedDeviceId];
      const host = (device?.tailscaleIp as string) || "";
      await fetch(`/api/openwrt/devices/${selectedDeviceId}/logs/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host }),
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedDeviceId, devicesData]);

  const clearLogs = useCallback(async () => {
    if (!selectedDeviceId) return;
    if (!confirm("Clear all logs on this device?")) return;

    try {
      await fetch(`/api/openwrt/devices/${selectedDeviceId}/logs`, {
        method: "DELETE",
      });
    } catch (err) {
      console.error("Failed to clear logs:", err);
    }
  }, [selectedDeviceId]);

  const downloadLogs = useCallback(() => {
    const logText = filteredLogs()
      .map(
        (log) =>
          `${formatTimestamp(log.timestamp)} ${log.hostname} ${log.process}: [${log.severity}] ${log.message}`
      )
      .join("\n");

    const blob = new Blob([logText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${selectedDeviceId || "all"}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredLogs, selectedDeviceId]);

  const toggleFacility = useCallback((facility: string) => {
    setSelectedFacilities((prev) => {
      const next = new Set(prev);
      if (next.has(facility)) {
        next.delete(facility);
      } else {
        next.add(facility);
      }
      return next;
    });
  }, []);

  const toggleSeverity = useCallback((severity: string) => {
    setSelectedSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(severity)) {
        next.delete(severity);
      } else {
        next.add(severity);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (autoScroll && scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logIds, autoScroll, isPaused]);

  const displayedLogs = filteredLogs();

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center">
        {!deviceId && (
          <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select device" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Devices</SelectItem>
              {deviceIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {(devicesData[id]?.hostname as string) || id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Filter className="h-4 w-4" />
              Facility
              {selectedFacilities.size > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {selectedFacilities.size}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            <DropdownMenuLabel>Facilities</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {facilities.map((f) => (
              <DropdownMenuCheckboxItem
                key={f}
                checked={selectedFacilities.has(f)}
                onCheckedChange={() => toggleFacility(f)}
              >
                {f}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1">
              <Filter className="h-4 w-4" />
              Severity
              {selectedSeverities.size > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {selectedSeverities.size}
                </Badge>
              )}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            <DropdownMenuLabel>Severities</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {severities.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={selectedSeverities.has(s)}
                onCheckedChange={() => toggleSeverity(s)}
              >
                <Badge className={`${severityColors[s]} mr-2`}>{s}</Badge>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex gap-1 ml-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? "Resume" : "Pause"}
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={refreshLogs}
            disabled={isLoading || !selectedDeviceId}
            title="Refresh"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={downloadLogs}
            title="Download logs"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={clearLogs}
            disabled={!selectedDeviceId}
            title="Clear logs"
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{displayedLogs.length} entries</span>
        {isPaused && (
          <Badge variant="secondary">Paused</Badge>
        )}
      </div>

      {/* Log entries */}
      <ScrollArea
        ref={scrollRef}
        className="flex-1 border rounded-md bg-black/50 font-mono text-sm"
      >
        <div className="p-2 space-y-0.5">
          {displayedLogs.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {selectedDeviceId
                ? "No logs found. Click refresh to fetch logs."
                : "Select a device to view logs."}
            </div>
          ) : (
            displayedLogs.map((log) => (
              <div
                key={log.id}
                className="flex gap-2 items-start hover:bg-muted/20 px-1 rounded"
              >
                <span className="text-muted-foreground whitespace-nowrap">
                  {formatTimestamp(log.timestamp)}
                </span>
                <Badge
                  className={`${severityColors[log.severity] || severityColors.info} text-xs shrink-0`}
                >
                  {log.severity}
                </Badge>
                <span className="text-blue-400 shrink-0">{log.process}</span>
                <span className="text-foreground break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
