import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Personal per-viewer popout window manager. State is kept purely
 * client-side — popouts are never shared across viewers.
 *
 * Keys are opaque strings:
 *   - `source:<inputId>`  → an individual source pane popout
 *   - `timeline`          → the Timeline popout
 *
 * The manager:
 *   - Focuses an already-open popout instead of opening a duplicate
 *   - Polls `window.closed` so the parent can restore the pane when
 *     the user closes the popout window
 *   - Surfaces a "blocked" key when window.open returns null
 */
export function usePopouts() {
  const windowsRef = useRef<Map<string, Window>>(new Map());
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const [blockedKey, setBlockedKey] = useState<string | null>(null);

  const isOpen = useCallback((key: string) => openKeys.has(key), [openKeys]);

  const open = useCallback(
    (key: string, url: string, opts?: { width?: number; height?: number }) => {
      const w = opts?.width ?? 960;
      const h = opts?.height ?? 540;
      const existing = windowsRef.current.get(key);
      if (existing && !existing.closed) {
        existing.focus();
        return true;
      }
      const features = `popup=yes,width=${w},height=${h},resizable=yes,scrollbars=yes`;
      const absoluteUrl = new URL(url, window.location.origin).toString();
      const win = window.open(absoluteUrl, `mako-${key}`, features);
      if (!win) {
        setBlockedKey(key);
        return false;
      }
      windowsRef.current.set(key, win);
      setOpenKeys((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      setBlockedKey(null);
      return true;
    },
    [],
  );

  const close = useCallback((key: string) => {
    const w = windowsRef.current.get(key);
    if (w && !w.closed) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
    windowsRef.current.delete(key);
    setOpenKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const focus = useCallback((key: string) => {
    const w = windowsRef.current.get(key);
    if (w && !w.closed) w.focus();
  }, []);

  const clearBlocked = useCallback(() => setBlockedKey(null), []);

  // Poll for popouts the user closed via the OS chrome.
  useEffect(() => {
    const t = window.setInterval(() => {
      let changed = false;
      windowsRef.current.forEach((w, k) => {
        if (w.closed) {
          windowsRef.current.delete(k);
          changed = true;
        }
      });
      if (changed) {
        setOpenKeys(new Set(Array.from(windowsRef.current.keys())));
      }
    }, 800);
    return () => window.clearInterval(t);
  }, []);

  return { isOpen, open, close, focus, blockedKey, clearBlocked, openKeys };
}
