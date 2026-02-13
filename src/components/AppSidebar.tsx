import { Monitor, Plus, LogIn, Settings, LayoutDashboard } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Sessions", url: "/sessions", icon: LayoutDashboard },
  { title: "Create", url: "/create", icon: Plus },
  { title: "Join", url: "/join", icon: LogIn },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar className="border-r-0 mako-glass-solid" collapsible="icon">
      <div className="flex items-center gap-2 px-4 py-4">
        <Monitor className="h-5 w-5 text-primary shrink-0" />
        {!collapsed && (
          <span className="text-sm font-semibold tracking-[0.15em] uppercase text-foreground">
            MAKO
          </span>
        )}
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="relative flex items-center gap-3 px-3 py-2 rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/30"
                      activeClassName="text-foreground bg-muted/20 before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-[2px] before:h-5 before:bg-primary before:rounded-full"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span className="text-sm">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
