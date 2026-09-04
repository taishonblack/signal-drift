import { useCallback, useEffect, useRef, useState } from "react";
import { negotiateWhep, whepEndpointForStream, MISSING_WHEP_BASE_MESSAGE } from "@/lib/stream-paths";

export type LiveCameraState =
  | "connecting"
  | "live"
  | "no_video"
  | "reconnecting"
  | "misconfigured"
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

  const endpoint = whepEndpointForStream(streamName);
  const url = baseUrl
    ? `${baseUrl.replace(/\/+$/, "")}/${streamName}/whep`
    : endpoint.ok
      ? (endpoint.url as string)
      : MISSING_WHEP_BASE_MESSAGE;

  const report = useCallback(
    (next: LiveCameraState) => {
      setState(next);
      onStateChange?.(next);
    },
    [onStateChange],
  );

  useEffect(() => {
    let cancelled = false;
    // Generation guard: a stale attempt must never close a newer connection.
    let generation = 0;

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
      const myGen = ++generation;
      teardown();
      report(attemptRef.current === 0 ? "connecting" : "reconnecting");

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (cancelled || myGen !== generation) return;
        const el = videoRef.current;
        if (!el) return;
        const stream = event.streams?.[0] ?? new MediaStream([event.track]);
        el.srcObject = stream;
        if (import.meta.env.DEV) {
          console.info("[LiveCamera]", streamName, {
            step: "ontrack",
            hadStreams: !!event.streams?.[0],
            kind: event.track.kind,
            readyState: event.track.readyState,
          });
        }
        const p = el.play();
        if (p && typeof p.then === "function") {
          p.then(() => {
            if (import.meta.env.DEV) console.info("[LiveCamera]", streamName, { step: "play", ok: true });
          }).catch((err) => {
            console.warn("[LiveCamera]", streamName, "play() rejected:", err);
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (import.meta.env.DEV) {
          console.info("[LiveCamera]", streamName, {
            step: "ice",
            iceConnectionState: pc.iceConnectionState,
            iceGatheringState: pc.iceGatheringState,
            signalingState: pc.signalingState,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (cancelled || myGen !== generation) return;
        if (import.meta.env.DEV) {
          console.info("[LiveCamera]", streamName, {
            step: "pc",
            connectionState: pc.connectionState,
          });
        }
        if (pc.connectionState === "connected") {
          attemptRef.current = 0;
          report("live");
        }
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          report("reconnecting");
          schedule();
        }
      };

      const n = await negotiateWhep(streamName, pc, "LiveCamera", baseUrl);
      if (cancelled || myGen !== generation) return;

      if (n.outcome === "not_configured" || n.outcome === "misconfigured") {
        // Endpoint problem, not a media problem: never retry it as ICE noise.
        console.error("[LiveCamera]", streamName, n.detail, {
          url: n.url,
          status: n.status,
          contentType: n.contentType,
          bodyHead: n.body?.slice(0, 100),
        });
        report("misconfigured");
        teardown();
        return;
      }

      if (n.outcome === "no_publisher") {
        report("no_video");
        teardown();
        schedule();
        return;
      }

      if (n.outcome !== "answer") {
        console.warn("[LiveCamera]", streamName, n.detail, { url: n.url, status: n.status });
        report(attemptRef.current > 3 ? "failed" : "reconnecting");
        teardown();
        schedule();
        return;
      }

      // Persistent session: keep the peer connection and the WHEP resource
      // alive; they are only released on unmount or an explicit reconnect.
      resourceRef.current = n.resourceUrl ?? null;

      try {
        await pc.setRemoteDescription({ type: "answer", sdp: n.answerSdp as string });
        if (import.meta.env.DEV) {
          console.info("[LiveCamera]", streamName, { step: "remoteSdpSet", ok: true });
        }
      } catch (err) {
        if (cancelled || myGen !== generation) return;
        console.error("[LiveCamera]", streamName, "setRemoteDescription failed:", err);
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
  }, [url, streamName, baseUrl, report]);


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
    misconfigured: "Playback endpoint misconfigured",
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
