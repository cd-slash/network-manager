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

interface PortForwardData {
  id?: string;
  deviceId: string;
  name: string;
  src: string;
  srcDport: string;
  dest: string;
  destIp: string;
  destPort: string;
  proto: string;
  enabled: boolean;
}

interface PortForwardFormProps {
  forwardData?: Partial<PortForwardData>;
  deviceId?: string;
  isNew?: boolean;
  onSuccess?: () => void;
}

export function PortForwardForm({ forwardData, deviceId: propDeviceId, isNew, onSuccess }: PortForwardFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const deviceIds = useRowIds("openwrtDevices");
  const devicesData = useTable("openwrtDevices");

  const effectiveDeviceId = forwardData?.deviceId || propDeviceId || "";

  const [formData, setFormData] = useState({
    deviceId: effectiveDeviceId,
    name: forwardData?.name || "",
    src: forwardData?.src || "wan",
    srcDport: forwardData?.srcDport || "",
    dest: forwardData?.dest || "lan",
    destIp: forwardData?.destIp || "",
    destPort: forwardData?.destPort || "",
    proto: forwardData?.proto || "tcp udp",
    enabled: forwardData?.enabled ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const endpoint = isNew
        ? `/api/openwrt/devices/${formData.deviceId}/firewall/forwards`
        : `/api/openwrt/devices/${forwardData?.deviceId}/firewall/forwards/${forwardData?.id}`;

      const method = isNew ? "POST" : "PATCH";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? formData : {
          previousValue: {
            name: forwardData?.name,
            src: forwardData?.src,
            srcDport: forwardData?.srcDport,
            dest: forwardData?.dest,
            destIp: forwardData?.destIp,
            destPort: forwardData?.destPort,
            proto: forwardData?.proto,
            enabled: forwardData?.enabled,
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
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Web Server"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="proto">Protocol</Label>
        <Select
          value={formData.proto}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, proto: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select protocol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tcp">TCP only</SelectItem>
            <SelectItem value="udp">UDP only</SelectItem>
            <SelectItem value="tcp udp">TCP + UDP</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="srcDport">External Port(s)</Label>
        <Input
          id="srcDport"
          value={formData.srcDport}
          onChange={(e) => setFormData((prev) => ({ ...prev, srcDport: e.target.value }))}
          placeholder="80 or 8080-8090"
          required
        />
        <p className="text-xs text-muted-foreground">Single port or range (e.g., 8080-8090)</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="destIp">Internal IP Address</Label>
        <Input
          id="destIp"
          value={formData.destIp}
          onChange={(e) => setFormData((prev) => ({ ...prev, destIp: e.target.value }))}
          placeholder="192.168.1.100"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="destPort">Internal Port (optional)</Label>
        <Input
          id="destPort"
          value={formData.destPort}
          onChange={(e) => setFormData((prev) => ({ ...prev, destPort: e.target.value }))}
          placeholder="Same as external if empty"
        />
        <p className="text-xs text-muted-foreground">Leave empty to use same port as external</p>
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
          Enable this port forward
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
