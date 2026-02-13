import { Link } from "react-router-dom";
import { Plus, LogIn, Radio, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mockSessions } from "@/lib/mock-data";

const statusConfig = {
  live: { icon: Radio, label: "Live", className: "text-primary" },
  ended: { icon: CheckCircle2, label: "Ended", className: "text-muted-foreground" },
  scheduled: { icon: Clock, label: "Scheduled", className: "text-warning" },
};

const Sessions = () => (
  <div className="max-w-4xl mx-auto space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Sessions</h1>
        <p className="text-sm text-muted-foreground">Review and monitor live signal sessions</p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" className="gap-1.5 border-border/40">
          <Link to="/join"><LogIn className="h-3.5 w-3.5" /> Join</Link>
        </Button>
        <Button asChild size="sm" className="gap-1.5">
          <Link to="/create"><Plus className="h-3.5 w-3.5" /> Create</Link>
        </Button>
      </div>
    </div>

    <div className="grid gap-3">
      {mockSessions.map((session) => {
        const status = statusConfig[session.status];
        const StatusIcon = status.icon;
        return (
          <Link
            key={session.id}
            to={`/session/${session.id}`}
            className="mako-glass rounded-lg p-4 flex items-center justify-between gap-4 transition-all hover:bg-muted/20 hover:translate-y-[-1px] group"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${status.className}`}>
                <StatusIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{status.label}</span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  {session.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {session.inputCount} input{session.inputCount !== 1 ? "s" : ""} · PIN {session.pin}
                </p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {new Date(session.createdAt).toLocaleDateString()}
            </span>
          </Link>
        );
      })}
    </div>
  </div>
);

export default Sessions;
