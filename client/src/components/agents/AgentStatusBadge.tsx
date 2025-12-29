import { Badge } from "@/components/ui/badge";
import type { AgentStatus } from "@/store";

interface AgentStatusBadgeProps {
  status: AgentStatus;
}

const statusConfig: Record<
  AgentStatus,
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" }
> = {
  idle: { label: "Idle", variant: "secondary" },
  working: { label: "Working", variant: "success" },
  paused: { label: "Paused", variant: "warning" },
  error: { label: "Error", variant: "destructive" },
};

export function AgentStatusBadge({ status }: AgentStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig.idle;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
