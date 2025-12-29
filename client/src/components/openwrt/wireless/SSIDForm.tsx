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

interface SSIDData {
  id?: string;
  deviceId: string;
  radioName?: string;
  ssid: string;
  mode?: string;
  encryption: string;
  key?: string;
  hidden: boolean;
  isolate: boolean;
  network: string;
  disabled: boolean;
}

interface SSIDFormProps {
  ssidData?: Partial<SSIDData>;
  deviceId?: string;
  isNew?: boolean;
  onSuccess?: () => void;
}

export function SSIDForm({ ssidData, deviceId: propDeviceId, isNew, onSuccess }: SSIDFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const deviceIds = useRowIds("openwrtDevices");
  const devicesData = useTable("openwrtDevices");
  const radiosData = useTable("wirelessRadios");
  const radioIds = useRowIds("wirelessRadios");

  const effectiveDeviceId = ssidData?.deviceId || propDeviceId || "";

  const [formData, setFormData] = useState({
    deviceId: effectiveDeviceId,
    radioName: ssidData?.radioName || "",
    ssid: ssidData?.ssid || "",
    mode: ssidData?.mode || "ap",
    encryption: ssidData?.encryption || "psk2",
    key: "",
    hidden: ssidData?.hidden || false,
    isolate: ssidData?.isolate || false,
    network: ssidData?.network || "lan",
    disabled: ssidData?.disabled || false,
  });

  // Get radios for selected device
  const deviceRadios = radioIds
    .filter((id) => {
      const radio = radiosData[id];
      return radio?.deviceId === formData.deviceId;
    })
    .map((id) => ({
      id,
      name: (radiosData[id]?.name as string) || id,
      band: (radiosData[id]?.band as string) || "",
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const endpoint = isNew
        ? `/api/openwrt/devices/${formData.deviceId}/wireless/networks`
        : `/api/openwrt/devices/${ssidData?.deviceId}/wireless/networks/${ssidData?.id}`;

      const method = isNew ? "POST" : "PATCH";

      const payload = isNew
        ? {
            radioName: formData.radioName,
            ssid: formData.ssid,
            mode: formData.mode,
            encryption: formData.encryption,
            key: formData.key,
            hidden: formData.hidden,
            isolate: formData.isolate,
            network: formData.network,
            disabled: formData.disabled,
          }
        : {
            previousValue: {
              ssid: ssidData?.ssid,
              encryption: ssidData?.encryption,
              hidden: ssidData?.hidden,
              isolate: ssidData?.isolate,
              network: ssidData?.network,
              disabled: ssidData?.disabled,
            },
            proposedValue: {
              ssid: formData.ssid,
              encryption: formData.encryption,
              key: formData.key || undefined,
              hidden: formData.hidden,
              isolate: formData.isolate,
              network: formData.network,
              disabled: formData.disabled,
            },
          };

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const needsKey = ["psk", "psk2", "psk-mixed", "sae", "sae-mixed"].includes(formData.encryption);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isNew && (
        <>
          <div className="space-y-2">
            <Label htmlFor="deviceId">Device</Label>
            <Select
              value={formData.deviceId}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, deviceId: value, radioName: "" }))}
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

          <div className="space-y-2">
            <Label htmlFor="radioName">Radio</Label>
            <Select
              value={formData.radioName}
              onValueChange={(value) => setFormData((prev) => ({ ...prev, radioName: value }))}
              disabled={!formData.deviceId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select radio" />
              </SelectTrigger>
              <SelectContent>
                {deviceRadios.map((radio) => (
                  <SelectItem key={radio.id} value={radio.name}>
                    {radio.name} ({radio.band || "Unknown"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="ssid">SSID (Network Name)</Label>
        <Input
          id="ssid"
          value={formData.ssid}
          onChange={(e) => setFormData((prev) => ({ ...prev, ssid: e.target.value }))}
          placeholder="MyNetwork"
          maxLength={32}
          required
        />
      </div>

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
            <SelectItem value="none">None (Open)</SelectItem>
            <SelectItem value="psk2">WPA2-PSK (Recommended)</SelectItem>
            <SelectItem value="sae">WPA3-SAE</SelectItem>
            <SelectItem value="sae-mixed">WPA2/WPA3 Mixed</SelectItem>
            <SelectItem value="psk-mixed">WPA/WPA2 Mixed</SelectItem>
            <SelectItem value="psk">WPA-PSK (Legacy)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {needsKey && (
        <div className="space-y-2">
          <Label htmlFor="key">Password</Label>
          <Input
            id="key"
            type="password"
            value={formData.key}
            onChange={(e) => setFormData((prev) => ({ ...prev, key: e.target.value }))}
            placeholder={isNew ? "Enter password" : "Leave empty to keep current"}
            minLength={8}
            maxLength={63}
            required={isNew}
          />
          <p className="text-xs text-muted-foreground">8-63 characters</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="network">Bridge Network</Label>
        <Select
          value={formData.network}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, network: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select network" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lan">LAN</SelectItem>
            <SelectItem value="guest">Guest</SelectItem>
            <SelectItem value="iot">IoT</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 pt-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="hidden"
            checked={formData.hidden}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({ ...prev, hidden: checked === true }))
            }
          />
          <Label htmlFor="hidden" className="text-sm font-normal">
            Hide SSID (don't broadcast)
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="isolate"
            checked={formData.isolate}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({ ...prev, isolate: checked === true }))
            }
          />
          <Label htmlFor="isolate" className="text-sm font-normal">
            Client isolation (prevent client-to-client traffic)
          </Label>
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
            Disable this network
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
