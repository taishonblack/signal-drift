/**
 * MAKO browser audio level contract (Phase E.3).
 *
 * Provenance is deliberately narrow: these values are measured from the decoded
 * PCM of the WebRTC audio track MAKO already receives in the browser
 * (MediaMTX WHEP -> RTCPeerConnection -> MediaStream -> Web Audio API).
 *
 * They are NOT source/SRT audio levels and they are NOT loudness (LUFS).
 * This contract never merges into the Phase E.2 media-format snapshot: the two
 * observations have different observation points and different provenance.
 */

/** The only observation point E.3 can honestly claim. */
export type BrowserAudioObservationPoint = "browser_webrtc_pcm";

/** Same vocabulary as the E.2 contract: nothing is ever estimated. */
export type BrowserAudioStatus = "observed" | "unavailable" | "not_measured";

/** "unknown" until a real audio track has been analysed. */
export type BrowserAudioChannelMode = "mono" | "stereo" | "unknown";

export interface BrowserAudioChannelLevel {
  /** Linear RMS amplitude, 0..1. */
  rms: number;
  /** RMS in dBFS, clamped to [DBFS_FLOOR, 0]. */
  rmsDbfs: number;
  /** Linear peak amplitude, 0..1. */
  peak: number;
  /** Peak in dBFS, clamped to [DBFS_FLOOR, 0]. */
  peakDbfs: number;
}

export interface BrowserAudioLevelSnapshot {
  observationPoint: BrowserAudioObservationPoint;
  observedAt: string | null;
  status: BrowserAudioStatus;
  channelMode: BrowserAudioChannelMode;
  /** Present only when the graph exposes a single/combined channel. */
  mono?: BrowserAudioChannelLevel;
  /** Present only together with `right`, and only for genuine stereo. */
  left?: BrowserAudioChannelLevel;
  right?: BrowserAudioChannelLevel;
  /** Why measurement is not running, when it is not. Never a value. */
  reason?: string | null;
}

/** No audio track / no Web Audio API: honest emptiness, never zeros. */
export function notMeasuredAudio(reason?: string): BrowserAudioLevelSnapshot {
  return {
    observationPoint: "browser_webrtc_pcm",
    observedAt: null,
    status: "not_measured",
    channelMode: "unknown",
    reason: reason ?? null,
  };
}

/** A track exists but no usable measurement is currently available. */
export function unavailableAudio(reason?: string): BrowserAudioLevelSnapshot {
  return {
    observationPoint: "browser_webrtc_pcm",
    observedAt: null,
    status: "unavailable",
    channelMode: "unknown",
    reason: reason ?? null,
  };
}

/** True only for a genuine measurement carrying at least one channel. */
export function hasAudioMeasurement(s: BrowserAudioLevelSnapshot | null | undefined): boolean {
  if (!s || s.status !== "observed") return false;
  return !!s.mono || (!!s.left && !!s.right);
}

/**
 * Stereo is only ever claimed when two independently measured channels exist.
 * One mono measurement is never duplicated as Left and Right.
 */
export function isStereo(s: BrowserAudioLevelSnapshot | null | undefined): boolean {
  return !!s && s.channelMode === "stereo" && !!s.left && !!s.right;
}
