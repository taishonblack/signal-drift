import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  DEMO_QUINN_SCRIPT,
  DEMO_SESSION_DEFAULTS,
  DEMO_SOURCES,
  DEMO_TIMELINE_SEED,
  type DemoSource,
  type DemoStatus,
  type DemoTimelineEntry,
} from "@/lib/demo/demo-data";

const TAB_KEY = "mako:explore-demo";

export interface DemoConfig {
  name: string;
  purpose: string;
  timeZone: string;
  durationLabel: string;
  sources: DemoSource[];
}

interface DemoState {
  config: DemoConfig;
  started: boolean;
  timeline: DemoTimelineEntry[];
  eventsPaused: boolean;
  tourDismissed: boolean;
}

function initialState(): DemoState {
  return {
    config: { ...DEMO_SESSION_DEFAULTS, sources: DEMO_SOURCES.map((s) => ({ ...s })) },
    started: false,
    timeline: DEMO_TIMELINE_SEED.map((e) => ({ ...e })),
    eventsPaused: false,
    tourDismissed: false,
  };
}

function readTab(): DemoState {
  try {
    const raw = sessionStorage.getItem(TAB_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    return { ...initialState(), ...parsed };
  } catch {
    return initialState();
  }
}

/** Anonymous product-tour analytics. Never receives form contents or personal data. */
export function trackDemoEvent(event: string, detail?: Record<string, string | number>) {
  try {
    const w = window as unknown as { dataLayer?: unknown[] };
    w.dataLayer = w.dataLayer ?? [];
    w.dataLayer.push({ event: `mako_demo_${event}`, ...detail });
  } catch {
    /* analytics is best-effort */
  }
}

interface DemoContextValue extends DemoState {
  updateConfig: (patch: Partial<Omit<DemoConfig, "sources">>) => void;
  updateSource: (id: string, patch: Partial<DemoSource>) => void;
  startDemo: () => void;
  restartDemo: () => void;
  addComment: (message: string, sourceId: string | null) => void;
  setEntryStatus: (id: string, status: DemoStatus) => void;
  setEventsPaused: (paused: boolean) => void;
  restartEvents: () => void;
  dismissTour: () => void;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DemoState>(() => readTab());
  const scriptTimers = useRef<number[]>([]);

  useEffect(() => {
    try {
      sessionStorage.setItem(TAB_KEY, JSON.stringify(state));
    } catch {
      /* private mode — demo simply won't survive refresh */
    }
  }, [state]);

  const clearTimers = useCallback(() => {
    scriptTimers.current.forEach((t) => window.clearTimeout(t));
    scriptTimers.current = [];
  }, []);

  const runScript = useCallback(() => {
    clearTimers();
    DEMO_QUINN_SCRIPT.forEach((step, i) => {
      const t = window.setTimeout(() => {
        setState((prev) =>
          prev.eventsPaused
            ? prev
            : {
                ...prev,
                timeline: [
                  { ...step.entry, id: `demo-script-${i}-${Date.now()}`, createdAt: new Date().toISOString() },
                  ...prev.timeline,
                ],
              },
        );
      }, step.atMs);
      scriptTimers.current.push(t);
    });
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  const value = useMemo<DemoContextValue>(
    () => ({
      ...state,
      updateConfig: (patch) => setState((p) => ({ ...p, config: { ...p.config, ...patch } })),
      updateSource: (id, patch) =>
        setState((p) => ({
          ...p,
          config: {
            ...p.config,
            sources: p.config.sources.map((s) => (s.id === id ? { ...s, ...patch } : s)),
          },
        })),
      startDemo: () => {
        trackDemoEvent("create_step_completed");
        setState((p) => ({ ...p, started: true }));
        runScript();
      },
      restartDemo: () => {
        clearTimers();
        trackDemoEvent("restarted");
        setState(initialState());
      },
      addComment: (message, sourceId) =>
        setState((p) => ({
          ...p,
          timeline: [
            {
              id: `demo-comment-${Date.now()}`,
              authorName: "You (demo)",
              authorType: "operator",
              sourceId,
              sourceName: p.config.sources.find((s) => s.id === sourceId)?.name ?? null,
              severity: "note",
              message,
              status: "open",
              createdAt: new Date().toISOString(),
            },
            ...p.timeline,
          ],
        })),
      setEntryStatus: (id, status) =>
        setState((p) => ({
          ...p,
          timeline: p.timeline.map((e) => (e.id === id ? { ...e, status } : e)),
        })),
      setEventsPaused: (paused) => setState((p) => ({ ...p, eventsPaused: paused })),
      restartEvents: runScript,
      dismissTour: () => setState((p) => ({ ...p, tourDismissed: true })),
    }),
    [state, runScript, clearTimers],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoModeProvider");
  return ctx;
}
