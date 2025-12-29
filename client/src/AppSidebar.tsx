import {
  Home,
  Server,
  FolderKanban,
  Container,
  Bot,
  Settings,
  ListTodo,
} from 'lucide-react'

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
  SidebarRail,
} from '@/components/ui/sidebar'

const projectItems = [
  {
    title: 'Projects',
    url: '#projects',
    icon: FolderKanban,
  },
  {
    title: 'Tasks',
    url: '#tasks',
    icon: ListTodo,
  },
]

const infrastructureItems = [
  {
    title: 'Servers',
    url: '#servers',
    icon: Server,
  },
  {
    title: 'Containers',
    url: '#containers',
    icon: Container,
  },
  {
    title: 'Agents',
    url: '#agents',
    icon: Bot,
  },
]

const secondaryItems = [
  {
    title: 'Settings',
    url: '#settings',
    icon: Settings,
  },
]

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-16 justify-center">
        <div className="flex items-center gap-2 px-2 h-8">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-[width] group-data-[collapsible=icon]:size-4 group-data-[collapsible=icon]:bg-transparent">
            <Bot className="size-4 transition-all duration-200 group-data-[collapsible=icon]:size-5 group-data-[collapsible=icon]:text-primary" />
          </div>
          <span className="truncate font-semibold group-data-[collapsible=icon]:hidden">
            Agent Coordinator
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
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
        <SidebarGroup>
          <SidebarGroupLabel>Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {projectItems.map((item) => (
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
        <SidebarGroup>
          <SidebarGroupLabel>Infrastructure</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {infrastructureItems.map((item) => (
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
        <SidebarGroup>
          <SidebarGroupLabel>Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryItems.map((item) => (
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
  )
}
