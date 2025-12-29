import { useRowIds, useStore } from "tinybase/ui-react";
import {
  Home,
  Router,
  Network,
  Wifi,
  Shield,
  Server,
  Package,
  Wrench,
  ClipboardCheck,
  Settings,
  GitGraph,
  Activity,
  Radio,
  Users,
  Gauge,
  ScrollText,
  HardDrive,
  Key,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuBadge,
  SidebarRail,
} from "@/components/ui/sidebar";

const networkItems = [
  {
    title: "Routers",
    url: "#routers",
    icon: Router,
  },
  {
    title: "Topology",
    url: "#topology",
    icon: GitGraph,
  },
  {
    title: "Interfaces",
    url: "#interfaces",
    icon: Network,
  },
];

const wirelessItems = [
  {
    title: "Radios",
    url: "#radios",
    icon: Radio,
  },
  {
    title: "SSIDs",
    url: "#ssids",
    icon: Wifi,
  },
  {
    title: "Clients",
    url: "#clients",
    icon: Users,
  },
  {
    title: "Mesh",
    url: "#mesh",
    icon: Activity,
  },
];

const securityItems = [
  {
    title: "Firewall",
    url: "#firewall",
    icon: Shield,
  },
  {
    title: "VPN",
    url: "#vpn",
    icon: Key,
  },
];

const servicesItems = [
  {
    title: "DHCP/DNS",
    url: "#dhcp",
    icon: Server,
  },
  {
    title: "QoS/SQM",
    url: "#qos",
    icon: Gauge,
  },
  {
    title: "Packages",
    url: "#packages",
    icon: Package,
  },
];

const systemItems = [
  {
    title: "Services",
    url: "#services",
    icon: Wrench,
  },
  {
    title: "Logs",
    url: "#logs",
    icon: ScrollText,
  },
  {
    title: "Backups",
    url: "#backups",
    icon: HardDrive,
  },
];

const settingsItems = [
  {
    title: "Settings",
    url: "#settings",
    icon: Settings,
  },
];

function PendingChangesBadge() {
  const store = useStore();
  const changeIds = useRowIds("pendingChanges");

  const pendingCount = changeIds.filter((id) => {
    const status = store?.getCell("pendingChanges", id, "status");
    return status === "pending";
  }).length;

  if (pendingCount === 0) return null;

  return (
    <SidebarMenuBadge className="bg-warning text-warning-foreground">
      {pendingCount}
    </SidebarMenuBadge>
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center">
        <div className="flex items-center gap-2 px-2 h-8">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-[width] group-data-[collapsible=icon]:size-4 group-data-[collapsible=icon]:bg-transparent">
            <Router className="size-4 transition-all duration-200 group-data-[collapsible=icon]:size-5 group-data-[collapsible=icon]:text-primary" />
          </div>
          <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
            OpenWRT Manager
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* Dashboard */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Dashboard">
                  <a href="#">
                    <Home />
                    <span>Dashboard</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Network */}
        <SidebarGroup>
          <SidebarGroupLabel>Network</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {networkItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Wireless */}
        <SidebarGroup>
          <SidebarGroupLabel>Wireless</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {wirelessItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Security */}
        <SidebarGroup>
          <SidebarGroupLabel>Security</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {securityItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Services */}
        <SidebarGroup>
          <SidebarGroupLabel>Services</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {servicesItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* System */}
        <SidebarGroup>
          <SidebarGroupLabel>System</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {systemItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Approval Queue */}
        <SidebarGroup>
          <SidebarGroupLabel>Approval</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Approval Queue">
                  <a href="#approval">
                    <ClipboardCheck />
                    <span>Approval Queue</span>
                    <PendingChangesBadge />
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title}>
                    <a href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t text-xs text-muted-foreground">
        <span className="group-data-[collapsible=icon]:hidden">v0.1.0</span>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
