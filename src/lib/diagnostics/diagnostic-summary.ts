/**
 * Phase F.1 — plain-text engineering handoff.
 *
 * Built ONLY from a SignalDiagnostic object, so it can never leak tokens,
 * credentials, internal infrastructure identifiers or raw server logs.
 */

import type { SignalDiagnostic } from "./signal-diagnostic";

const bullet = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

/** Human-readable local time with zone, for pasting into a chat or ticket. */
function formatObserved(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { timeZoneName: "short" });
}

export function buildDiagnosticSummary(d: SignalDiagnostic): string {
  const lines: string[] = ["MAKO Signal Diagnostic", ""];
  if (d.sourceLabel) lines.push(`Source: ${d.sourceLabel}`);
  if (d.endpoint) lines.push(`Endpoint: ${d.endpoint}`);
  lines.push(`Observed: ${formatObserved(d.observedAt)}`);
  lines.push("", "Confirmed:", bullet(d.confirmedFacts));

  if (d.possibleCauses.length > 0) {
    lines.push("", "Possible causes (not confirmed):", bullet(d.possibleCauses));
  }
  if (d.nextChecks.length > 0) {
    lines.push("", "Suggested checks:", bullet(d.nextChecks));
  }

  lines.push("", d.limitation);
  return lines.join("\n");
}
