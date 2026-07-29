import { Link } from "react-router-dom";
import { ArrowRight, SlidersHorizontal, MonitorPlay, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackDemoEvent } from "@/contexts/DemoModeProvider";
import { useEffect } from "react";

const STAGES = [
  {
    icon: SlidersHorizontal,
    title: "Configure",
    body: "Build a monitoring session and organize four incoming sources.",
  },
  {
    icon: MonitorPlay,
    title: "Monitor",
    body: "View feeds, switch layouts, inspect signal health, and monitor audio.",
  },
  {
    icon: ShieldAlert,
    title: "Respond",
    body: "Review Quinn AI findings, operator comments, and actionable incidents.",
  },
];

export default function ExploreLanding() {
  useEffect(() => {
    document.title = "Explore MAKO — Interactive Monitoring Demo";
    trackDemoEvent("explore_viewed");
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16 md:px-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">MAKO</p>
        <h1 className="mt-3 text-3xl font-light leading-tight text-foreground md:text-5xl">Explore MAKO</h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
          Walk through a complete monitoring session using four sample broadcast feeds.
        </p>

        <ol className="mt-10 grid gap-3 md:grid-cols-3">
          {STAGES.map((s, i) => (
            <li
              key={s.title}
              className="rounded-lg border border-border/20 bg-card/30 p-4 backdrop-blur-[18px]"
            >
              <div className="flex items-center gap-2">
                <s.icon className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-mono text-muted-foreground">{i + 1}</span>
                <h2 className="text-sm font-medium text-foreground">{s.title}</h2>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground/80">{s.body}</p>
            </li>
          ))}
        </ol>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="gap-2" onClick={() => trackDemoEvent("started")}>
            <Link to="/explore/create">
              Begin Interactive Demo <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="ghost">
            <Link to="/">Return Home</Link>
          </Button>
        </div>

        <p className="mt-6 text-[11px] text-muted-foreground/70">
          This demonstration uses mock media and sample operational data. Nothing is saved.
        </p>
      </div>
    </div>
  );
}
