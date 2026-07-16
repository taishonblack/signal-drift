// Per-user Session Room workspace preferences.
//
// Signed-in users: persisted to `public.ui_preferences` (jsonb blob).
// Guests: persisted to `sessionStorage` for the current tab only.
//
// These are personal per viewer — never shared. They describe visual
// arrangement (pane sizes, notes height, panel visibility) and never
// change the underlying stream configuration.

import { supabase } from "@/integrations/supabase/client";

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
}

export const DEFAULT_WORKSPACE_PREFS: WorkspacePrefs = {
  mainSplitPct: 65,
  rightStackPct: 50,
  notesHeightPx: 220,
  notesCollapsed: false,
  inspectorOpen: false,
};

export const WORKSPACE_LIMITS = {
  mainSplitMin: 30,
  mainSplitMax: 75,
  rightStackMin: 25,
  rightStackMax: 75,
  notesMinPx: 120,
  /** Max as a fraction of Session Room available height. */
  notesMaxFraction: 0.6,
} as const;

const GUEST_KEY = "mako.workspace-prefs.v1";

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function normalizePrefs(input: Partial<WorkspacePrefs> | null | undefined): WorkspacePrefs {
  const p = { ...DEFAULT_WORKSPACE_PREFS, ...(input ?? {}) };
  return {
    mainSplitPct: clamp(p.mainSplitPct, WORKSPACE_LIMITS.mainSplitMin, WORKSPACE_LIMITS.mainSplitMax),
    rightStackPct: clamp(p.rightStackPct, WORKSPACE_LIMITS.rightStackMin, WORKSPACE_LIMITS.rightStackMax),
    notesHeightPx: Math.max(0, Math.round(p.notesHeightPx)),
    notesCollapsed: !!p.notesCollapsed,
    inspectorOpen: !!p.inspectorOpen,
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
