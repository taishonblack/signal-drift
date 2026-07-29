import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FlaskConical, RotateCcw, LogOut } from "lucide-react";
import { DEMO_STAGES, type DemoStageId } from "@/lib/demo/demo-data";
import { useDemo } from "@/contexts/DemoModeProvider";

export function DemoBanner() {
  const { restartDemo } = useDemo();
  const navigate = useNavigate();

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/25 bg-primary/[0.07] px-4 py-2"
    >
      <span className="inline-flex items-center gap-1.5 rounded bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
        <FlaskConical className="h-3 w-3" /> Demo Mode
      </span>
      <p className="min-w-0 text-[11px] text-muted-foreground">
        You are exploring MAKO with sample feeds. No data is being saved.
      </p>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-[11px]"
          onClick={() => {
            restartDemo();
            navigate("/explore/create");
          }}
        >
          <RotateCcw className="h-3 w-3" /> Restart Demo
        </Button>
        <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-[11px]">
          <Link to="/">
            <LogOut className="h-3 w-3" /> Exit Demo
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function DemoProgress({ current }: { current: DemoStageId }) {
  const { tourDismissed, dismissTour } = useDemo();
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border/15 px-4 py-2">
      <ol className="flex items-center gap-1.5">
        {DEMO_STAGES.map((stage, i) => {
          const active = stage.id === current;
          return (
            <li key={stage.id}>
              <Link
                to={stage.path}
                aria-current={active ? "step" : undefined}
                className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
                }`}
              >
                <span className="font-mono opacity-70">{i + 1}</span>
                {stage.label}
              </Link>
            </li>
          );
        })}
      </ol>
      {!tourDismissed && (
        <Button size="sm" variant="ghost" className="ml-auto h-7 text-[11px]" onClick={dismissTour}>
          Explore Freely
        </Button>
      )}
    </div>
  );
}

export default function DemoShell({
  stage,
  children,
}: {
  stage: DemoStageId;
  children: React.ReactNode;
}) {
  useLocation();
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-background">
      <DemoBanner />
      <DemoProgress current={stage} />
      <main className="p-4 md:p-6">{children}</main>
    </div>
  );
}
