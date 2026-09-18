import { validateAddress, validatePort } from "@/lib/diagnostics/endpoint-validation";
import type { ReservationState } from "@/lib/diagnostics/signal-diagnostic";

/**
 * Phase F.1 — compact CONFIGURATION block under the address and port fields.
 *
 * Three independent, syntax-and-reservation-only checks. "Available to MAKO"
 * means nothing more than: no other MAKO runtime route reserves this host and
 * port. It never implies reachability, SRT state, firewall state or media.
 */
const ConfigurationStatus = ({
  host,
  port,
  reservation,
}: {
  host: string;
  port: string;
  reservation: ReservationState;
}) => {
  const address = validateAddress(host);
  const portResult = validatePort(port);

  const reservationRow =
    reservation === "in_use"
      ? { mark: "!", text: "In use by another MAKO session", tone: "text-[hsl(var(--warning))]" }
      : reservation === "available"
        ? { mark: "✓", text: "Available to MAKO", tone: "text-primary" }
        : { mark: "—", text: "Availability not checked", tone: "text-muted-foreground" };

  const rows = [
    {
      mark: address.valid ? "✓" : "✕",
      text: address.valid ? "Address format valid" : address.message,
      tone: address.valid ? "text-primary" : "text-destructive",
    },
    {
      mark: portResult.valid ? "✓" : "✕",
      text: portResult.valid ? "Port valid" : portResult.message,
      tone: portResult.valid ? "text-primary" : "text-destructive",
    },
    reservationRow,
  ];

  return (
    <div className="space-y-1" data-testid="configuration-status">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Configuration
      </div>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li key={r.text} className={`text-[11px] font-mono ${r.tone}`}>
            <span className="inline-block w-3">{r.mark}</span> {r.text}
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted-foreground/60">
        Configuration checks validate the information MAKO can confirm before monitoring
        begins. They do not test SRT network reachability.
      </p>
    </div>
  );
};

export default ConfigurationStatus;
