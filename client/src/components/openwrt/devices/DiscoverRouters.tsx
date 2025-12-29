import { useState } from "react";
import { RefreshCw, Wifi } from "lucide-react";
import { useRow, useStore } from "tinybase/ui-react";
import { Button } from "@/components/ui/button";

interface DiscoveredDevice {
  tailscaleId: string;
  hostname: string;
  name: string;
  tailscaleIp: string;
  tags: string[];
  online: boolean;
  lastSeen: string;
}

export function DiscoverRouters() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ found: number; added: number } | null>(null);

  const settings = useRow("settings", "tailscale");
  const store = useStore();

  const tailnetId = (settings?.tailnetId as string) || "";
  const apiKey = (settings?.apiKey as string) || "";
  const isConfigured = tailnetId && apiKey;

  const handleDiscover = async () => {
    if (!isConfigured || !store) return;

    setLoading(true);
    setError(null);
    setLastResult(null);

    try {
      const res = await fetch(`/api/openwrt/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tailnetId, apiKey }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to discover devices");
      }

      const devices: DiscoveredDevice[] = data.devices;
      let added = 0;

      const devicesToConnect: { id: string; host: string }[] = [];

      for (const device of devices) {
        const existingRow = store.getRow("openwrtDevices", device.tailscaleId);
        if (!existingRow || Object.keys(existingRow).length === 0) {
          store.setRow("openwrtDevices", device.tailscaleId, {
            tailscaleId: device.tailscaleId,
            hostname: device.hostname,
            tailscaleIp: device.tailscaleIp,
            model: "",
            firmwareVersion: "",
            kernelVersion: "",
            architecture: "",
            uptime: 0,
            memoryTotal: 0,
            memoryFree: 0,
            memoryAvailable: 0,
            loadAvg1m: 0,
            loadAvg5m: 0,
            loadAvg15m: 0,
            role: "gateway",
            meshEnabled: false,
            meshProtocol: "",
            status: device.online ? "online" : "offline",
            lastSeen: Date.now(),
            lastConfigSync: 0,
            createdAt: Date.now(),
          });
          added++;
        } else {
          store.setPartialRow("openwrtDevices", device.tailscaleId, {
            hostname: device.hostname,
            tailscaleIp: device.tailscaleIp,
            status: device.online ? "online" : "offline",
            lastSeen: Date.now(),
          });
        }
        devicesToConnect.push({ id: device.tailscaleId, host: device.tailscaleIp });
      }

      setLastResult({ found: devices.length, added });

      // Connect to each device to get system info
      for (const { id, host } of devicesToConnect) {
        fetch(`/api/openwrt/devices/${id}/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host }),
        }).catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (!isConfigured) {
    return (
      <Button variant="outline" disabled className="gap-2">
        <Wifi className="h-4 w-4" />
        Configure Tailscale first
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        onClick={handleDiscover}
        disabled={loading}
        className="gap-2"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        Discover Routers
      </Button>
      {error && (
        <span className="text-sm text-destructive">{error}</span>
      )}
      {lastResult && (
        <span className="text-sm text-muted-foreground">
          Found {lastResult.found}, added {lastResult.added} new
        </span>
      )}
    </div>
  );
}
