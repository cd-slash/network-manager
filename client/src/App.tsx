import { StrictMode, useState, useEffect, useCallback } from "react";
import { ArrowLeft, Play, Trash2 } from "lucide-react";
import ReconnectingWebSocket from "reconnecting-websocket";
import { MergeableStore } from "tinybase";
import { createSessionPersister } from "tinybase/persisters/persister-browser";
import { createWsSynchronizer } from "tinybase/synchronizers/synchronizer-ws-client";
import {
  Provider,
  useCreateMergeableStore,
  useCreatePersister,
  useCreateSynchronizer,
  useStore,
} from "tinybase/ui-react";
import { Inspector } from "tinybase/ui-react-inspector";
import { createAppStore } from "@/store";
import { ServersTable, AddServerForm, DiscoverServers } from "@/components/servers";
import { ContainersTable, DiscoverContainers } from "@/components/containers";
import { AgentsTable } from "@/components/agents";
import { TasksTable, TaskDetail } from "@/components/tasks";
import { Settings } from "@/components/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

const SYNC_PATH = "/sync";

function SyncStatus({ status }: { status: string }) {
  const colors: Record<string, string> = {
    connected: "bg-success",
    connecting: "bg-warning",
    disconnected: "bg-destructive",
  };
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <div className={`h-2 w-2 rounded-full ${colors[status] ?? colors.disconnected}`} />
      {status === "connected" ? "Synced" : status}
    </div>
  );
}

function DashboardView() {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Dashboard</h2>
      <p className="text-muted-foreground">Welcome to Agent Coordinator. Use the sidebar to navigate.</p>
    </div>
  );
}

function ServersView() {
  return (
    <div className="p-6 h-full min-h-0">
      <ServersTable
        globalActions={
          <>
            <DiscoverServers />
            <AddServerForm />
          </>
        }
      />
    </div>
  );
}

function ProjectsView() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Project management coming soon...</p>
        </CardContent>
      </Card>
    </div>
  );
}

function ContainersView() {
  return (
    <div className="p-6 h-full min-h-0">
      <ContainersTable
        globalActions={<DiscoverContainers />}
      />
    </div>
  );
}

const API_URL = "";

interface UsageData {
  tokensUsed: number;
  tokensLimit: number;
  messagesCount: number;
  costEstimate: number;
}

interface UsageState {
  data: UsageData | null;
  loading: boolean;
  error: string | null;
}

function AgentsView() {
  const [usageState, setUsageState] = useState<UsageState>({
    data: null,
    loading: false,
    error: null,
  });

  const fetchUsage = useCallback(async () => {
    setUsageState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch(`${API_URL}/api/agents/usage`);
      const result = await response.json();
      if (result.error) {
        setUsageState({ data: null, loading: false, error: result.error });
      } else {
        setUsageState({ data: result.usage, loading: false, error: null });
      }
    } catch (err) {
      setUsageState({
        data: null,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to fetch usage data",
      });
    }
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  return (
    <div className="p-6 h-full min-h-0">
      <AgentsTable
        usageData={usageState.data}
        usageLoading={usageState.loading}
        usageError={usageState.error}
        onRefreshUsage={fetchUsage}
      />
    </div>
  );
}

function TasksView({ onStartTask, onTaskClick }: { onStartTask?: (taskId: string) => void; onTaskClick?: (taskId: string) => void }) {
  return (
    <div className="p-6 h-full min-h-0">
      <TasksTable onStartTask={onStartTask} onTaskClick={onTaskClick} />
    </div>
  );
}

function SettingsView() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <Settings />
        </CardContent>
      </Card>
    </div>
  );
}

function MainView({ syncStatus }: { syncStatus: string }) {
  const [hash, setHash] = useState(window.location.hash);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const store = useStore();

  const handleStartTask = (taskId: string) => {
    console.log("Starting task:", taskId);
  };

  const handleTaskClick = (taskId: string) => {
    setCurrentTaskId(taskId);
    window.location.hash = `#tasks/${taskId}`;
  };

  const handleBackToTasks = () => {
    setCurrentTaskId(null);
    window.location.hash = "#tasks";
  };

  const handleDeleteTask = (taskId: string) => {
    store?.delRow("tasks", taskId);
    setCurrentTaskId(null);
    window.location.hash = "#tasks";
  };

  const getCurrentTaskStatus = () => {
    if (!currentTaskId) return null;
    const taskData = store?.getRow("tasks", currentTaskId);
    return taskData?.status as string;
  };

  const canStartCurrentTask = () => {
    const status = getCurrentTaskStatus();
    return status === "pending";
  };

  useEffect(() => {
    const onHashChange = () => {
      const newHash = window.location.hash;
      setHash(newHash);
      const taskMatch = newHash.match(/^#tasks\/(.+)$/);
      setCurrentTaskId(taskMatch ? taskMatch[1] : null);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const renderContent = () => {
    const taskMatch = hash.match(/^#tasks\/(.+)$/);
    if (taskMatch) {
      return <TaskDetail taskId={taskMatch[1]} onBack={handleBackToTasks} onStartTask={handleStartTask} showActions={false} />;
    }
    if (hash === "#servers") return <ServersView />;
    if (hash === "#projects") return <ProjectsView />;
    if (hash === "#tasks") return <TasksView onStartTask={handleStartTask} onTaskClick={handleTaskClick} />;
    if (hash === "#containers") return <ContainersView />;
    if (hash === "#agents") return <AgentsView />;
    if (hash === "#settings") return <SettingsView />;
    return <DashboardView />;
  };

  const getTitle = () => {
    const taskMatch = hash.match(/^#tasks\/(.+)$/);
    if (taskMatch) return "Task Details";
    if (hash === "#servers") return "Servers";
    if (hash === "#projects") return "Projects";
    if (hash.startsWith("#tasks")) return "Tasks";
    if (hash === "#containers") return "Containers";
    if (hash === "#agents") return "Agents";
    if (hash === "#settings") return "Settings";
    return "Dashboard";
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh flex flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 border-b">
          {currentTaskId && (
            <Button variant="ghost" size="icon" onClick={handleBackToTasks}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="font-medium">{getTitle()}</div>
          <div className="ml-auto flex items-center gap-2">
            {currentTaskId && (
              <>
                {canStartCurrentTask() && (
                  <Button onClick={() => handleStartTask(currentTaskId)} size="sm">
                    <Play className="h-4 w-4 mr-2" />
                    Start Task
                  </Button>
                )}
                <Button variant="outline" size="icon" onClick={() => handleDeleteTask(currentTaskId)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </>
            )}
            <SyncStatus status={syncStatus} />
          </div>
        </header>
        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export function App() {
  const [syncStatus, setSyncStatus] = useState("connecting");

  const store = useCreateMergeableStore(createAppStore);

  useCreatePersister(
    store,
    (store) => createSessionPersister(store, `local://${SYNC_PATH}`),
    [],
    async (persister) => {
      await persister.startAutoLoad([{}, {}]);
      await persister.startAutoSave();
    }
  );

  useCreateSynchronizer(store, async (store: MergeableStore) => {
    const ws = new ReconnectingWebSocket(SYNC_PATH);

    ws.addEventListener("open", () => setSyncStatus("connected"));
    ws.addEventListener("close", () => setSyncStatus("disconnected"));
    ws.addEventListener("error", () => setSyncStatus("disconnected"));

    const synchronizer = await createWsSynchronizer(store, ws, 1);
    await synchronizer.startSync();

    synchronizer.getWebSocket().addEventListener("open", () => {
      synchronizer.load().then(() => synchronizer.save());
    });

    return synchronizer;
  });

  return (
    <StrictMode>
      <Provider store={store}>
        <div className="dark">
          <div className="min-h-screen bg-background text-foreground flex">
            <MainView syncStatus={syncStatus} />
          </div>
          <Inspector />
        </div>
      </Provider>
    </StrictMode>
  );
}
