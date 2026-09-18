/**
 * Phase F.1 — playback observation registry.
 *
 * `LiveCamera` already owns the single WHEP connection per playback path and
 * already computes its own state. It publishes that state here so passive
 * consumers (the Signal Inspector's diagnostic card) can read what MAKO
 * observed WITHOUT opening a second WHEP session or altering negotiation,
 * retry or playback behaviour in any way.
 */

import type { LiveCameraState } from "@/components/LiveCamera";
import type { PlaybackObservation } from "./signal-diagnostic";

type Listener = (state: LiveCameraState | null) => void;

const states = new Map<string, LiveCameraState>();
const listeners = new Map<string, Set<Listener>>();

function emit(streamName: string) {
  const state = states.get(streamName) ?? null;
  listeners.get(streamName)?.forEach((l) => l(state));
}

export function publishPlaybackState(streamName: string, state: LiveCameraState): void {
  states.set(streamName, state);
  emit(streamName);
}

export function clearPlaybackState(streamName: string): void {
  states.delete(streamName);
  emit(streamName);
}

export function getPlaybackState(streamName: string | null | undefined): LiveCameraState | null {
  if (!streamName) return null;
  return states.get(streamName) ?? null;
}

/** Subscribe to a playback path's observed state. Fires immediately. */
export function subscribePlaybackState(streamName: string, listener: Listener): () => void {
  let set = listeners.get(streamName);
  if (!set) {
    set = new Set();
    listeners.set(streamName, set);
  }
  set.add(listener);
  listener(states.get(streamName) ?? null);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(streamName);
  };
}

/**
 * Map an observed playback state onto the diagnostic vocabulary.
 *
 * `connecting` and `reconnecting` are deliberately treated as healthy-for-now:
 * MAKO has not concluded anything yet, so nothing is reported.
 */
export function observationFromPlaybackState(
  state: LiveCameraState | null,
): PlaybackObservation {
  switch (state) {
    case "no_video":
    case "failed":
      return "no_publisher";
    case "misconfigured":
      return "misconfigured";
    default:
      return "healthy";
  }
}
