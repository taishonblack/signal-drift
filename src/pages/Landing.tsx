import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-rails.jpg";

const Landing = () => (
  <div className="relative min-h-screen overflow-hidden bg-background">
    {/* Hero background image */}
    <div className="absolute inset-0">
      <img
        src={heroImage}
        alt="Digital signal infrastructure"
        className="w-full h-full object-cover object-center opacity-40"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, hsla(210,50%,3.5%,0.97) 0%, hsla(210,50%,3.5%,0.92) 35%, hsla(210,50%,3.5%,0.6) 70%, hsla(210,50%,3.5%,0.4) 100%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 50%, hsla(210,50%,3.5%,0.9) 85%, hsl(210,50%,3.5%) 100%)",
        }}
      />
    </div>

    {/* Content — manifesto */}
    <div className="relative z-10 flex flex-col justify-center min-h-screen max-w-xl px-8 md:px-16 lg:px-24">
      <div className="space-y-8">
        <div className="space-y-3">
          <h1 className="text-xs font-semibold tracking-[0.3em] uppercase text-primary">
            MAKO
          </h1>
          <p className="text-2xl md:text-4xl font-light leading-tight text-foreground">
            Real-Time Contribution Monitoring
          </p>
        </div>

        <div className="space-y-1 text-sm md:text-base text-muted-foreground leading-relaxed max-w-sm">
          <p>Pull once.</p>
          <p>See clearly.</p>
          <p>Decide with confidence.</p>
        </div>

        <div className="pt-2">
          <Button
            asChild
            size="lg"
            className="gap-2 bg-primary/90 hover:bg-primary text-primary-foreground"
          >
            <Link to="/create">
              Create a Session
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Manifesto sections */}
        <div className="space-y-8 pt-12 border-t border-border/10 max-w-sm">
          <section className="space-y-2">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
              The Problem
            </h2>
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              SRT is point-to-point. Live production is not. When a contribution
              feed arrives, multiple people need visibility — often immediately.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
              The Purpose
            </h2>
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              MAKO creates a secure monitoring session around a live SRT feed.
              One input. Multiple viewers. Shared understanding.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
              The Intent
            </h2>
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              No distribution platform. No content storage. No noise. Just
              real-time signal visibility — for the people behind the feed.
            </p>
          </section>
        </div>
      </div>
    </div>
  </div>
);

export default Landing;
