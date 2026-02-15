// Slot map utilities for multiview tile ordering

export type SlotId = "A" | "B" | "C" | "D";

export interface SlotMap {
  A: string;
  B: string;
  C: string;
  D: string;
}

const STORAGE_KEY_PREFIX = "mako-slotmap-";

export function defaultSlotMap(lineIds: string[]): SlotMap {
  return {
    A: lineIds[0] ?? "",
    B: lineIds[1] ?? "",
    C: lineIds[2] ?? "",
    D: lineIds[3] ?? "",
  };
}

export function loadSlotMap(sessionId: string, lineIds: string[]): SlotMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PREFIX + sessionId);
    if (raw) {
      const parsed = JSON.parse(raw) as SlotMap;
      // Validate all lineIds still exist
      const validIds = new Set(lineIds);
      const values = [parsed.A, parsed.B, parsed.C, parsed.D];
      if (values.every((v) => !v || validIds.has(v))) {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return defaultSlotMap(lineIds);
}

export function saveSlotMap(sessionId: string, map: SlotMap): void {
  try {
    localStorage.setItem(STORAGE_KEY_PREFIX + sessionId, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function swapSlots(map: SlotMap, slotA: SlotId, slotB: SlotId): SlotMap {
  if (slotA === slotB) return map;
  return {
    ...map,
    [slotA]: map[slotB],
    [slotB]: map[slotA],
  };
}
