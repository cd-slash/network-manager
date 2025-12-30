import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { Button } from "@/components/ui/button";
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

interface MeshNodeData {
  id?: string;
  deviceId: string;
  meshId: string;
  protocol: string;
  role: string;
  channel: number;
  active: boolean;
}

interface MeshConfigFormProps {
  nodeData?: Partial<MeshNodeData>;
  deviceId?: string;
  isNew?: boolean;
  onSuccess?: () => void;
}

export function MeshConfigForm({ nodeData, deviceId: propDeviceId, isNew, onSuccess }: MeshConfigFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const deviceIds = useRowIds("openwrtDevices");
  const devicesData = useTable("openwrtDevices");

  const effectiveDeviceId = nodeData?.deviceId || propDeviceId || "";

  const [formData, setFormData] = useState({
    deviceId: effectiveDeviceId,
    meshId: nodeData?.meshId || "mesh0",
    protocol: nodeData?.protocol || "802.11s",
    role: nodeData?.role || "node",
    channel: nodeData?.channel || 1,
    encryption: "sae",
    key: "",
    active: nodeData?.active ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const endpoint = isNew
        ? `/api/openwrt/devices/${formData.deviceId}/mesh`
        : `/api/openwrt/devices/${nodeData?.deviceId}/mesh/${nodeData?.id}`;

      const method = isNew ? "POST" : "PATCH";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? formData : {
          previousValue: {
            meshId: nodeData?.meshId,
            protocol: nodeData?.protocol,
            role: nodeData?.role,
            channel: nodeData?.channel,
            active: nodeData?.active,
          },
          proposedValue: formData,
        }),
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isNew && (
        <div className="space-y-2">
          <Label htmlFor="deviceId">Device</Label>
          <Select
            value={formData.deviceId}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, deviceId: value }))}
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
        <Label htmlFor="protocol">Mesh Protocol</Label>
        <Select
          value={formData.protocol}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, protocol: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select protocol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="802.11s">802.11s (Recommended)</SelectItem>
            <SelectItem value="batman-adv">B.A.T.M.A.N. Advanced</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          802.11s is the standard WiFi mesh protocol. B.A.T.M.A.N. provides layer 2 mesh over any interface.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="meshId">Mesh ID</Label>
        <Input
          id="meshId"
          value={formData.meshId}
          onChange={(e) => setFormData((prev) => ({ ...prev, meshId: e.target.value }))}
          placeholder="mesh0"
          required
        />
        <p className="text-xs text-muted-foreground">
          All nodes in the same mesh network must use the same Mesh ID.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">Node Role</Label>
        <Select
          value={formData.role}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, role: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="gate">Gateway (Internet uplink)</SelectItem>
            <SelectItem value="node">Node (Repeater)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="channel">Channel</Label>
        <Select
          value={String(formData.channel)}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, channel: parseInt(value) }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select channel" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Channel 1 (2.4 GHz)</SelectItem>
            <SelectItem value="6">Channel 6 (2.4 GHz)</SelectItem>
            <SelectItem value="11">Channel 11 (2.4 GHz)</SelectItem>
            <SelectItem value="36">Channel 36 (5 GHz)</SelectItem>
            <SelectItem value="44">Channel 44 (5 GHz)</SelectItem>
            <SelectItem value="149">Channel 149 (5 GHz)</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          All mesh nodes must use the same channel.
        </p>
      </div>

      {isNew && (
        <>
          <div className="space-y-2">
            <Label htmlFor="encryption">Encryption</Label>
            <Select
              value={formData.encryption}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, encryption: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select encryption" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sae">SAE (WPA3 Mesh)</SelectItem>
                <SelectItem value="psk2">WPA2-PSK</SelectItem>
                <SelectItem value="none">None (Open)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.encryption !== "none" && (
            <div className="space-y-2">
              <Label htmlFor="key">Mesh Key</Label>
              <Input
                id="key"
                type="password"
                value={formData.key}
                onChange={(e) => setFormData((prev) => ({ ...prev, key: e.target.value }))}
                placeholder="Enter mesh encryption key"
                minLength={8}
                required={formData.encryption !== "none"}
              />
              <p className="text-xs text-muted-foreground">
                All nodes must use the same encryption key.
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          id="active"
          checked={formData.active}
          onCheckedChange={(checked) =>
            setFormData((prev) => ({ ...prev, active: checked === true }))
          }
        />
        <Label htmlFor="active" className="text-sm font-normal">
          Enable mesh on this device
        </Label>
      </div>

      {error && (
        <div className="text-sm text-destructive">{error}</div>
      )}

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
