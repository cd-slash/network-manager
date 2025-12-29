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

interface RuleData {
  id?: string;
  deviceId: string;
  name: string;
  src: string;
  srcIp: string;
  srcPort: string;
  dest: string;
  destIp: string;
  destPort: string;
  proto: string;
  target: string;
  enabled: boolean;
}

interface RuleFormProps {
  ruleData?: Partial<RuleData>;
  deviceId?: string;
  isNew?: boolean;
  onSuccess?: () => void;
}

export function RuleForm({ ruleData, deviceId: propDeviceId, isNew, onSuccess }: RuleFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const deviceIds = useRowIds("openwrtDevices");
  const devicesData = useTable("openwrtDevices");
  const zonesData = useTable("firewallZones");
  const zoneIds = useRowIds("firewallZones");

  const effectiveDeviceId = ruleData?.deviceId || propDeviceId || "";

  const [formData, setFormData] = useState({
    deviceId: effectiveDeviceId,
    name: ruleData?.name || "",
    src: ruleData?.src || "lan",
    srcIp: ruleData?.srcIp || "",
    srcPort: ruleData?.srcPort || "",
    dest: ruleData?.dest || "wan",
    destIp: ruleData?.destIp || "",
    destPort: ruleData?.destPort || "",
    proto: ruleData?.proto || "tcp",
    target: ruleData?.target || "ACCEPT",
    enabled: ruleData?.enabled ?? true,
  });

  // Get zones for selected device
  const deviceZones = zoneIds
    .filter((id) => zonesData[id]?.deviceId === formData.deviceId)
    .map((id) => ({
      id,
      name: (zonesData[id]?.name as string) || id,
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const endpoint = isNew
        ? `/api/openwrt/devices/${formData.deviceId}/firewall/rules`
        : `/api/openwrt/devices/${ruleData?.deviceId}/firewall/rules/${ruleData?.id}`;

      const method = isNew ? "POST" : "PATCH";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isNew ? formData : {
          previousValue: {
            name: ruleData?.name,
            src: ruleData?.src,
            srcIp: ruleData?.srcIp,
            srcPort: ruleData?.srcPort,
            dest: ruleData?.dest,
            destIp: ruleData?.destIp,
            destPort: ruleData?.destPort,
            proto: ruleData?.proto,
            target: ruleData?.target,
            enabled: ruleData?.enabled,
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
        <Label htmlFor="name">Rule Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
          placeholder="Allow SSH from LAN"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="src">Source Zone</Label>
          <Select
            value={formData.src}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, src: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="*">Any (*)</SelectItem>
              {deviceZones.map((zone) => (
                <SelectItem key={zone.id} value={zone.name}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dest">Destination Zone</Label>
          <Select
            value={formData.dest}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, dest: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select zone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="*">Any (*)</SelectItem>
              {deviceZones.map((zone) => (
                <SelectItem key={zone.id} value={zone.name}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="srcIp">Source IP (optional)</Label>
          <Input
            id="srcIp"
            value={formData.srcIp}
            onChange={(e) => setFormData((prev) => ({ ...prev, srcIp: e.target.value }))}
            placeholder="192.168.1.0/24"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="srcPort">Source Port (optional)</Label>
          <Input
            id="srcPort"
            value={formData.srcPort}
            onChange={(e) => setFormData((prev) => ({ ...prev, srcPort: e.target.value }))}
            placeholder="1024:65535"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="destIp">Destination IP (optional)</Label>
          <Input
            id="destIp"
            value={formData.destIp}
            onChange={(e) => setFormData((prev) => ({ ...prev, destIp: e.target.value }))}
            placeholder="0.0.0.0/0"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="destPort">Destination Port</Label>
          <Input
            id="destPort"
            value={formData.destPort}
            onChange={(e) => setFormData((prev) => ({ ...prev, destPort: e.target.value }))}
            placeholder="22, 80, 443"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
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
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="tcp">TCP</SelectItem>
              <SelectItem value="udp">UDP</SelectItem>
              <SelectItem value="tcp udp">TCP + UDP</SelectItem>
              <SelectItem value="icmp">ICMP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="target">Action</Label>
          <Select
            value={formData.target}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, target: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACCEPT">ACCEPT</SelectItem>
              <SelectItem value="REJECT">REJECT</SelectItem>
              <SelectItem value="DROP">DROP</SelectItem>
            </SelectContent>
          </Select>
        </div>
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
          Enable this rule
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
