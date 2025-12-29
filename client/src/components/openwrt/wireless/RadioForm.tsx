import { useState } from "react";
import { Loader2 } from "lucide-react";
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

interface RadioData {
  id: string;
  deviceId: string;
  name: string;
  band: string;
  channel: number;
  htmode: string;
  txpower: number;
  country: string;
  disabled: boolean;
}

interface RadioFormProps {
  radioData: RadioData;
  onSuccess?: () => void;
}

const channels2g = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const channels5g = [0, 36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144, 149, 153, 157, 161, 165];

const htmodes2g = ["HT20", "HT40", "HE20", "HE40"];
const htmodes5g = ["VHT20", "VHT40", "VHT80", "VHT160", "HE20", "HE40", "HE80", "HE160"];

export function RadioForm({ radioData, onSuccess }: RadioFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    channel: radioData.channel,
    htmode: radioData.htmode,
    txpower: radioData.txpower,
    country: radioData.country,
    disabled: radioData.disabled,
  });

  const is5g = radioData.band === "5g";
  const channels = is5g ? channels5g : channels2g;
  const htmodes = is5g ? htmodes5g : htmodes2g;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(
        `/api/openwrt/devices/${radioData.deviceId}/wireless/radios/${radioData.name}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previousValue: {
              channel: radioData.channel,
              htmode: radioData.htmode,
              txpower: radioData.txpower,
              country: radioData.country,
              disabled: radioData.disabled,
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
        <Label htmlFor="channel">Channel</Label>
        <Select
          value={String(formData.channel)}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, channel: parseInt(value) }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select channel" />
          </SelectTrigger>
          <SelectContent>
            {channels.map((ch) => (
              <SelectItem key={ch} value={String(ch)}>
                {ch === 0 ? "Auto" : `Channel ${ch}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="htmode">Channel Width</Label>
        <Select
          value={formData.htmode}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, htmode: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select width" />
          </SelectTrigger>
          <SelectContent>
            {htmodes.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {mode}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="txpower">TX Power (dBm)</Label>
        <Input
          id="txpower"
          type="number"
          value={formData.txpower || ""}
          onChange={(e) => setFormData((prev) => ({ ...prev, txpower: parseInt(e.target.value) || 0 }))}
          placeholder="0 = Auto"
          min={0}
          max={30}
        />
        <p className="text-xs text-muted-foreground">0 = Auto (maximum allowed)</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="country">Country Code</Label>
        <Select
          value={formData.country}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, country: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select country" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="US">United States (US)</SelectItem>
            <SelectItem value="CA">Canada (CA)</SelectItem>
            <SelectItem value="GB">United Kingdom (GB)</SelectItem>
            <SelectItem value="DE">Germany (DE)</SelectItem>
            <SelectItem value="FR">France (FR)</SelectItem>
            <SelectItem value="JP">Japan (JP)</SelectItem>
            <SelectItem value="AU">Australia (AU)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="disabled"
          checked={formData.disabled}
          onCheckedChange={(checked) =>
            setFormData((prev) => ({ ...prev, disabled: checked === true }))
          }
        />
        <Label htmlFor="disabled" className="text-sm font-normal">
          Disable this radio
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

      <p className="text-xs text-muted-foreground">
        Changes will be added to the approval queue and executed after approval.
      </p>
    </form>
  );
}
