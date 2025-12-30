import { useState } from "react";
import { Loader2 } from "lucide-react";
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

interface OpenVPNData {
  id?: string;
  deviceId: string;
  name: string;
  mode: string;
  protocol: string;
  port: number;
  device: string;
  remote: string;
  enabled: boolean;
}

interface OpenVPNFormProps {
  vpnData?: Partial<OpenVPNData>;
  deviceId?: string;
  isNew?: boolean;
  onSuccess?: () => void;
}

export function OpenVPNForm({
  vpnData,
  deviceId: propDeviceId,
  isNew,
  onSuccess,
}: OpenVPNFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const deviceIds = useRowIds("openwrtDevices");
  const devicesData = useTable("openwrtDevices");

  const effectiveDeviceId = vpnData?.deviceId || propDeviceId || "";

  const [formData, setFormData] = useState({
    deviceId: effectiveDeviceId,
    name: vpnData?.name || "",
    mode: vpnData?.mode || "client",
    protocol: vpnData?.protocol || "udp",
    port: vpnData?.port || 1194,
    device: vpnData?.device || "tun0",
    remote: vpnData?.remote || "",
    cipher: "AES-256-GCM",
    auth: "SHA256",
    compress: "lz4-v2",
    ca: "",
    cert: "",
    key: "",
    enabled: vpnData?.enabled ?? true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const endpoint = isNew
        ? `/api/openwrt/devices/${formData.deviceId}/openvpn`
        : `/api/openwrt/devices/${vpnData?.deviceId}/openvpn/${vpnData?.id}`;

      const method = isNew ? "POST" : "PATCH";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isNew
            ? formData
            : {
                previousValue: {
                  name: vpnData?.name,
                  mode: vpnData?.mode,
                  protocol: vpnData?.protocol,
                  port: vpnData?.port,
                  remote: vpnData?.remote,
                  enabled: vpnData?.enabled,
                },
                proposedValue: formData,
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
        <Label htmlFor="name">Instance Name</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, name: e.target.value }))
          }
          placeholder="my_vpn"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="mode">Mode</Label>
        <Select
          value={formData.mode}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, mode: value }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="server">Server</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="protocol">Protocol</Label>
          <Select
            value={formData.protocol}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, protocol: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select protocol" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="udp">UDP</SelectItem>
              <SelectItem value="tcp">TCP</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="port">Port</Label>
          <Input
            id="port"
            type="number"
            min={1}
            max={65535}
            value={formData.port}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                port: parseInt(e.target.value) || 1194,
              }))
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="device">TUN/TAP Device</Label>
        <Select
          value={formData.device}
          onValueChange={(value) =>
            setFormData((prev) => ({ ...prev, device: value }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select device" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="tun0">tun0 (Layer 3)</SelectItem>
            <SelectItem value="tun1">tun1 (Layer 3)</SelectItem>
            <SelectItem value="tap0">tap0 (Layer 2)</SelectItem>
            <SelectItem value="tap1">tap1 (Layer 2)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.mode === "client" && (
        <div className="space-y-2">
          <Label htmlFor="remote">Remote Server</Label>
          <Input
            id="remote"
            value={formData.remote}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, remote: e.target.value }))
            }
            placeholder="vpn.example.com"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="cipher">Cipher</Label>
          <Select
            value={formData.cipher}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, cipher: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select cipher" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AES-256-GCM">AES-256-GCM</SelectItem>
              <SelectItem value="AES-128-GCM">AES-128-GCM</SelectItem>
              <SelectItem value="CHACHA20-POLY1305">CHACHA20-POLY1305</SelectItem>
              <SelectItem value="AES-256-CBC">AES-256-CBC</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="auth">Auth</Label>
          <Select
            value={formData.auth}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, auth: value }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select auth" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SHA256">SHA256</SelectItem>
              <SelectItem value="SHA384">SHA384</SelectItem>
              <SelectItem value="SHA512">SHA512</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isNew && (
        <>
          <div className="space-y-2">
            <Label htmlFor="ca">CA Certificate</Label>
            <Textarea
              id="ca"
              value={formData.ca}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, ca: e.target.value }))
              }
              placeholder="-----BEGIN CERTIFICATE-----"
              rows={4}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cert">Client Certificate</Label>
            <Textarea
              id="cert"
              value={formData.cert}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, cert: e.target.value }))
              }
              placeholder="-----BEGIN CERTIFICATE-----"
              rows={4}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="key">Private Key</Label>
            <Textarea
              id="key"
              value={formData.key}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, key: e.target.value }))
              }
              placeholder="-----BEGIN PRIVATE KEY-----"
              rows={4}
              className="font-mono text-xs"
            />
          </div>
        </>
      )}

      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          id="enabled"
          checked={formData.enabled}
          onCheckedChange={(checked) =>
            setFormData((prev) => ({ ...prev, enabled: checked === true }))
          }
        />
        <Label htmlFor="enabled" className="text-sm font-normal">
          Enable this VPN instance
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
