import { useState, useEffect, useRef, useCallback } from "react";
import type { StreamInput, StreamMetrics } from "@/lib/mock-data";

export interface LiveMetrics extends StreamMetrics {
  audioPeakL: number; // 0–1
  audioPeakR: number; // 0–1
}

function jitter(base: number, range: number, min = 0): number {
  return Math.max(min, base + (Math.random() - 0.5) * range);
}

function simulateMetrics(input: StreamInput): LiveMetrics {
  const m = input.metrics;
  if (input.status === "idle") {
    return { ...m, bitrate: 0, packetLoss: 0, rtt: 0, audioPeakL: 0, audioPeakR: 0 };
  }
  const isWarn = input.status === "warning";
  const isErr = input.status === "error";
  return {
    ...m,
    bitrate: jitter(m.bitrate, isWarn ? 3 : 1, 0.5),
    packetLoss: jitter(isWarn ? 1.5 : m.packetLoss, isWarn ? 1.2 : 0.1, 0),
    rtt: jitter(m.rtt, isWarn ? 30 : 8, 5),
    lufs: jitter(m.lufs, 3, -40),
    audioPeakL: isErr ? 0 : jitter(0.55, 0.5, 0.02),
    audioPeakR: isErr ? 0 : jitter(0.5, 0.5, 0.02),
  };
}

/** Provides live-updating metrics for all inputs, ticking every `intervalMs`. */
export function useLiveMetrics(inputs: StreamInput[], intervalMs = 800) {
  const [metrics, setMetrics] = useState<Record<string, LiveMetrics>>(() => {
    const init: Record<string, LiveMetrics> = {};
    for (const inp of inputs) {
      init[inp.id] = simulateMetrics(inp);
    }
    return init;
  });

  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;

  useEffect(() => {
    const tick = () => {
      setMetrics((prev) => {
        const next: Record<string, LiveMetrics> = {};
        for (const inp of inputsRef.current) {
          next[inp.id] = simulateMetrics(inp);
        }
        return next;
      });
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  const getMetrics = useCallback(
    (inputId: string): LiveMetrics | undefined => metrics[inputId],
    [metrics]
  );

  return { metrics, getMetrics };
}
