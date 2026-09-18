import { type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { SignalDiagnostic } from "@/lib/diagnostics/signal-diagnostic";

/**
 * Phase F.1 — renders any diagnostic object with confirmed facts, possible
 * causes and next checks kept visually and textually distinct. Possible causes
 * are always labelled as possibilities, never as observations.
 */
const SignalDiagnosticCard = ({
  diagnostic,
  actions,
  compact = false,
}: {
  diagnostic: SignalDiagnostic;
  actions?: ReactNode;
  compact?: boolean;
}) => {
  const good = diagnostic.category === "endpoint_available";
  const warn = diagnostic.category === "endpoint_in_use" || diagnostic.category === "unknown";
  const tone = good
    ? "border-primary/25 bg-primary/[0.05]"
    : warn
      ? "border-[hsl(var(--warning))]/25 bg-[hsl(var(--warning))]/[0.06]"
      : "border-destructive/25 bg-destructive/[0.06]";
  const Icon = good ? CheckCircle2 : warn ? Info : AlertTriangle;
  const iconTone = good
    ? "text-primary"
    : warn
      ? "text-[hsl(var(--warning))]"
      : "text-destructive";

  const observed = (() => {
    const d = new Date(diagnostic.observedAt);
    return Number.isNaN(d.getTime()) ? diagnostic.observedAt : d.toLocaleTimeString();
  })();

  return (
    <div
      className={`rounded-md border p-3 space-y-2 text-xs ${tone}`}
      data-testid="signal-diagnostic-card"
    >
      <div className="flex items-start gap-2">
        <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${iconTone}`} />
        <div className="min-w-0 space-y-0.5">
          <div className={`text-[11px] uppercase tracking-widest font-semibold ${iconTone}`}>
            {diagnostic.title}
          </div>
          {(diagnostic.sourceLabel || diagnostic.endpoint) && (
            <div className="text-[10px] font-mono text-muted-foreground truncate">
              {[diagnostic.sourceLabel, diagnostic.endpoint].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>

      <Block label="Confirmed" items={diagnostic.confirmedFacts} />

      <div className="text-[10px] text-muted-foreground/70">Observed {observed}</div>

      {!compact && diagnostic.possibleCauses.length > 0 && (
        <Block label="Possible causes (not confirmed)" items={diagnostic.possibleCauses} />
      )}
      {!compact && diagnostic.nextChecks.length > 0 && (
        <Block label="Next checks" items={diagnostic.nextChecks} />
      )}

      <p className="text-[10px] text-muted-foreground/70">{diagnostic.limitation}</p>

      {actions && <div className="flex flex-wrap gap-2 pt-1">{actions}</div>}
    </div>
  );
};

const Block = ({ label, items }: { label: string; items: string[] }) => (
  <div className="space-y-1">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item} className="text-[11px] text-foreground/90 leading-snug">
          {item}
        </li>
      ))}
    </ul>
  </div>
);

export default SignalDiagnosticCard;
