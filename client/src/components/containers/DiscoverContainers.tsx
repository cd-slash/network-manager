import { useState } from "react";
import { RefreshCw, Wifi } from "lucide-react";
import { useRow, useStore } from "tinybase/ui-react";
import { Button } from "@/components/ui/button";

interface DiscoveredContainer {
  tailscaleId: string;
  hostname: string;
  name: string;
  tailscaleIp: string;
  tags: string[];
  online: boolean;
  lastSeen: string;
}

export function DiscoverContainers() {
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
        body: JSON.stringify({ tailnetId, apiKey, serverTag: "tag:code-agent" }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch containers");
      }

      const containers: DiscoveredContainer[] = data.servers;
      let added = 0;

      for (const container of containers) {
        const existingRow = store.getRow("containers", container.tailscaleId);
        if (!existingRow || Object.keys(existingRow).length === 0) {
          store.setRow("containers", container.tailscaleId, {
            tailscaleId: container.tailscaleId,
            hostname: container.hostname,
            tailscaleIp: container.tailscaleIp,
            tags: JSON.stringify(container.tags),
            repo: "",
            branch: "",
            projectName: "",
            agentType: "",
            taskId: "",
            status: container.online ? "connected" : "disconnected",
            lastSeen: new Date(container.lastSeen).getTime(),
            createdAt: Date.now(),
          });
          added++;
        } else {
          store.setPartialRow("containers", container.tailscaleId, {
            hostname: container.hostname,
            tailscaleIp: container.tailscaleIp,
            tags: JSON.stringify(container.tags),
            status: container.online ? "connected" : "disconnected",
            lastSeen: new Date(container.lastSeen).getTime(),
          });
        }
      }

      setLastResult({ found: containers.length, added });
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
        Discover Containers
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
