import { StrictMode, useState, useEffect } from "react";
import ReconnectingWebSocket from "reconnecting-websocket";
import { MergeableStore } from "tinybase";
import { createSessionPersister } from "tinybase/persisters/persister-browser";
import { createWsSynchronizer } from "tinybase/synchronizers/synchronizer-ws-client";
import {
  Provider,
  useCreateMergeableStore,
  useCreatePersister,
  useCreateSynchronizer,
  useRowIds,
  useTable,
} from "tinybase/ui-react";
import { Inspector } from "tinybase/ui-react-inspector";
import { createAppStore } from "@/store";
import { RoutersTable, DiscoverRouters } from "@/components/openwrt/devices";
import { InterfacesTable } from "@/components/openwrt/network";
import { RadiosTable, SSIDsTable, ClientsTable } from "@/components/openwrt/wireless";
import { ZonesTable, RulesTable, PortForwardsTable } from "@/components/openwrt/firewall";
import { DHCPLeasesTable, SQMConfigPanel } from "@/components/openwrt/services";
import { MeshNodesTable } from "@/components/openwrt/mesh";
import { NetworkTopology } from "@/components/openwrt/topology";
import { PackagesTable, SystemServicesTable } from "@/components/openwrt/system";
import { WireGuardPeersTable, OpenVPNTable } from "@/components/openwrt/vpn";
import { SystemLogsViewer } from "@/components/openwrt/log-viewer";
import { BackupsManager } from "@/components/openwrt/backups";
import { PendingChangesTable, ChangeHistoryTable } from "@/components/openwrt/approval";
import { Settings } from "@/components/settings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const deviceIds = useRowIds("openwrtDevices");
  const clientIds = useRowIds("wirelessClients");
  const changeIds = useRowIds("pendingChanges");
  const alertIds = useRowIds("alerts");
  const changesData = useTable("pendingChanges");
  const devicesData = useTable("openwrtDevices");

  const pendingCount = changeIds.filter((id) => changesData[id]?.status === "pending").length;
  const onlineDevices = deviceIds.filter((id) => devicesData[id]?.status === "online").length;

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Dashboard</h2>
      <p className="text-muted-foreground">
        Welcome to OpenWRT Manager. Use the sidebar to navigate your network infrastructure.
      </p>
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Routers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{deviceIds.length}</div>
            <p className="text-xs text-muted-foreground">{onlineDevices} online</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Wireless Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientIds.length}</div>
            <p className="text-xs text-muted-foreground">connected devices</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Changes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingCount}</div>
            <p className="text-xs text-muted-foreground">awaiting approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Alerts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alertIds.length}</div>
            <p className="text-xs text-muted-foreground">active alerts</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RoutersView() {
  return (
    <div className="p-6 h-full min-h-0">
      <RoutersTable
        globalActions={<DiscoverRouters />}
      />
    </div>
  );
}

function TopologyView() {
  return (
    <div className="h-full min-h-0">
      <NetworkTopology />
    </div>
  );
}

function InterfacesView() {
  return (
    <div className="p-6 h-full min-h-0">
      <InterfacesTable />
    </div>
  );
}

function RadiosView() {
  return (
    <div className="p-6 h-full min-h-0">
      <RadiosTable />
    </div>
  );
}

function SSIDsView() {
  return (
    <div className="p-6 h-full min-h-0">
      <SSIDsTable />
    </div>
  );
}

function ClientsView() {
  return (
    <div className="p-6 h-full min-h-0">
      <ClientsTable />
    </div>
  );
}

function MeshView() {
  return (
    <div className="p-6 h-full min-h-0">
      <MeshNodesTable />
    </div>
  );
}

function FirewallView() {
  return (
    <div className="p-6 h-full min-h-0">
      <Tabs defaultValue="zones" className="h-full flex flex-col">
        <TabsList>
          <TabsTrigger value="zones">Zones</TabsTrigger>
          <TabsTrigger value="rules">Traffic Rules</TabsTrigger>
          <TabsTrigger value="forwards">Port Forwards</TabsTrigger>
        </TabsList>
        <TabsContent value="zones" className="flex-1 min-h-0">
          <ZonesTable />
        </TabsContent>
        <TabsContent value="rules" className="flex-1 min-h-0">
          <RulesTable />
        </TabsContent>
        <TabsContent value="forwards" className="flex-1 min-h-0">
          <PortForwardsTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function VPNView() {
  return (
    <div className="p-6 h-full min-h-0">
      <Tabs defaultValue="wireguard" className="h-full flex flex-col">
        <TabsList>
          <TabsTrigger value="wireguard">WireGuard</TabsTrigger>
          <TabsTrigger value="openvpn">OpenVPN</TabsTrigger>
        </TabsList>
        <TabsContent value="wireguard" className="flex-1 min-h-0">
          <WireGuardPeersTable />
        </TabsContent>
        <TabsContent value="openvpn" className="flex-1 min-h-0">
          <OpenVPNTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DHCPView() {
  return (
    <div className="p-6 h-full min-h-0">
      <DHCPLeasesTable />
    </div>
  );
}

function QoSView() {
  return (
    <div className="p-6 overflow-y-auto">
      <SQMConfigPanel />
    </div>
  );
}

function PackagesView() {
  return (
    <div className="p-6 h-full min-h-0">
      <PackagesTable />
    </div>
  );
}

function ServicesView() {
  return (
    <div className="p-6 h-full min-h-0">
      <SystemServicesTable />
    </div>
  );
}

function LogsView() {
  return (
    <div className="p-6 h-full min-h-0">
      <SystemLogsViewer />
    </div>
  );
}

function BackupsView() {
  return (
    <div className="p-6 h-full min-h-0">
      <BackupsManager />
    </div>
  );
}

function ApprovalView() {
  return (
    <div className="p-6 h-full min-h-0">
      <Tabs defaultValue="pending" className="h-full flex flex-col">
        <TabsList>
          <TabsTrigger value="pending">Pending Changes</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="flex-1 min-h-0">
          <PendingChangesTable />
        </TabsContent>
        <TabsContent value="history" className="flex-1 min-h-0">
          <ChangeHistoryTable />
        </TabsContent>
      </Tabs>
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

  useEffect(() => {
    const onHashChange = () => {
      setHash(window.location.hash);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const renderContent = () => {
    // Network
    if (hash === "#routers") return <RoutersView />;
    if (hash === "#topology") return <TopologyView />;
    if (hash === "#interfaces") return <InterfacesView />;

    // Wireless
    if (hash === "#radios") return <RadiosView />;
    if (hash === "#ssids") return <SSIDsView />;
    if (hash === "#clients") return <ClientsView />;
    if (hash === "#mesh") return <MeshView />;

    // Security
    if (hash === "#firewall") return <FirewallView />;
    if (hash === "#vpn") return <VPNView />;

    // Services
    if (hash === "#dhcp") return <DHCPView />;
    if (hash === "#qos") return <QoSView />;
    if (hash === "#packages") return <PackagesView />;

    // System
    if (hash === "#services") return <ServicesView />;
    if (hash === "#logs") return <LogsView />;
    if (hash === "#backups") return <BackupsView />;

    // Approval
    if (hash === "#approval") return <ApprovalView />;

    // Settings
    if (hash === "#settings") return <SettingsView />;

    return <DashboardView />;
  };

  const getTitle = () => {
    // Network
    if (hash === "#routers") return "Routers";
    if (hash === "#topology") return "Network Topology";
    if (hash === "#interfaces") return "Interfaces";

    // Wireless
    if (hash === "#radios") return "Wireless Radios";
    if (hash === "#ssids") return "SSIDs";
    if (hash === "#clients") return "Wireless Clients";
    if (hash === "#mesh") return "Mesh Network";

    // Security
    if (hash === "#firewall") return "Firewall";
    if (hash === "#vpn") return "VPN";

    // Services
    if (hash === "#dhcp") return "DHCP & DNS";
    if (hash === "#qos") return "QoS / SQM";
    if (hash === "#packages") return "Packages";

    // System
    if (hash === "#services") return "Services";
    if (hash === "#logs") return "Logs";
    if (hash === "#backups") return "Backups";

    // Approval
    if (hash === "#approval") return "Approval Queue";

    // Settings
    if (hash === "#settings") return "Settings";

    return "Dashboard";
  };

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh flex flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 px-4 border-b">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="font-medium">{getTitle()}</div>
          <div className="ml-auto flex items-center gap-2">
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
