/**
 * Phase F.1 — Configuration & Session Diagnostics.
 *
 * These tests pin the TRUTH MODEL: MAKO may report address syntax, port syntax,
 * its own reservation state, its own provisioning outcome and what its playback
 * observed. It may never claim reachability, refusal, timeout, DNS, firewall or
 * SRT handshake state.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  endpointSyntaxValid,
  validateAddress,
  validatePort,
} from "@/lib/diagnostics/endpoint-validation";
import {
  buildConfigurationDiagnostic,
  buildPlaybackDiagnostic,
  buildProvisioningFailureDiagnostic,
  FORBIDDEN_CLAIM_PATTERNS,
  type SignalDiagnostic,
} from "@/lib/diagnostics/signal-diagnostic";
import { buildDiagnosticSummary } from "@/lib/diagnostics/diagnostic-summary";
import {
  clearPlaybackState,
  observationFromPlaybackState,
  publishPlaybackState,
  subscribePlaybackState,
} from "@/lib/diagnostics/playback-state-registry";
import ConfigurationStatus from "@/components/session/ConfigurationStatus";
import SignalDiagnosticCard from "@/components/diagnostics/SignalDiagnosticCard";

const allText = (d: SignalDiagnostic) =>
  [
    d.title,
    ...d.confirmedFacts,
    ...d.possibleCauses,
    ...d.nextChecks,
    d.limitation,
  ].join(" | ");

describe("F.1 address validation", () => {
  it("accepts a valid IPv4 address", () => {
    expect(validateAddress("134.209.119.136")).toMatchObject({ valid: true, kind: "ipv4" });
  });

  it("rejects out-of-range IPv4 octets", () => {
    expect(validateAddress("999.1.1.1")).toMatchObject({ valid: false, kind: "ipv4_invalid" });
    expect(validateAddress("134.209.119")).toMatchObject({ valid: false, kind: "ipv4_invalid" });
  });

  it("accepts a hostname / FQDN", () => {
    expect(validateAddress("ingest.example.com")).toMatchObject({
      valid: true,
      kind: "hostname",
    });
  });

  it("rejects a malformed hostname", () => {
    expect(validateAddress("-bad-.example..com")).toMatchObject({ valid: false });
  });

  it("reports IPv6 as unsupported rather than merely invalid", () => {
    const r = validateAddress("2001:db8::1");
    expect(r.valid).toBe(false);
    expect(r.kind).toBe("ipv6_unsupported");
    expect(r.message).toMatch(/IPv6/);
  });

  it("requires an address", () => {
    expect(validateAddress("  ")).toMatchObject({ valid: false, kind: "empty" });
  });
});

describe("F.1 port validation", () => {
  it("accepts ports 1-65535", () => {
    expect(validatePort("1").valid).toBe(true);
    expect(validatePort("8000").valid).toBe(true);
    expect(validatePort("65535").valid).toBe(true);
  });

  it("rejects 0, out of range and non-numeric ports", () => {
    expect(validatePort("0").valid).toBe(false);
    expect(validatePort("65536").valid).toBe(false);
    expect(validatePort("80a").valid).toBe(false);
    expect(validatePort("").valid).toBe(false);
  });

  it("endpointSyntaxValid requires both parts", () => {
    expect(endpointSyntaxValid("134.209.119.136", "8000")).toBe(true);
    expect(endpointSyntaxValid("134.209.119.136", "0")).toBe(false);
    expect(endpointSyntaxValid("999.1.1.1", "8000")).toBe(false);
  });
});

describe("F.1 configuration diagnostic", () => {
  it("valid syntax + available reservation → endpoint_available, no reachability claim", () => {
    const d = buildConfigurationDiagnostic({
      host: "134.209.119.136",
      port: "8000",
      reservation: "available",
    });
    expect(d.category).toBe("endpoint_available");
    expect(d.endpoint).toBe("134.209.119.136:8000");
    expect(allText(d)).not.toMatch(/reachable|connected|online/i);
    expect(d.limitation).toMatch(/has not performed an SRT handshake/i);
  });

  it("available never claims the listener is reachable or connected", () => {
    const d = buildConfigurationDiagnostic({
      host: "ingest.example.com",
      port: "9000",
      reservation: "available",
    });
    for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
      expect(allText(d)).not.toMatch(pattern);
    }
  });

  it("invalid syntax → configuration_invalid and states the syntactic fact", () => {
    const d = buildConfigurationDiagnostic({
      host: "999.1.1.1",
      port: "70000",
      reservation: "available",
    });
    expect(d.category).toBe("configuration_invalid");
    expect(d.confirmedFacts.join(" ")).toMatch(/Address format invalid/i);
    expect(d.confirmedFacts.join(" ")).toMatch(/between 1 and 65535/);
  });

  it("reserved endpoint → endpoint_in_use, attributed to MAKO reservation only", () => {
    const d = buildConfigurationDiagnostic({
      host: "134.209.119.136",
      port: "8000",
      reservation: "in_use",
    });
    expect(d.category).toBe("endpoint_in_use");
    expect(d.provenance).toBe("mako_reservation");
    expect(d.confirmedFacts.join(" ")).toMatch(/MAKO runtime route/i);
  });

  it("unchecked reservation is reported as unknown, never as available", () => {
    const d = buildConfigurationDiagnostic({
      host: "134.209.119.136",
      port: "8000",
      reservation: "not_checked",
    });
    expect(d.category).toBe("unknown");
    expect(d.confirmedFacts.join(" ")).toMatch(/no reservation result/i);
  });
});

describe("F.1 provisioning failure diagnostic", () => {
  it("attributes the failure to MAKO, not to the remote source", () => {
    const d = buildProvisioningFailureDiagnostic({
      endpoint: "134.209.119.136:8000",
      detail: "reservation conflict",
    });
    expect(d.category).toBe("provisioning_failed");
    expect(d.provenance).toBe("mako_provisioning");
    expect(d.confirmedFacts.join(" ")).toMatch(/MAKO could not create the caller/i);
    expect(d.confirmedFacts.join(" ")).toContain("reservation conflict");
    for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
      expect(allText(d)).not.toMatch(pattern);
    }
  });
});

describe("F.1 playback diagnostic", () => {
  it("healthy playback produces no diagnostic at all", () => {
    expect(
      buildPlaybackDiagnostic({ observation: "healthy", routeCreated: true }),
    ).toBeNull();
  });

  it("route created but no media → no_media_publication, distinguishing the two", () => {
    const d = buildPlaybackDiagnostic({
      observation: "no_publisher",
      routeCreated: true,
      endpoint: "134.209.119.136:8000",
    })!;
    expect(d.category).toBe("no_media_publication");
    expect(d.confirmedFacts).toContain("MAKO created a runtime route for this source.");
    expect(d.confirmedFacts).toContain(
      "No media publication has been detected for this route.",
    );
    expect(d.possibleCauses.length).toBeGreaterThan(1);
    for (const pattern of FORBIDDEN_CLAIM_PATTERNS) {
      expect(allText(d)).not.toMatch(pattern);
    }
  });

  it("no runtime route → provisioning_failed rather than a remote-source claim", () => {
    const d = buildPlaybackDiagnostic({ observation: "no_publisher", routeCreated: false })!;
    expect(d.category).toBe("provisioning_failed");
    expect(d.confirmedFacts.join(" ")).toMatch(/no runtime route/i);
  });

  it("misconfigured playback is reported as a MAKO playback problem", () => {
    const d = buildPlaybackDiagnostic({ observation: "misconfigured", routeCreated: true })!;
    expect(d.category).toBe("playback_endpoint_misconfigured");
    expect(d.nextChecks.join(" ")).toMatch(/MAKO/);
  });

  it("connecting and reconnecting conclude nothing", () => {
    expect(observationFromPlaybackState("connecting")).toBe("healthy");
    expect(observationFromPlaybackState("reconnecting")).toBe("healthy");
    expect(observationFromPlaybackState(null)).toBe("healthy");
    expect(observationFromPlaybackState("no_video")).toBe("no_publisher");
    expect(observationFromPlaybackState("misconfigured")).toBe("misconfigured");
  });
});

describe("F.1 playback state registry", () => {
  beforeEach(() => {
    clearPlaybackState("route-a");
    clearPlaybackState("route-b");
  });

  it("publishes per playback path without leaking across sources", () => {
    const a = vi.fn();
    const stop = subscribePlaybackState("route-a", a);
    publishPlaybackState("route-b", "no_video");
    expect(a).toHaveBeenLastCalledWith(null);
    publishPlaybackState("route-a", "live");
    expect(a).toHaveBeenLastCalledWith("live");
    stop();
    publishPlaybackState("route-a", "failed");
    expect(a).toHaveBeenLastCalledWith("live");
  });

  it("clearing a path reports no observation", () => {
    const listener = vi.fn();
    publishPlaybackState("route-a", "live");
    const stop = subscribePlaybackState("route-a", listener);
    expect(listener).toHaveBeenLastCalledWith("live");
    clearPlaybackState("route-a");
    expect(listener).toHaveBeenLastCalledWith(null);
    stop();
  });
});

describe("F.1 diagnostic summary", () => {
  it("is plain text, secret-free and keeps causes labelled as unconfirmed", () => {
    const d = buildConfigurationDiagnostic({
      host: "134.209.119.136",
      port: "8000",
      reservation: "in_use",
      sourceLabel: "Source 1",
      observedAt: "2026-01-01T00:00:00.000Z",
    });
    const text = buildDiagnosticSummary(d);
    expect(text).toMatch(/^MAKO Signal Diagnostic/);
    expect(text).toContain("Endpoint: 134.209.119.136:8000");
    expect(text).toMatch(/Possible causes \(not confirmed\)/);
    expect(text).not.toMatch(/eyJ|Bearer |apikey|service_role|passphrase/i);
  });
});

describe("F.1 UI rendering", () => {
  it("configuration block shows syntax and reservation facts with the disclaimer", () => {
    render(<ConfigurationStatus host="134.209.119.136" port="8000" reservation="available" />);
    expect(screen.getByText(/Address format valid/i)).toBeInTheDocument();
    expect(screen.getByText(/Port valid/i)).toBeInTheDocument();
    expect(screen.getByText(/Available to MAKO/i)).toBeInTheDocument();
    expect(screen.getByText(/do not test SRT network\s+reachability/i)).toBeInTheDocument();
  });

  it("configuration block reports invalid syntax instead of availability", () => {
    render(<ConfigurationStatus host="999.1.1.1" port="0" reservation="not_checked" />);
    expect(screen.getByText(/Address format invalid/i)).toBeInTheDocument();
    expect(screen.getByText(/Availability not checked/i)).toBeInTheDocument();
  });

  it("diagnostic card separates confirmed facts from possible causes and next checks", () => {
    const d = buildPlaybackDiagnostic({
      observation: "no_publisher",
      routeCreated: true,
      sourceLabel: "Source 1",
      endpoint: "134.209.119.136:8000",
    })!;
    render(<SignalDiagnosticCard diagnostic={d} />);
    expect(screen.getByTestId("signal-diagnostic-card")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByText(/Possible causes \(not confirmed\)/)).toBeInTheDocument();
    expect(screen.getByText("Next checks")).toBeInTheDocument();
    expect(screen.getByText(/has not performed an SRT handshake/i)).toBeInTheDocument();
  });
});
