import { useMemo } from "react";
import { Calendar, Clock, GitPullRequest, Play, Trash2 } from "lucide-react";
import { useRow, useStore } from "tinybase/ui-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { Badge } from "@/components/ui/badge";

interface TaskDetailProps {
  taskId: string;
  onBack?: () => void;
  onStartTask?: (taskId: string) => void;
  showActions?: boolean;
}

function formatTime(timestamp: number): string {
  if (!timestamp) return "N/A";
  return new Date(timestamp).toLocaleString();
}

function formatTimeAgo(timestamp: number): string {
  if (!timestamp) return "Never";
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function TaskDetail({ taskId, onBack, onStartTask, showActions }: TaskDetailProps) {
  const store = useStore();
  const taskData = useRow("tasks", taskId);
  const row = taskData || {};

  const relatedData = useMemo(() => {
    const phaseId = row.phaseId as string;
    const phaseName = phaseId ? (store?.getCell("phases", phaseId, "name") as string) : "";
    
    const containerId = row.containerId as string;
    const containerHostname = containerId ? (store?.getCell("containers", containerId, "hostname") as string) : "";
    
    const agentId = row.agentId as string;
    const agentType = agentId ? (store?.getCell("agents", agentId, "type") as string) : "";
    const agentStatus = agentId ? (store?.getCell("agents", agentId, "status") as string) : "";
    
    return {
      phaseName,
      containerHostname,
      agentType,
      agentStatus,
    };
  }, [row.phaseId, row.containerId, row.agentId, store]);

  const handleStart = () => {
    if (onStartTask) {
      onStartTask(taskId);
    }
  };

  const handleDelete = () => {
    store?.delRow("tasks", taskId);
    if (onBack) onBack();
  };

  const canStart = (row.status as string) === "pending";

  return (
    <div className="flex flex-col h-full min-h-0">
      {showActions !== false && (
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-b">
          {canStart && onStartTask && (
            <Button onClick={handleStart} size="sm">
              <Play className="h-4 w-4 mr-2" />
              Start Task
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <Card>
          <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-2xl mb-2">{row.title as string || "Untitled Task"}</CardTitle>
                  <p className="text-muted-foreground">{row.description as string || "No description"}</p>
                </div>
                <TaskStatusBadge status={row.status as any} />
              </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {relatedData.phaseName && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Phase:</span>
                <Badge variant="secondary">{relatedData.phaseName}</Badge>
              </div>
            )}
            {row.type && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Type:</span>
                <Badge variant="outline" className="capitalize">{row.type as string}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {(relatedData.containerHostname || relatedData.agentType) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assignment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {relatedData.containerHostname && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Container:</span>
                  <span className="font-medium">{relatedData.containerHostname}</span>
                </div>
              )}
              {relatedData.agentType && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Agent:</span>
                  <Badge className="capitalize">{relatedData.agentType}</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {row.prompt && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Prompt</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap text-sm bg-muted p-4 rounded-md">
                {row.prompt}
              </pre>
            </CardContent>
          </Card>
        )}

        {(row.prUrl || row.prNumber) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pull Request</CardTitle>
            </CardHeader>
            <CardContent>
              {row.prUrl && (
                <a
                  href={String(row.prUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-2"
                >
                  <GitPullRequest className="h-4 w-4" />
                  {String(row.prUrl)}
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {row.reviewSummary && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Review Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{row.reviewSummary}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(row.createdAt as number) > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">Created</div>
                  <div className="text-muted-foreground">{formatTimeAgo(row.createdAt as number)}</div>
                </div>
                <div className="text-muted-foreground text-xs">{formatTime(row.createdAt as number)}</div>
              </div>
            )}
            {(row.startedAt as number) > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <Play className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">Started</div>
                  <div className="text-muted-foreground">{formatTimeAgo(row.startedAt as number)}</div>
                </div>
                <div className="text-muted-foreground text-xs">{formatTime(row.startedAt as number)}</div>
              </div>
            )}
            {(row.completedAt as number) > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">Created</div>
                  <div className="text-muted-foreground">{formatTimeAgo(row.createdAt as number)}</div>
                </div>
                <div className="text-muted-foreground text-xs">{formatTime(row.createdAt as number)}</div>
              </div>
            )}
            {(row.startedAt as number) > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <Play className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">Started</div>
                  <div className="text-muted-foreground">{formatTimeAgo(row.startedAt as number)}</div>
                </div>
                <div className="text-muted-foreground text-xs">{formatTime(row.startedAt as number)}</div>
              </div>
            )}
            {(row.completedAt as number) > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">Completed</div>
                  <div className="text-muted-foreground">{formatTimeAgo(row.completedAt as number)}</div>
                </div>
                <div className="text-muted-foreground text-xs">{formatTime(row.completedAt as number)}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
