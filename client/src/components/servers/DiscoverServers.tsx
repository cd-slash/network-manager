import { useState } from "react";
import { RefreshCw, Wifi } from "lucide-react";
import { useRow, useStore } from "tinybase/ui-react";
import { Button } from "@/components/ui/button";

interface DiscoveredServer {
  tailscaleId: string;
  hostname: string;
  name: string;
  tailscaleIp: string;
  tags: string[];
  online: boolean;
  lastSeen: string;
}

export function DiscoverServers() {
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
      const res = await fetch(`/api/tailscale/devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tailnetId, apiKey, serverTag: "tag:server" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch servers");
      }

      const servers: DiscoveredServer[] = data.servers;
      let added = 0;

      const serversToRefresh: { id: string; host: string }[] = [];

      for (const server of servers) {
        const existingRow = store.getRow("servers", server.tailscaleId);
        if (!existingRow || Object.keys(existingRow).length === 0) {
          store.setRow("servers", server.tailscaleId, {
            tailscaleId: server.tailscaleId,
            hostname: server.hostname,
            tailscaleIp: server.tailscaleIp,
            tags: JSON.stringify(server.tags),
            status: server.online ? "online" : "offline",
            cpuLoad: 0,
            memoryTotal: 0,
            memoryAvailable: 0,
            containerCapacity: 4,
            activeContainers: 0,
            lastHealthCheck: 0,
            createdAt: Date.now(),
          });
          added++;
        } else {
          store.setPartialRow("servers", server.tailscaleId, {
            hostname: server.hostname,
            tailscaleIp: server.tailscaleIp,
            tags: JSON.stringify(server.tags),
          });
        }
        serversToRefresh.push({ id: server.tailscaleId, host: server.tailscaleIp });
      }

      setLastResult({ found: servers.length, added });

      for (const { id, host } of serversToRefresh) {
        fetch(`/api/servers/${id}/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ host, user: "root" }),
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
        Discover Servers
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
