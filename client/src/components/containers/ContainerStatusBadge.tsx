import { Badge } from "@/components/ui/badge";
import type { ContainerStatus } from "@/store";

interface ContainerStatusBadgeProps {
  status: ContainerStatus;
}

const statusConfig: Record<
  ContainerStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  connected: { label: "Connected", variant: "success" },
  starting: { label: "Starting", variant: "warning" },
  disconnected: { label: "Disconnected", variant: "secondary" },
  error: { label: "Error", variant: "destructive" },
};

export function ContainerStatusBadge({ status }: ContainerStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.disconnected;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
