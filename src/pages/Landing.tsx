import { Link } from "react-router-dom";
import { ArrowRight, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-rails.jpg";

const Landing = () => (
  <div className="relative min-h-screen overflow-hidden bg-background">
    {/* Hero background image */}
    <div className="absolute inset-0">
      <img
        src={heroImage}
        alt="Digital signal infrastructure"
        className="w-full h-full object-cover object-center"
      />
      {/* Left-to-right text readability gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, hsla(210,50%,3.5%,0.95) 0%, hsla(210,50%,3.5%,0.85) 35%, hsla(210,50%,3.5%,0.4) 70%, hsla(210,50%,3.5%,0.2) 100%)",
        }}
      />
      {/* Bottom fade for seamless transition */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 50%, hsla(210,50%,3.5%,0.9) 85%, hsl(210,50%,3.5%) 100%)",
        }}
      />
    </div>

    {/* Content */}
    <div className="relative z-10 flex flex-col justify-center min-h-screen max-w-2xl px-8 md:px-16 lg:px-24">
      <div className="space-y-6">
        <h1 className="text-sm font-semibold tracking-[0.25em] uppercase text-primary">
          MAKO
        </h1>
        <p className="text-3xl md:text-5xl font-light leading-tight text-foreground">
          Live Signal
          <br />
          Intelligence
        </p>
        <p className="text-sm md:text-base text-muted-foreground max-w-md leading-relaxed">
          Broadcast-grade SRT stream monitoring. Pull up to 4 inputs, inspect
          codec and transport health in real time, and invite your team — all
          from one calm, enterprise control plane.
        </p>

        <div className="flex flex-wrap gap-3 pt-4">
          <Button asChild size="lg" className="gap-2 bg-primary/90 hover:bg-primary text-primary-foreground">
            <Link to="/create">
              Create Session
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="gap-2 border-border/40 text-foreground hover:bg-muted/30">
            <Link to="/join">
              <LogIn className="h-4 w-4" />
              Join Session
            </Link>
          </Button>
        </div>
      </div>
    </div>

    {/* Scroll hint */}
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 text-muted-foreground/50">
      <span className="text-[10px] uppercase tracking-widest">Explore</span>
      <div className="w-px h-6 bg-gradient-to-b from-muted-foreground/30 to-transparent" />
    </div>
  </div>
);

export default Landing;
