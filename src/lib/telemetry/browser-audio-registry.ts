/**
 * Received-stream registry (Phase E.3).
 *
 * `LiveCamera` owns the single WHEP RTCPeerConnection per playback path. It
 * publishes the MediaStream it already received here so passive consumers (the
 * Signal Inspector's audio meter) can analyse the same decoded audio WITHOUT
 * opening a second WHEP session or a second media receiver.
 *
 * The registry stores nothing but the live stream reference, keyed by playback
 * stream name, and clears it on reconnect/unmount.
 */

type Listener = (stream: MediaStream | null) => void;

const streams = new Map<string, MediaStream>();
const listeners = new Map<string, Set<Listener>>();

function emit(streamName: string) {
  const stream = streams.get(streamName) ?? null;
  listeners.get(streamName)?.forEach((l) => l(stream));
}

/** Called by LiveCamera when a track arrives on the received stream. */
export function publishReceivedStream(streamName: string, stream: MediaStream): void {
  streams.set(streamName, stream);
  emit(streamName);
}

/** Called by LiveCamera on teardown, reconnect and unmount. */
export function clearReceivedStream(streamName: string, stream?: MediaStream): void {
  const current = streams.get(streamName);
  // A stale generation must never clear a newer connection's stream.
  if (stream && current && current !== stream) return;
  streams.delete(streamName);
  emit(streamName);
}

export function getReceivedStream(streamName: string | null | undefined): MediaStream | null {
  if (!streamName) return null;
  return streams.get(streamName) ?? null;
}

/** Subscribe to the received stream for a playback path. Fires immediately. */
export function subscribeReceivedStream(streamName: string, listener: Listener): () => void {
  let set = listeners.get(streamName);
  if (!set) {
    set = new Set();
    listeners.set(streamName, set);
  }
  set.add(listener);
  listener(streams.get(streamName) ?? null);
  return () => {
    set?.delete(listener);
    if (set && set.size === 0) listeners.delete(streamName);
  };
}
