import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, Plus, LogIn, Settings } from "lucide-react";

const items = [
  { title: "Sessions", url: "/sessions", icon: LayoutDashboard },
  { title: "Create", url: "/create", icon: Plus },
  { title: "Join", url: "/join", icon: LogIn },
  { title: "Settings", url: "/settings", icon: Settings },
];

const MobileNav = () => (
  <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden items-center justify-around py-2 px-1 mako-glass-solid border-t border-border/30">
    {items.map((item) => (
      <NavLink
        key={item.title}
        to={item.url}
        end
        className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-muted-foreground transition-colors"
        activeClassName="text-primary"
      >
        <item.icon className="h-5 w-5" />
        <span className="text-[10px] font-medium">{item.title}</span>
      </NavLink>
    ))}
  </nav>
);

export default MobileNav;
