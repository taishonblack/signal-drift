// Time display preferences & timezone utilities for MAKO

export type EventTimeSource = "per-tile" | "follow-focus";

export interface TimeDisplayPrefs {
  showOverlay: boolean;
  showEvent: boolean;
  showViewerLocal: boolean;
  showUTC: boolean;
  eventTimeSource: EventTimeSource;
  showSessionElapsed: boolean;
}

export const DEFAULT_TIME_PREFS: TimeDisplayPrefs = {
  showOverlay: true,
  showEvent: true,
  showViewerLocal: false,
  showUTC: true,
  eventTimeSource: "per-tile",
  showSessionElapsed: false,
};

const PREFS_KEY_PREFIX = "mako_time_prefs_";

export function loadTimePrefs(sessionId: string): TimeDisplayPrefs {
  try {
    const raw = localStorage.getItem(`${PREFS_KEY_PREFIX}${sessionId}`);
    return raw ? { ...DEFAULT_TIME_PREFS, ...JSON.parse(raw) } : DEFAULT_TIME_PREFS;
  } catch {
    return DEFAULT_TIME_PREFS;
  }
}

export function saveTimePrefs(sessionId: string, prefs: TimeDisplayPrefs) {
  localStorage.setItem(`${PREFS_KEY_PREFIX}${sessionId}`, JSON.stringify(prefs));
}

/** Get viewer's local IANA timezone */
export function getViewerTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Format a time for a given IANA timezone, returns "HH:MM:SS TZ" */
export function formatTimeInZone(date: Date, timeZone: string): string {
  try {
    const time = date.toLocaleTimeString("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const abbr = getTimezoneAbbr(date, timeZone);
    return `${time} ${abbr}`;
  } catch {
    return date.toLocaleTimeString("en-GB", { hour12: false });
  }
}

/** Get a short timezone abbreviation */
export function getTimezoneAbbr(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(date);
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart?.value ?? timeZone.split("/").pop()?.replace(/_/g, " ") ?? "";
  } catch {
    return timeZone.split("/").pop()?.replace(/_/g, " ") ?? "";
  }
}

/** Format session elapsed time from a start date */
export function formatElapsed(startDate: string): string {
  const elapsed = Date.now() - new Date(startDate).getTime();
  if (elapsed < 0) return "+00:00:00";
  const h = Math.floor(elapsed / 3_600_000);
  const m = Math.floor((elapsed % 3_600_000) / 60_000);
  const s = Math.floor((elapsed % 60_000) / 1_000);
  return `+${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Common broadcast timezone list for selectors */
export const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** Get a human-friendly label for a timezone */
export function tzLabel(tz: string): string {
  const city = tz.split("/").pop()?.replace(/_/g, " ") ?? tz;
  try {
    const abbr = getTimezoneAbbr(new Date(), tz);
    return `${city} (${abbr})`;
  } catch {
    return city;
  }
}
