import { useState } from "react";
import { Plus } from "lucide-react";
import { useAddRowCallback } from "tinybase/ui-react";
import { getUniqueId } from "tinybase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AddServerForm() {
  const [hostname, setHostname] = useState("");
  const [tailscaleIp, setTailscaleIp] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  const handleAddServer = useAddRowCallback(
    "servers",
    () => ({
      tailscaleId: getUniqueId(),
      hostname,
      tailscaleIp,
      tags: JSON.stringify(["tag:agent-host"]),
      status: "offline",
      cpuLoad: 0,
      memoryTotal: 0,
      memoryAvailable: 0,
      containerCapacity: 4,
      activeContainers: 0,
      lastHealthCheck: 0,
      createdAt: Date.now(),
    }),
    [hostname, tailscaleIp],
    undefined,
    () => {
      setHostname("");
      setTailscaleIp("");
      setIsExpanded(false);
    }
  );

  if (!isExpanded) {
    return (
      <Button variant="outline" onClick={() => setIsExpanded(true)}>
        <Plus aria-hidden="true" className="-ms-1 opacity-60" size={16} />
        Add Server
      </Button>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-lg">Add Server</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (hostname && tailscaleIp) {
              handleAddServer();
            }
          }}
          className="space-y-4"
        >
          <div>
            <label
              htmlFor="hostname"
              className="block text-sm font-medium mb-1.5"
            >
              Hostname
            </label>
            <input
              id="hostname"
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="vps-01"
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
              required
            />
          </div>
          <div>
            <label
              htmlFor="tailscaleIp"
              className="block text-sm font-medium mb-1.5"
            >
              Tailscale IP
            </label>
            <input
              id="tailscaleIp"
              type="text"
              value={tailscaleIp}
              onChange={(e) => setTailscaleIp(e.target.value)}
              placeholder="100.x.x.x"
              className="w-full px-3 py-2 border rounded-md bg-background text-foreground"
              required
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsExpanded(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!hostname || !tailscaleIp}>
              Add
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
