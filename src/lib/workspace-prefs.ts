// Per-user Session Room workspace preferences.
//
// Signed-in users: persisted to `public.ui_preferences` (jsonb blob).
// Guests: persisted to `sessionStorage` for the current tab only.
//
// These are personal per viewer — never shared. They describe visual
// arrangement (pane sizes, notes height, panel visibility) and never
// change the underlying stream configuration.

import { supabase } from "@/integrations/supabase/client";

export type TimelineDock = "bottom" | "right" | "popout" | "collapsed";

export interface WorkspacePrefs {
  /** Main vertical split: width % allocated to the LEFT pane (30..75). */
  mainSplitPct: number;
  /** Right stack split: height % allocated to the UPPER pane (25..75). */
  rightStackPct: number;
  /** Notes panel height in px (0 when collapsed → use notesCollapsed). */
  notesHeightPx: number;
  /** True when the notes panel is collapsed to the compact bar. */
  notesCollapsed: boolean;
  /** Inspector docked-panel visibility. */
  inspectorOpen: boolean;
  /** Timeline dock position (personal per-viewer). */
  timelineDock: TimelineDock;
  /** Timeline right-column width as % of main content (20..45). */
  timelineRightPct: number;
  /** When Inspector + Timeline share the right column, % height for Inspector (25..75). */
  inspectorTimelinePct: number;
}

export const DEFAULT_WORKSPACE_PREFS: WorkspacePrefs = {
  mainSplitPct: 65,
  rightStackPct: 50,
  notesHeightPx: 220,
  notesCollapsed: false,
  inspectorOpen: false,
  timelineDock: "bottom",
  timelineRightPct: 28,
  inspectorTimelinePct: 45,
};

export const WORKSPACE_LIMITS = {
  mainSplitMin: 30,
  mainSplitMax: 75,
  rightStackMin: 25,
  rightStackMax: 75,
  notesMinPx: 120,
  /** Max as a fraction of Session Room available height. */
  notesMaxFraction: 0.6,
  timelineRightMin: 20,
  timelineRightMax: 45,
  inspectorTimelineMin: 25,
  inspectorTimelineMax: 75,
} as const;

const GUEST_KEY = "mako.workspace-prefs.v1";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function normalizePrefs(input: Partial<WorkspacePrefs> | null | undefined): WorkspacePrefs {
  const p = { ...DEFAULT_WORKSPACE_PREFS, ...(input ?? {}) };
  const dockOk: TimelineDock[] = ["bottom", "right", "popout", "collapsed"];
  return {
    mainSplitPct: clamp(p.mainSplitPct, WORKSPACE_LIMITS.mainSplitMin, WORKSPACE_LIMITS.mainSplitMax),
    rightStackPct: clamp(p.rightStackPct, WORKSPACE_LIMITS.rightStackMin, WORKSPACE_LIMITS.rightStackMax),
    notesHeightPx: Math.max(0, Math.round(p.notesHeightPx)),
    notesCollapsed: !!p.notesCollapsed,
    inspectorOpen: !!p.inspectorOpen,
    timelineDock: dockOk.includes(p.timelineDock) ? p.timelineDock : "bottom",
    timelineRightPct: clamp(p.timelineRightPct, WORKSPACE_LIMITS.timelineRightMin, WORKSPACE_LIMITS.timelineRightMax),
    inspectorTimelinePct: clamp(p.inspectorTimelinePct, WORKSPACE_LIMITS.inspectorTimelineMin, WORKSPACE_LIMITS.inspectorTimelineMax),
  };
}

function readGuest(): WorkspacePrefs {
  try {
    const raw = sessionStorage.getItem(GUEST_KEY);
    if (!raw) return DEFAULT_WORKSPACE_PREFS;
    return normalizePrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_WORKSPACE_PREFS;
  }
}

function writeGuest(p: WorkspacePrefs) {
  try {
    sessionStorage.setItem(GUEST_KEY, JSON.stringify(p));
  } catch {
    // sessionStorage may be unavailable — silently ignore.
  }
}

/** Load prefs for the given user (or guest when userId is null). */
export async function loadWorkspacePrefs(userId: string | null): Promise<WorkspacePrefs> {
  if (!userId) return readGuest();
  try {
    const { data } = await supabase
      .from("ui_preferences")
      .select("workspace")
      .eq("user_id", userId)
      .maybeSingle();
    const raw = (data?.workspace ?? {}) as Partial<WorkspacePrefs>;
    return normalizePrefs(raw);
  } catch {
    return readGuest();
  }
}

/** Persist prefs. Called debounced from the hook. */
export async function saveWorkspacePrefs(
  userId: string | null,
  prefs: WorkspacePrefs,
): Promise<void> {
  const clean = normalizePrefs(prefs);
  if (!userId) {
    writeGuest(clean);
    return;
  }
  // Mirror to sessionStorage too so a page refresh has instant defaults
  // while the remote load is in flight.
  writeGuest(clean);
  try {
    await supabase
      .from("ui_preferences")
      .upsert(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { user_id: userId, workspace: clean as any },
        { onConflict: "user_id" },
      );
  } catch {
    // Non-fatal — local mirror stands.
  }
}
