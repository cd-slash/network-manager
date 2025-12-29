import { Badge } from "@/components/ui/badge";
import type { ServerStatus } from "@/store";

interface ServerStatusBadgeProps {
  status: ServerStatus;
}

const statusConfig: Record<
  ServerStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  online: { label: "Online", variant: "success" },
  busy: { label: "Busy", variant: "warning" },
  draining: { label: "Draining", variant: "secondary" },
  offline: { label: "Offline", variant: "destructive" },
};

export function ServerStatusBadge({ status }: ServerStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.offline;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
