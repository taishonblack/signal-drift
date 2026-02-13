import { Plus, LogIn, Settings, LayoutDashboard } from "lucide-react";
import { Link } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import MakoFinMark from "@/components/MakoFinMark";
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
  { title: "Account", url: "/account", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar className="border-r-0 mako-glass-solid" collapsible="icon">
      <Link
        to="/"
        className="flex items-center gap-2.5 px-4 py-4 group"
      >
        <MakoFinMark
          size={22}
          className="text-[rgba(230,246,255,0.85)] transition-colors group-hover:text-[hsl(var(--primary))]"
        />
        {!collapsed && (
          <span className="text-sm font-semibold tracking-[0.15em] uppercase text-foreground">
            MAKO
          </span>
        )}
      </Link>

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
