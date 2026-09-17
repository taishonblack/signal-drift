/**
 * Pure audio-level math for Phase E.3.
 *
 * Every function here is deterministic and operates on real PCM samples handed
 * in by the caller. Nothing in this file can produce a level without samples —
 * there is no seed, no default, no randomness and no estimation.
 */

/** Display floor. Anything quieter is reported as the floor. */
export const DBFS_FLOOR = -60;
/** Full scale. Positive dBFS is never reported. */
export const DBFS_CEILING = 0;

/** Visual ballistics (display only; the measurement itself is untouched). */
export const METER_RELEASE_MS = 300;
export const PEAK_HOLD_MS = 1500;
export const PEAK_RELEASE_MS = 400;

/** dBFS = 20 * log10(amplitude), clamped to [-60, 0]. */
export function amplitudeToDbfs(amplitude: number): number {
  if (!Number.isFinite(amplitude) || amplitude <= 0) return DBFS_FLOOR;
  const db = 20 * Math.log10(amplitude);
  if (db < DBFS_FLOOR) return DBFS_FLOOR;
  if (db > DBFS_CEILING) return DBFS_CEILING;
  return db;
}

/** Root-mean-square amplitude of the supplied PCM block. */
export function rmsFromSamples(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const v = samples[i];
    if (!Number.isFinite(v)) continue;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

/** Absolute peak amplitude of the supplied PCM block. */
export function peakFromSamples(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.abs(samples[i]);
    if (Number.isFinite(v) && v > peak) peak = v;
  }
  return peak;
}

/** A measured level pair for one channel, from real samples only. */
export function levelFromSamples(samples: ArrayLike<number>) {
  const rms = rmsFromSamples(samples);
  const peak = peakFromSamples(samples);
  return {
    rms,
    rmsDbfs: amplitudeToDbfs(rms),
    peak,
    peakDbfs: amplitudeToDbfs(peak),
  };
}

/** Map a dBFS value onto 0..1 across the meter scale, for drawing only. */
export function dbfsToMeterFraction(dbfs: number): number {
  const clamped = Math.min(DBFS_CEILING, Math.max(DBFS_FLOOR, dbfs));
  return (clamped - DBFS_FLOOR) / (DBFS_CEILING - DBFS_FLOOR);
}

/** Ticks shown under the meters. */
export const METER_SCALE_TICKS = [-60, -48, -36, -24, -18, -12, -6, 0];

/**
 * Fast-attack / slow-release smoothing in dB. Rises immediately to the measured
 * value; falls no faster than the release time constant. Visualisation only.
 */
export function applyRelease(
  previousDbfs: number | null,
  measuredDbfs: number,
  elapsedMs: number,
  releaseMs: number = METER_RELEASE_MS,
): number {
  if (previousDbfs === null) return measuredDbfs;
  if (measuredDbfs >= previousDbfs) return measuredDbfs; // fast attack
  const span = DBFS_CEILING - DBFS_FLOOR;
  const drop = (Math.max(0, elapsedMs) / Math.max(1, releaseMs)) * span;
  return Math.max(measuredDbfs, previousDbfs - drop);
}

/** A level is effectively silent when the measured RMS sits at the floor. */
export function isEffectivelySilent(rmsDbfs: number): boolean {
  return rmsDbfs <= DBFS_FLOOR;
}
