/**
 * Phase F.1 — configuration-time endpoint validation.
 *
 * SYNTAX ONLY. Nothing here touches the network, and a valid result NEVER
 * implies the remote SRT listener is reachable, connected, or unblocked.
 */

export type AddressValidationKind =
  | "ipv4"
  | "hostname"
  | "ipv4_invalid"
  | "hostname_invalid"
  | "ipv6_unsupported"
  | "empty";

export interface AddressValidation {
  valid: boolean;
  kind: AddressValidationKind;
  /** Short engineer-facing statement of the syntactic fact. */
  message: string;
}

export interface PortValidation {
  valid: boolean;
  message: string;
}

export const MIN_PORT = 1;
export const MAX_PORT = 65535;

const HOSTNAME_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i;

/** True when the text is only digits and dots (an intended IPv4 literal). */
const looksNumeric = (value: string) => /^[0-9.]+$/.test(value);

function validIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    // Reject ambiguous zero padding ("01", "007").
    if (part.length > 1 && part.startsWith("0")) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

function validHostname(value: string): boolean {
  if (value.length > 253) return false;
  // A hostname must contain at least one letter, so a malformed numeric
  // address can never slip through as a "valid hostname".
  if (!/[a-z]/i.test(value)) return false;
  const labels = value.split(".");
  if (labels.some((l) => l.length === 0)) return false;
  return labels.every((l) => HOSTNAME_LABEL.test(l));
}

/**
 * Validate the SRT address / IP field.
 *
 * IPv4 octets are validated (`999.1.1.1` fails). IPv6 is reported as
 * unsupported rather than silently rejected as malformed.
 */
export function validateAddress(raw: string): AddressValidation {
  const value = (raw ?? "").trim();

  if (!value) {
    return { valid: false, kind: "empty", message: "Address is required" };
  }

  if (value.includes(":") || value.startsWith("[")) {
    return {
      valid: false,
      kind: "ipv6_unsupported",
      message: "IPv6 addresses are not supported",
    };
  }

  if (looksNumeric(value)) {
    return validIpv4(value)
      ? { valid: true, kind: "ipv4", message: "Address format valid (IPv4)" }
      : { valid: false, kind: "ipv4_invalid", message: "Address format invalid (IPv4)" };
  }

  return validHostname(value)
    ? { valid: true, kind: "hostname", message: "Address format valid (hostname)" }
    : { valid: false, kind: "hostname_invalid", message: "Address format invalid (hostname)" };
}

/** Validate the port field: integer within 1-65535. */
export function validatePort(raw: string | number): PortValidation {
  const text = String(raw ?? "").trim();
  if (!text) return { valid: false, message: "Port is required" };
  if (!/^\d+$/.test(text)) return { valid: false, message: "Port must be a whole number" };
  const port = Number(text);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    return { valid: false, message: `Port must be between ${MIN_PORT} and ${MAX_PORT}` };
  }
  return { valid: true, message: "Port valid" };
}

/** True when both address and port are syntactically valid. Not reachability. */
export function endpointSyntaxValid(host: string, port: string): boolean {
  return validateAddress(host).valid && validatePort(port).valid;
}
