import { Badge } from "@/components/ui/badge";
import type { TaskStatus } from "@/store";

const statusConfig: Record<TaskStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  spawning: { label: "Spawning", variant: "outline" },
  implementing: { label: "Implementing", variant: "default" },
  reviewing: { label: "Reviewing", variant: "outline" },
  ready: { label: "Ready", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  merging: { label: "Merging", variant: "outline" },
  completed: { label: "Completed", variant: "secondary" },
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const config = statusConfig[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
