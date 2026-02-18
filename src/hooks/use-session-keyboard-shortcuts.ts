import { useEffect } from "react";

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName?.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    el.isContentEditable ||
    el.closest("[contenteditable='true']") !== null
  );
}

export function useSessionKeyboardShortcuts({
  enabled,
  activeLineIds,
  focusedLineId,
  setFocusedLineId,
}: {
  enabled: boolean;
  activeLineIds: string[];
  focusedLineId: string | null;
  setFocusedLineId: (id: string) => void;
}) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.metaKey || e.ctrlKey) return;
      if (isTypingTarget(e.target)) return;

      const active = activeLineIds ?? [];
      if (active.length === 0) return;

      // 1-4 jump
      const digit =
        e.code?.startsWith("Digit") ? Number(e.code.replace("Digit", "")) :
        e.code?.startsWith("Numpad") ? Number(e.code.replace("Numpad", "")) :
        Number.isFinite(Number(e.key)) ? Number(e.key) :
        null;

      if (digit && digit >= 1 && digit <= 4) {
        const target = active[digit - 1];
        if (target !== undefined) {
          e.preventDefault();
          setFocusedLineId(target);
        }
        return;
      }

      // Arrow cycling
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const idx = focusedLineId == null ? -1 : active.indexOf(focusedLineId);
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const nextIndex = idx === -1 ? 0 : (idx + dir + active.length) % active.length;
        setFocusedLineId(active[nextIndex]);
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, activeLineIds, focusedLineId, setFocusedLineId]);
}
