import { Badge } from "@/components/ui/badge";
import type { DeviceStatus } from "@/store";

interface DeviceStatusBadgeProps {
  status: DeviceStatus;
}

const statusConfig: Record<
  DeviceStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  online: { label: "Online", variant: "success" },
  offline: { label: "Offline", variant: "destructive" },
  unreachable: { label: "Unreachable", variant: "warning" },
};

export function DeviceStatusBadge({ status }: DeviceStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.offline;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
