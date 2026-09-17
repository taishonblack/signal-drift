import { useEffect, useRef, useState } from "react";
import {
  notMeasuredAudio,
  unavailableAudio,
  type BrowserAudioChannelLevel,
  type BrowserAudioLevelSnapshot,
} from "@/lib/telemetry/browser-audio-contract";
import {
  applyRelease,
  levelFromSamples,
  PEAK_HOLD_MS,
  PEAK_RELEASE_MS,
  amplitudeToDbfs,
} from "@/lib/telemetry/browser-audio-levels";
import { subscribeReceivedStream } from "@/lib/telemetry/browser-audio-registry";

type AudioCtor = typeof AudioContext;

function audioContextCtor(): AudioCtor | null {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Measure the decoded PCM of the WebRTC audio MAKO already receives.
 *
 * The analyser graph is passive: the source node is connected ONLY to
 * analysers, never to `destination`, so it can never produce a second audible
 * playback. Measurement is therefore completely independent of whether the
 * operator is listening to this pane — muting the <video> element, selecting a
 * different listening source, or Mute All never stops the measurement.
 *
 * Nothing here can produce a level without real samples.
 */
export function useBrowserAudioLevels(streamName: string | null | undefined) {
  const [snapshot, setSnapshot] = useState<BrowserAudioLevelSnapshot>(() =>
    notMeasuredAudio("no_audio_track"),
  );
  const heldRef = useRef<{
    l: number | null;
    r: number | null;
    m: number | null;
    peakL: { db: number; at: number } | null;
    peakR: { db: number; at: number } | null;
    peakM: { db: number; at: number } | null;
    last: number;
  }>({ l: null, r: null, m: null, peakL: null, peakR: null, peakM: null, last: 0 });

  useEffect(() => {
    if (!streamName) {
      setSnapshot(notMeasuredAudio("no_audio_track"));
      return;
    }

    let disposeAnalysis: (() => void) | null = null;

    const stop = () => {
      disposeAnalysis?.();
      disposeAnalysis = null;
    };

    const start = (stream: MediaStream) => {
      const track = stream.getAudioTracks()[0];
      if (!track || track.readyState === "ended") {
        setSnapshot(notMeasuredAudio("no_audio_track"));
        return;
      }

      const Ctor = audioContextCtor();
      if (!Ctor) {
        setSnapshot(notMeasuredAudio("web_audio_unavailable"));
        return;
      }

      let ctx: AudioContext;
      try {
        ctx = new Ctor();
      } catch {
        setSnapshot(notMeasuredAudio("web_audio_unavailable"));
        return;
      }

      let source: MediaStreamAudioSourceNode;
      try {
        source = ctx.createMediaStreamSource(stream);
      } catch {
        void ctx.close?.();
        setSnapshot(unavailableAudio("media_stream_source_failed"));
        return;
      }

      // Two analysers behind a splitter when the graph offers two channels.
      const channels = Math.min(2, Math.max(1, source.channelCount || 1));
      const splitter = channels === 2 ? ctx.createChannelSplitter(2) : null;
      const analyserA = ctx.createAnalyser();
      analyserA.fftSize = 2048;
      const analyserB = splitter ? ctx.createAnalyser() : null;
      if (analyserB) analyserB.fftSize = 2048;

      if (splitter && analyserB) {
        source.connect(splitter);
        splitter.connect(analyserA, 0);
        splitter.connect(analyserB, 1);
      } else {
        source.connect(analyserA);
      }
      // Deliberately NOT connected to ctx.destination — analysis is passive.

      const bufA = new Float32Array(analyserA.fftSize);
      const bufB = analyserB ? new Float32Array(analyserB.fftSize) : null;

      let raf: number | null = null;
      let timer: number | null = null;
      let stopped = false;

      const held = heldRef.current;
      held.l = held.r = held.m = null;
      held.peakL = held.peakR = held.peakM = null;
      held.last = 0;

      const holdPeak = (
        prev: { db: number; at: number } | null,
        measured: number,
        now: number,
      ): { db: number; at: number } => {
        if (!prev || measured >= prev.db) return { db: measured, at: now };
        if (now - prev.at < PEAK_HOLD_MS) return prev;
        const decayed = applyRelease(prev.db, measured, now - prev.at - PEAK_HOLD_MS, PEAK_RELEASE_MS);
        return { db: decayed, at: prev.at };
      };

      const channel = (
        rms: number,
        peak: number,
        smoothedRmsDbfs: number,
        heldPeakDbfs: number,
      ): BrowserAudioChannelLevel => ({
        rms,
        rmsDbfs: smoothedRmsDbfs,
        peak,
        peakDbfs: heldPeakDbfs,
      });

      const tick = () => {
        if (stopped) return;
        if (track.readyState === "ended") {
          setSnapshot(notMeasuredAudio("audio_track_ended"));
          return;
        }
        if (ctx.state === "suspended") {
          void ctx.resume?.().catch(() => undefined);
        }

        analyserA.getFloatTimeDomainData(bufA);
        if (analyserB && bufB) analyserB.getFloatTimeDomainData(bufB);

        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const elapsed = held.last ? now - held.last : 0;
        held.last = now;

        const a = levelFromSamples(bufA);
        const observedAt = new Date().toISOString();

        if (analyserB && bufB) {
          const b = levelFromSamples(bufB);
          // Honest stereo test: an upmixed mono track yields bit-identical
          // channels. In that case we report a single combined measurement
          // rather than presenting the same value twice as Left and Right.
          let identical = true;
          for (let i = 0; i < bufA.length; i += 1) {
            if (bufA[i] !== bufB[i]) {
              identical = false;
              break;
            }
          }
          if (!identical) {
            held.l = applyRelease(held.l, a.rmsDbfs, elapsed);
            held.r = applyRelease(held.r, b.rmsDbfs, elapsed);
            held.peakL = holdPeak(held.peakL, a.peakDbfs, now);
            held.peakR = holdPeak(held.peakR, b.peakDbfs, now);
            setSnapshot({
              observationPoint: "browser_webrtc_pcm",
              observedAt,
              status: "observed",
              channelMode: "stereo",
              left: channel(a.rms, a.peak, held.l, held.peakL.db),
              right: channel(b.rms, b.peak, held.r, held.peakR.db),
            });
            schedule();
            return;
          }
        }

        held.m = applyRelease(held.m, a.rmsDbfs, elapsed);
        held.peakM = holdPeak(held.peakM, a.peakDbfs, now);
        setSnapshot({
          observationPoint: "browser_webrtc_pcm",
          observedAt,
          status: "observed",
          channelMode: "mono",
          mono: channel(a.rms, a.peak, held.m, held.peakM.db),
        });
        schedule();
      };

      function schedule() {
        if (stopped) return;
        if (typeof requestAnimationFrame === "function") {
          raf = requestAnimationFrame(() => tick());
        } else {
          timer = window.setTimeout(() => tick(), 50);
        }
      }

      const onEnded = () => {
        setSnapshot(notMeasuredAudio("audio_track_ended"));
        stop();
      };
      track.addEventListener("ended", onEnded);

      void ctx.resume?.().catch(() => undefined);
      tick();

      disposeAnalysis = () => {
        stopped = true;
        track.removeEventListener("ended", onEnded);
        if (raf !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
        if (timer !== null) window.clearTimeout(timer);
        raf = null;
        timer = null;
        try {
          analyserA.disconnect();
          analyserB?.disconnect();
          splitter?.disconnect();
          source.disconnect();
        } catch {
          /* noop */
        }
        try {
          void ctx.close?.();
        } catch {
          /* noop */
        }
      };
    };

    // Reuse the stream LiveCamera already received; never open a second WHEP.
    const unsubscribe = subscribeReceivedStream(streamName, (stream) => {
      stop();
      if (!stream) {
        setSnapshot(notMeasuredAudio("no_audio_track"));
        return;
      }
      start(stream);
    });

    return () => {
      unsubscribe();
      stop();
    };
  }, [streamName]);

  return snapshot;
}

/** Exported for tests: dB conversion used by the meter readouts. */
export { amplitudeToDbfs };
