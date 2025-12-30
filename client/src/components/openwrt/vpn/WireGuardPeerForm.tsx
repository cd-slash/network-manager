import { useState } from "react";
import { Loader2, Key, RefreshCw } from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WireGuardPeerData {
  id?: string;
  deviceId: string;
  interface: string;
  publicKey: string;
  presharedKey?: string;
  endpoint: string;
  allowedIps: string[];
  persistentKeepalive: number;
  enabled: boolean;
}

interface WireGuardPeerFormProps {
  peerData?: Partial<WireGuardPeerData>;
  deviceId?: string;
  isNew?: boolean;
  onSuccess?: () => void;
}

export function WireGuardPeerForm({
  peerData,
  deviceId: propDeviceId,
  isNew,
  onSuccess,
}: WireGuardPeerFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const deviceIds = useRowIds("openwrtDevices");
  const devicesData = useTable("openwrtDevices");

  const effectiveDeviceId = peerData?.deviceId || propDeviceId || "";

  const [formData, setFormData] = useState({
    deviceId: effectiveDeviceId,
    interface: peerData?.interface || "wg0",
    publicKey: peerData?.publicKey || "",
    presharedKey: "",
    endpoint: peerData?.endpoint || "",
    allowedIps: peerData?.allowedIps?.join("\n") || "0.0.0.0/0",
    persistentKeepalive: peerData?.persistentKeepalive || 25,
    enabled: peerData?.enabled ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const allowedIpsArray = formData.allowedIps
        .split("\n")
        .map((ip) => ip.trim())
        .filter((ip) => ip);

      const payload = {
        ...formData,
        allowedIps: allowedIpsArray,
      };

      const endpoint = isNew
        ? `/api/openwrt/devices/${formData.deviceId}/wireguard/peers`
        : `/api/openwrt/devices/${peerData?.deviceId}/wireguard/peers/${peerData?.id}`;

      const method = isNew ? "POST" : "PATCH";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isNew
            ? payload
            : {
                previousValue: {
                  publicKey: peerData?.publicKey,
                  endpoint: peerData?.endpoint,
                  allowedIps: peerData?.allowedIps,
                  persistentKeepalive: peerData?.persistentKeepalive,
                  enabled: peerData?.enabled,
                },
                proposedValue: payload,
              }
        ),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to queue change");
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const generateKeypair = async () => {
    // In real implementation, this would call the server to generate keys
    setError("Key generation requires server-side implementation");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isNew && (
        <div className="space-y-2">
          <Label htmlFor="deviceId">Device</Label>
          <Select
            value={formData.deviceId}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, deviceId: value }))
            }
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
        <Label htmlFor="interface">Interface</Label>
        <Select
          value={formData.interface}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, interface: value }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select interface" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="wg0">wg0</SelectItem>
            <SelectItem value="wg1">wg1</SelectItem>
            <SelectItem value="wg2">wg2</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="publicKey">Public Key</Label>
        <div className="flex gap-2">
          <Input
            id="publicKey"
            value={formData.publicKey}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, publicKey: e.target.value }))
            }
            placeholder="Peer's public key"
            className="font-mono"
            required
          />
          {isNew && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={generateKeypair}
              title="Generate keypair"
            >
              <Key className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {isNew && (
        <div className="space-y-2">
          <Label htmlFor="presharedKey">Preshared Key (Optional)</Label>
          <div className="flex gap-2">
            <Input
              id="presharedKey"
              type="password"
              value={formData.presharedKey}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, presharedKey: e.target.value }))
              }
              placeholder="Optional preshared key"
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={generateKeypair}
              title="Generate preshared key"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Adds an additional layer of symmetric-key encryption.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="endpoint">Endpoint</Label>
        <Input
          id="endpoint"
          value={formData.endpoint}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, endpoint: e.target.value }))
          }
          placeholder="hostname:port or leave empty for dynamic"
        />
        <p className="text-xs text-muted-foreground">
          Leave empty if this peer will initiate the connection.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="allowedIps">Allowed IPs</Label>
        <Textarea
          id="allowedIps"
          value={formData.allowedIps}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, allowedIps: e.target.value }))
          }
          placeholder="One CIDR per line"
          rows={3}
          className="font-mono"
        />
        <p className="text-xs text-muted-foreground">
          IP ranges this peer is allowed to use. One per line (e.g., 10.0.0.2/32).
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="persistentKeepalive">Persistent Keepalive (seconds)</Label>
        <Input
          id="persistentKeepalive"
          type="number"
          min={0}
          max={65535}
          value={formData.persistentKeepalive}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              persistentKeepalive: parseInt(e.target.value) || 0,
            }))
          }
        />
        <p className="text-xs text-muted-foreground">
          Set to 25 for NAT traversal. Set to 0 to disable.
        </p>
      </div>

      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          id="enabled"
          checked={formData.enabled}
          onCheckedChange={(checked) =>
            setFormData((prev) => ({ ...prev, enabled: checked === true }))
          }
        />
        <Label htmlFor="enabled" className="text-sm font-normal">
          Enable this peer
        </Label>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {success && (
        <div className="text-sm text-green-500">
          Change queued for approval successfully!
        </div>
      )}

      <div className="flex gap-2 pt-4">
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Queueing...
            </>
          ) : (
            "Queue Change"
          )}
        </Button>
      </div>
    </form>
  );
}
