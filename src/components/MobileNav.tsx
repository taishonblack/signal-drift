import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { LayoutDashboard, Plus, LogIn, ArrowLeft } from "lucide-react";
import MakoFinMark from "@/components/MakoFinMark";
import IdentityChip from "@/components/IdentityChip";

const items = [
  { title: "Sessions", url: "/sessions", icon: LayoutDashboard },
  { title: "Create", url: "/create", icon: Plus },
  { title: "Join", url: "/join", icon: LogIn },
];

/** Derive a short page title from the current path */
const pageTitles: Record<string, string> = {
  "/sessions": "Sessions",
  "/create": "Create",
  "/join": "Join",
  "/account": "Account",
};

const MobileNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/" || location.pathname === "/sessions";
  const pageTitle = pageTitles[location.pathname] || "";
  const isDeepPage = !isHome && !pageTitle;

  return (
    <>
      {/* Mobile top header */}
      <header className="flex md:hidden items-center justify-between h-12 px-4 border-b border-border/20 gap-2">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 transition-colors shrink-0"
          aria-label="Go to Home"
        >
          {isHome || !isDeepPage ? (
            <MakoFinMark
              size={18}
              className="text-[rgba(230,246,255,0.85)] active:text-[hsl(var(--primary))]"
            />
          ) : (
            <ArrowLeft className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <span className="text-xs font-medium text-foreground tracking-wide uppercase truncate">
          {isDeepPage ? "" : pageTitle || "Sessions"}
        </span>
        <div className="shrink-0">
          <IdentityChip compact />
        </div>
      </header>

      {/* Bottom tab bar */}
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
    </>
  );
};

export default MobileNav;
