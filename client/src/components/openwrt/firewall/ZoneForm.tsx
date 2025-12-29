import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ZoneData {
  id: string;
  deviceId: string;
  name: string;
  input: string;
  output: string;
  forward: string;
  masq: boolean;
  mtuFix: boolean;
  conntrack: boolean;
}

interface ZoneFormProps {
  zoneData: ZoneData;
  onSuccess?: () => void;
}

export function ZoneForm({ zoneData, onSuccess }: ZoneFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    input: zoneData.input,
    output: zoneData.output,
    forward: zoneData.forward,
    masq: zoneData.masq,
    mtuFix: zoneData.mtuFix,
    conntrack: zoneData.conntrack,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(
        `/api/openwrt/devices/${zoneData.deviceId}/firewall/zones/${zoneData.name}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previousValue: {
              input: zoneData.input,
              output: zoneData.output,
              forward: zoneData.forward,
              masq: zoneData.masq,
              mtuFix: zoneData.mtuFix,
              conntrack: zoneData.conntrack,
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

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="input">Input Policy</Label>
        <Select
          value={formData.input}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, input: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select policy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACCEPT">ACCEPT - Allow all incoming</SelectItem>
            <SelectItem value="REJECT">REJECT - Reject with response</SelectItem>
            <SelectItem value="DROP">DROP - Silently drop</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Policy for incoming traffic to this zone</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="output">Output Policy</Label>
        <Select
          value={formData.output}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, output: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select policy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACCEPT">ACCEPT - Allow all outgoing</SelectItem>
            <SelectItem value="REJECT">REJECT - Reject with response</SelectItem>
            <SelectItem value="DROP">DROP - Silently drop</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Policy for outgoing traffic from this zone</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="forward">Forward Policy</Label>
        <Select
          value={formData.forward}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, forward: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select policy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ACCEPT">ACCEPT - Allow forwarding</SelectItem>
            <SelectItem value="REJECT">REJECT - Reject with response</SelectItem>
            <SelectItem value="DROP">DROP - Silently drop</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Policy for forwarded traffic through this zone</p>
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="masq"
            checked={formData.masq}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({ ...prev, masq: checked === true }))
            }
          />
          <Label htmlFor="masq" className="text-sm font-normal">
            Enable Masquerading (NAT)
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="mtuFix"
            checked={formData.mtuFix}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({ ...prev, mtuFix: checked === true }))
            }
          />
          <Label htmlFor="mtuFix" className="text-sm font-normal">
            Enable MSS Clamping (MTU Fix)
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="conntrack"
            checked={formData.conntrack}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({ ...prev, conntrack: checked === true }))
            }
          />
          <Label htmlFor="conntrack" className="text-sm font-normal">
            Enable Connection Tracking
          </Label>
        </div>
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
