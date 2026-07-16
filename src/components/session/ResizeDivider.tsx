import { useCallback, useEffect, useRef } from "react";

interface ResizeDividerProps {
  orientation: "vertical" | "horizontal";
  /** Current value (percent 0..100 or pixels — caller decides). */
  value: number;
  min: number;
  max: number;
  /** Called with the next value on drag / keyboard. rAF-throttled. */
  onChange: (next: number) => void;
  /** Called once when a drag starts. */
  onDragStart?: () => void;
  /** Called once when a drag ends (persist here). */
  onDragEnd?: () => void;
  /** Optional double-click handler (e.g. reset to default). */
  onDoubleClick?: () => void;
  /** Convert a raw client pixel delta into a value delta. Required for pointer drag. */
  toValue: (clientPos: number, containerRect: DOMRect) => number;
  /** Container the divider lives in, used to translate pointer coords. */
  containerRef: React.RefObject<HTMLElement>;
  /** Keyboard nudge step. */
  step?: number;
  ariaLabel: string;
  className?: string;
}

/**
 * Accessible pane divider with an invisible large hit target and
 * a thin visible line that brightens on hover / drag.
 *
 * - role="separator" with aria-orientation / aria-valuenow / min / max
 * - Arrow-key nudging when focused
 * - rAF-throttled onChange during pointer drag
 */
const ResizeDivider = ({
  orientation,
  value,
  min,
  max,
  onChange,
  onDragStart,
  onDragEnd,
  onDoubleClick,
  toValue,
  containerRef,
  step = 2,
  ariaLabel,
  className = "",
}: ResizeDividerProps) => {
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);

  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  const applyPending = useCallback(() => {
    rafRef.current = null;
    if (pendingRef.current == null) return;
    onChange(clamp(pendingRef.current));
    pendingRef.current = null;
    // clamp uses closure vars; safe since min/max stable per render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChange, min, max]);

  const schedule = useCallback(
    (next: number) => {
      pendingRef.current = next;
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(applyPending);
    },
    [applyPending],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    onDragStart?.();
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const clientPos = orientation === "vertical" ? e.clientX : e.clientY;
    schedule(toValue(clientPos, rect));
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (pendingRef.current != null) onChange(clamp(pendingRef.current));
      pendingRef.current = null;
    }
    onDragEnd?.();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let delta = 0;
    if (orientation === "vertical") {
      if (e.key === "ArrowLeft") delta = -step;
      else if (e.key === "ArrowRight") delta = step;
    } else {
      if (e.key === "ArrowUp") delta = -step;
      else if (e.key === "ArrowDown") delta = step;
    }
    if (e.key === "Home") {
      e.preventDefault();
      onChange(min);
      onDragEnd?.();
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      onChange(max);
      onDragEnd?.();
      return;
    }
    if (delta !== 0) {
      e.preventDefault();
      onChange(clamp(value + delta));
      onDragEnd?.();
    }
  };

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const isVertical = orientation === "vertical";

  // Wrapper is the big invisible hit target; the inner span is the thin line.
  const wrapperCls = isVertical
    ? "group relative shrink-0 h-full w-2 -mx-1 flex items-stretch justify-center cursor-col-resize touch-none"
    : "group relative shrink-0 w-full h-2 -my-1 flex items-center justify-center cursor-row-resize touch-none";

  const lineCls = isVertical
    ? "w-px h-full bg-border/40 group-hover:bg-primary/70 group-focus-visible:bg-primary transition-colors"
    : "h-px w-full bg-border/40 group-hover:bg-primary/70 group-focus-visible:bg-primary transition-colors";

  return (
    <div
      role="separator"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={ariaLabel}
      tabIndex={0}
      className={`${wrapperCls} outline-none ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      <span className={lineCls} aria-hidden />
    </div>
  );
};

export default ResizeDivider;
