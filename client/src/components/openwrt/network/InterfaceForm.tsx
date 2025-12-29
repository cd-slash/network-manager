import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface InterfaceData {
  id: string;
  deviceId: string;
  name: string;
  ifname: string;
  proto: string;
  ipaddr: string;
  netmask: string;
  gateway: string;
  mtu: number;
  enabled: boolean;
}

interface InterfaceFormProps {
  interfaceData: InterfaceData;
  onSuccess?: () => void;
}

export function InterfaceForm({ interfaceData, onSuccess }: InterfaceFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    proto: interfaceData.proto,
    ipaddr: interfaceData.ipaddr,
    netmask: interfaceData.netmask,
    gateway: interfaceData.gateway,
    mtu: interfaceData.mtu,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(
        `/api/openwrt/devices/${interfaceData.deviceId}/network/interfaces/${interfaceData.name}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previousValue: {
              proto: interfaceData.proto,
              ipaddr: interfaceData.ipaddr,
              netmask: interfaceData.netmask,
              gateway: interfaceData.gateway,
              mtu: interfaceData.mtu,
            },
            proposedValue: formData,
          }),
        }
      );

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

  const isStatic = formData.proto === "static";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
            <SelectItem value="static">Static</SelectItem>
            <SelectItem value="dhcp">DHCP Client</SelectItem>
            <SelectItem value="pppoe">PPPoE</SelectItem>
            <SelectItem value="none">Unmanaged</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isStatic && (
        <>
          <div className="space-y-2">
            <Label htmlFor="ipaddr">IP Address</Label>
            <Input
              id="ipaddr"
              value={formData.ipaddr}
              onChange={(e) => setFormData((prev) => ({ ...prev, ipaddr: e.target.value }))}
              placeholder="192.168.1.1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="netmask">Netmask</Label>
            <Input
              id="netmask"
              value={formData.netmask}
              onChange={(e) => setFormData((prev) => ({ ...prev, netmask: e.target.value }))}
              placeholder="255.255.255.0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gateway">Gateway</Label>
            <Input
              id="gateway"
              value={formData.gateway}
              onChange={(e) => setFormData((prev) => ({ ...prev, gateway: e.target.value }))}
              placeholder="192.168.1.254"
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="mtu">MTU</Label>
        <Input
          id="mtu"
          type="number"
          value={formData.mtu}
          onChange={(e) => setFormData((prev) => ({ ...prev, mtu: parseInt(e.target.value) || 1500 }))}
          min={68}
          max={9000}
        />
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

      <p className="text-xs text-muted-foreground">
        Changes will be added to the approval queue and executed after approval.
      </p>
    </form>
  );
}
