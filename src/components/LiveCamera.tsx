import { useCallback, useEffect, useRef, useState } from "react";
import { resolveWhepResource, whepUrlForStream } from "@/lib/stream-paths";

export type LiveCameraState =
  | "connecting"
  | "live"
  | "no_video"
  | "reconnecting"
  | "failed";

interface LiveCameraProps {
  streamName: string;
  /** Override the WHEP base (defaults to the configured MediaMTX base). */
  baseUrl?: string;
  /** When false, the video element is unmuted (subject to browser autoplay). */
  muted?: boolean;
  /** Called when the browser blocks unmuted playback. */
  onAudioBlocked?: () => void;
  /** Called when unmuted playback resumes successfully. */
  onAudioPlaying?: () => void;
  /** Surface the connection state to the parent tile. */
  onStateChange?: (state: LiveCameraState) => void;
}

const MAX_BACKOFF_MS = 8000;

const LiveCamera = ({
  streamName,
  baseUrl,
  muted = true,
  onAudioBlocked,
  onAudioPlaying,
  onStateChange,
}: LiveCameraProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const resourceRef = useRef<string | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const [state, setState] = useState<LiveCameraState>("connecting");

  const url = baseUrl
    ? `${baseUrl.replace(/\/+$/, "")}/${streamName}/whep`
    : whepUrlForStream(streamName);

  const report = useCallback(
    (next: LiveCameraState) => {
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  useEffect(() => {
    let cancelled = false;

    const teardown = () => {
      if (resourceRef.current) {
        void fetch(resourceRef.current, { method: "DELETE" }).catch(() => undefined);
        resourceRef.current = null;
      }
      try {
        pcRef.current?.close();
      } catch {
        /* noop */
      }
      pcRef.current = null;
    };

    const schedule = () => {
      if (cancelled) return;
      attemptRef.current += 1;
      const delay = Math.min(1000 * 2 ** (attemptRef.current - 1), MAX_BACKOFF_MS);
      timerRef.current = window.setTimeout(() => void connect(), delay);
    };

    const connect = async () => {
      if (cancelled) return;
      teardown();
      report(attemptRef.current === 0 ? "connecting" : "reconnecting");

      try {
        const pc = new RTCPeerConnection();
        pcRef.current = pc;

        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        pc.ontrack = (event) => {
          if (!videoRef.current || cancelled) return;
          videoRef.current.srcObject = event.streams[0];
        };

        pc.onconnectionstatechange = () => {
          if (cancelled) return;
          if (pc.connectionState === "connected") {
            attemptRef.current = 0;
            report("live");
          }
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
            report("reconnecting");
            schedule();
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp ?? "",
        });

        if (cancelled) return;

        if (response.status === 404) {
          // MediaMTX reachable, but nothing is publishing on this path.
          report("no_video");
          teardown();
          schedule();
          return;
        }

        if (!response.ok) {
          report(attemptRef.current > 3 ? "failed" : "reconnecting");
          teardown();
          schedule();
          return;
        }

        const location = response.headers.get("Location");
        if (location) resourceRef.current = resolveWhepResource(location, url);


        const answer = await response.text();
        if (cancelled) return;
        await pc.setRemoteDescription({ type: "answer", sdp: answer });
      } catch (err) {
        if (cancelled) return;
        console.error("[LiveCamera]", streamName, err);
        report(attemptRef.current > 3 ? "failed" : "reconnecting");
        teardown();
        schedule();
      }
    };

    attemptRef.current = 0;
    void connect();

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      teardown();
    };
  }, [url, streamName, report]);

  // Apply the requested muted state and probe autoplay. Browsers only allow
  // unmuted playback after a user gesture — the parent should call this
  // hook with muted=false in direct response to a click.
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
    if (muted) {
      onAudioPlaying?.();
      return;
    }
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(() => onAudioPlaying?.()).catch(() => onAudioBlocked?.());
    }
  }, [muted, onAudioBlocked, onAudioPlaying]);

  const label: Record<LiveCameraState, string> = {
    connecting: "Connecting",
    live: "Live",
    no_video: "No video streaming",
    reconnecting: "Reconnecting",
    failed: "Connection failed",
  };

  return (
    <div className="absolute inset-0 bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-contain"
      />

      {state !== "live" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded bg-background/70 px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            {label[state]}
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[10px] uppercase tracking-wider text-white">
        WebRTC · {streamName} · {label[state]}
      </div>
    </div>
  );
};

export default LiveCamera;
