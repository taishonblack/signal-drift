import { Link } from "react-router-dom";
import { User, LogIn, UserPlus, Settings, LogOut, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useIdentity, clearMemberIdentity } from "@/lib/identity";
import { useAuth } from "@/hooks/useAuth";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const IdentityChip = ({ compact = false }: { compact?: boolean }) => {
  const identity = useIdentity();
  const { signOut } = useAuth();
  const [explainOpen, setExplainOpen] = useState(false);

  if (identity.kind === "anon") {
    return (
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground">
          <Link to="/account?mode=login">
            <LogIn className="h-3.5 w-3.5 md:mr-1" />
            <span className="hidden md:inline">Sign In</span>
          </Link>
        </Button>
        <Button asChild size="sm" className="h-7 text-xs">
          <Link to="/account?mode=signup">
            <UserPlus className="h-3.5 w-3.5 md:mr-1" />
            <span className="hidden md:inline">Create Account</span>
          </Link>
        </Button>
      </div>
    );
  }

  const initials =
    identity.kind === "member"
      ? identity.name.slice(0, 2).toUpperCase()
      : identity.name.slice(-2).toUpperCase();

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-2 h-7 px-2 rounded-md hover:bg-muted/20 transition-colors"
            aria-label="Identity menu"
          >
            <span
              className={`flex items-center justify-center h-5 w-5 rounded-full text-[9px] font-semibold ${
                identity.kind === "member"
                  ? "bg-primary/20 text-primary"
                  : "bg-muted/40 text-muted-foreground"
              }`}
            >
              {identity.kind === "member" ? initials : <User className="h-3 w-3" />}
            </span>
            {!compact && (
              <span className="text-xs text-foreground/90 truncate max-w-[160px]">
                {identity.kind === "guest" ? "Operator (Temporary)" : identity.name}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 mako-glass-solid border-border/20 p-2">
          {identity.kind === "guest" ? (
            <div className="space-y-1">
              <div className="px-2 py-2 border-b border-border/20 mb-1">
                <p className="text-xs text-muted-foreground">Signed in as</p>
                <p className="text-sm text-foreground">Operator (Temporary)</p>
                <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">{identity.name}</p>
              </div>
              <MenuLink to="/account?mode=login" icon={<LogIn className="h-3.5 w-3.5" />}>
                Sign In
              </MenuLink>
              <MenuLink to="/account?mode=signup" icon={<UserPlus className="h-3.5 w-3.5" />}>
                Create Account
              </MenuLink>
              <button
                onClick={() => setExplainOpen(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/20"
              >
                <Info className="h-3.5 w-3.5" />
                What changes when I sign in?
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-2 py-2 border-b border-border/20 mb-1">
                <p className="text-xs text-muted-foreground">Signed in as</p>
                <p className="text-sm text-foreground truncate">{identity.name}</p>
              </div>
              <MenuLink to="/account" icon={<Settings className="h-3.5 w-3.5" />}>
                Settings
              </MenuLink>
              <button
                onClick={async () => {
                  await signOut();
                  clearMemberIdentity();
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-destructive rounded-md hover:bg-muted/20"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
        <DialogContent className="mako-glass-solid border-border/20">
          <DialogHeader>
            <DialogTitle>What changes when you sign in</DialogTitle>
            <DialogDescription>
              MAKO is monitor-first. You can create sessions, monitor streams,
              invite others, transfer ownership, and take notes without an
              account.
            </DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-3">
            <p className="text-foreground font-medium">Signing in adds:</p>
            <ul className="space-y-1.5 pl-4 list-disc marker:text-primary/60">
              <li>Session history across devices</li>
              <li>Saved drafts and templates</li>
              <li>Personal address book</li>
              <li>Team sessions and shared layouts</li>
              <li>Incident timeline and diagnostics archive</li>
            </ul>
            <p className="text-xs text-muted-foreground/80 pt-2 border-t border-border/20">
              Nothing you're doing right now stops working. Identity is about
              persistence, not access.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

const MenuLink = ({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) => (
  <Link
    to={to}
    className="flex items-center gap-2 px-2 py-1.5 text-xs text-foreground hover:bg-muted/20 rounded-md"
  >
    {icon}
    {children}
  </Link>
);

export default IdentityChip;
