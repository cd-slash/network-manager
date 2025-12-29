import { useState, useMemo } from "react";
import {
  Gauge,
  ArrowUp,
  ArrowDown,
  Settings2,
  Loader2,
  Power,
  PowerOff,
} from "lucide-react";
import { useRowIds, useTable } from "tinybase/ui-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface SQMConfig {
  id: string;
  deviceId: string;
  deviceHostname: string;
  interface: string;
  enabled: boolean;
  download: number;
  upload: number;
  qdisc: string;
  script: string;
  linklayer: string;
  overhead: number;
}

function formatSpeed(kbps: number): string {
  if (kbps >= 1000000) {
    return `${(kbps / 1000000).toFixed(1)} Gbps`;
  }
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(0)} Mbps`;
  }
  return `${kbps} Kbps`;
}

interface SQMConfigPanelProps {
  deviceId?: string;
}

export function SQMConfigPanel({ deviceId }: SQMConfigPanelProps) {
  const sqmIds = useRowIds("sqmConfig");
  const sqmData = useTable("sqmConfig");
  const devicesData = useTable("openwrtDevices");

  const configs = useMemo<SQMConfig[]>(() => {
    return sqmIds
      .map((id) => {
        const row = sqmData[id] || {};
        const devId = (row.deviceId as string) || "";

        if (deviceId && devId !== deviceId) return null;

        const device = devicesData[devId] || {};

        return {
          id,
          deviceId: devId,
          deviceHostname: (device.hostname as string) || devId,
          interface: (row.interface as string) || "wan",
          enabled: (row.enabled as boolean) || false,
          download: (row.download as number) || 0,
          upload: (row.upload as number) || 0,
          qdisc: (row.qdisc as string) || "cake",
          script: (row.script as string) || "piece_of_cake.qos",
          linklayer: (row.linklayer as string) || "ethernet",
          overhead: (row.overhead as number) || 44,
        };
      })
      .filter((row): row is SQMConfig => row !== null);
  }, [sqmIds, sqmData, devicesData, deviceId]);

  if (configs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            Smart Queue Management (SQM)
          </CardTitle>
          <CardDescription>
            No SQM configuration found. SQM helps reduce bufferbloat and improves network responsiveness.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Install the sqm-scripts package on your OpenWRT devices to enable SQM configuration.
          </p>
          <Button variant="outline">Configure SQM</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {configs.map((config) => (
        <SQMConfigCard key={config.id} config={config} showDevice={!deviceId} />
      ))}
    </div>
  );
}

function SQMConfigCard({ config, showDevice }: { config: SQMConfig; showDevice?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gauge className="h-5 w-5" />
            {config.interface}
            {showDevice && (
              <Badge variant="outline" className="ml-2">
                {config.deviceHostname}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {config.enabled ? (
              <Badge variant="success" className="gap-1">
                <Power className="h-3 w-3" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1">
                <PowerOff className="h-3 w-3" />
                Disabled
              </Badge>
            )}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon">
                  <Settings2 className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent className="sm:max-w-lg">
                <SheetHeader>
                  <SheetTitle>Configure SQM: {config.interface}</SheetTitle>
                  <SheetDescription>
                    Adjust QoS settings for this interface. Changes will be queued for approval.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  <SQMForm config={config} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <ArrowDown className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-sm text-muted-foreground">Download</div>
              <div className="text-lg font-semibold">{formatSpeed(config.download)}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <ArrowUp className="h-5 w-5 text-blue-500" />
            <div>
              <div className="text-sm text-muted-foreground">Upload</div>
              <div className="text-lg font-semibold">{formatSpeed(config.upload)}</div>
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline">Queue: {config.qdisc.toUpperCase()}</Badge>
          <Badge variant="outline">Script: {config.script}</Badge>
          <Badge variant="outline">Link: {config.linklayer}</Badge>
          <Badge variant="outline">Overhead: {config.overhead}B</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function SQMForm({ config, onSuccess }: { config: SQMConfig; onSuccess?: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    enabled: config.enabled,
    download: config.download,
    upload: config.upload,
    qdisc: config.qdisc,
    script: config.script,
    linklayer: config.linklayer,
    overhead: config.overhead,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(
        `/api/openwrt/devices/${config.deviceId}/sqm/${config.interface}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            previousValue: {
              enabled: config.enabled,
              download: config.download,
              upload: config.upload,
              qdisc: config.qdisc,
              script: config.script,
              linklayer: config.linklayer,
              overhead: config.overhead,
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
      <div className="flex items-center space-x-2">
        <Checkbox
          id="enabled"
          checked={formData.enabled}
          onCheckedChange={(checked) =>
            setFormData((prev) => ({ ...prev, enabled: checked === true }))
          }
        />
        <Label htmlFor="enabled" className="text-sm font-normal">
          Enable SQM on this interface
        </Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="download">Download Speed (Kbps)</Label>
        <Input
          id="download"
          type="number"
          value={formData.download}
          onChange={(e) => setFormData((prev) => ({ ...prev, download: parseInt(e.target.value) || 0 }))}
          placeholder="85000"
        />
        <p className="text-xs text-muted-foreground">
          Set to ~85-95% of your actual download speed for best results
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="upload">Upload Speed (Kbps)</Label>
        <Input
          id="upload"
          type="number"
          value={formData.upload}
          onChange={(e) => setFormData((prev) => ({ ...prev, upload: parseInt(e.target.value) || 0 }))}
          placeholder="10000"
        />
        <p className="text-xs text-muted-foreground">
          Set to ~85-95% of your actual upload speed for best results
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="qdisc">Queue Discipline</Label>
        <Select
          value={formData.qdisc}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, qdisc: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select qdisc" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cake">CAKE (Recommended)</SelectItem>
            <SelectItem value="fq_codel">fq_codel</SelectItem>
            <SelectItem value="sfq">SFQ</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="linklayer">Link Layer</Label>
        <Select
          value={formData.linklayer}
          onValueChange={(value) => setFormData((prev) => ({ ...prev, linklayer: value }))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select link layer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ethernet">Ethernet</SelectItem>
            <SelectItem value="atm">ATM (DSL)</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="overhead">Per-Packet Overhead (bytes)</Label>
        <Input
          id="overhead"
          type="number"
          value={formData.overhead}
          onChange={(e) => setFormData((prev) => ({ ...prev, overhead: parseInt(e.target.value) || 0 }))}
          min={0}
          max={256}
        />
        <p className="text-xs text-muted-foreground">
          Common values: Ethernet 38, PPPoE 44, DOCSIS 18, VLAN 42
        </p>
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

