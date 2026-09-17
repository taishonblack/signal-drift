/**
 * FFmpeg input-banner metadata parser (Phase E.2).
 *
 * MAKO's caller is `ffmpeg -i srt://HOST:PORT?mode=caller...`, and FFmpeg
 * reports genuine source stream metadata when the input is opened. This module
 * turns that text into structured facts.
 *
 * Rules:
 *   - pure function over supplied text; no I/O, no runtime dependency
 *   - never manufactures a missing field — absent information stays absent
 *   - tolerates stream order, video-only, audio-only, unknown codecs/profiles
 *   - the browser never runs this; it is server-side only
 */

export interface ParsedVideoStream {
  codec?: string;
  codecProfile?: string;
  width?: number;
  height?: number;
  frameRate?: number;
  scanType?: "progressive" | "interlaced";
  colorSpace?: string;
}

export interface ParsedAudioStream {
  codec?: string;
  codecProfile?: string;
  sampleRate?: number;
  channelLayout?: string;
  channelCount?: number;
  /** Only when FFmpeg explicitly prints a bitrate for the stream. */
  encodedBitrate?: number;
}

export interface ParsedFfmpegMetadata {
  video?: ParsedVideoStream;
  audio?: ParsedAudioStream;
}

const CHANNEL_COUNTS: Record<string, number> = {
  mono: 1,
  stereo: 2,
  "2.1": 3,
  quad: 4,
  "5.0": 5,
  "5.1": 6,
  "6.1": 7,
  "7.1": 8,
};

function streamLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^Stream #\d+:\d+/.test(l));
}

/** Split the descriptor list, ignoring commas inside parentheses. */
function fields(descriptor: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of descriptor) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out.filter(Boolean);
}

function bitrate(parts: string[]): number | undefined {
  for (const p of parts) {
    const m = /^(\d+(?:\.\d+)?)\s*kb\/s$/i.exec(p);
    if (m) return Math.round(Number(m[1]) * 1000);
    const b = /^(\d+(?:\.\d+)?)\s*b\/s$/i.exec(p);
    if (b) return Math.round(Number(b[1]));
  }
  return undefined;
}

function parseVideo(parts: string[]): ParsedVideoStream {
  const video: ParsedVideoStream = {};

  const head = parts[0] ?? "";
  const codecMatch = /^([A-Za-z0-9_.-]+)(?:\s*\(([^)]*)\))?/.exec(head);
  if (codecMatch) {
    if (codecMatch[1]) video.codec = codecMatch[1];
    const profile = (codecMatch[2] ?? "").trim();
    // A profile is a name, not a stream-id note like "1" or "0x1011".
    if (profile && /^[A-Za-z][A-Za-z0-9 .+-]*$/.test(profile)) video.codecProfile = profile;
  }

  for (const part of parts.slice(1)) {
    const dim = /^(\d{2,5})x(\d{2,5})/.exec(part);
    if (dim && video.width === undefined) {
      video.width = Number(dim[1]);
      video.height = Number(dim[2]);
      continue;
    }
    const fps = /^(\d+(?:\.\d+)?)\s*fps$/i.exec(part);
    if (fps && video.frameRate === undefined) {
      video.frameRate = Number(fps[1]);
      continue;
    }
    // Pixel-format field, e.g. yuv420p(tv, bt709, progressive)
    const pix = /^([a-z0-9]+p?[0-9a-z]*)\s*\(([^)]*)\)$/i.exec(part);
    if (pix) {
      for (const note of pix[2].split(",").map((n) => n.trim().toLowerCase())) {
        if (note === "progressive" || note === "interlaced") video.scanType = note;
        else if (/^(bt|smpte|iec)[0-9a-z-]*$/.test(note) && !video.colorSpace) {
          video.colorSpace = note;
        }
      }
      continue;
    }
    const bare = part.trim().toLowerCase();
    if (bare === "progressive" || bare === "interlaced") video.scanType = bare;
  }

  return video;
}

function parseAudio(parts: string[]): ParsedAudioStream {
  const audio: ParsedAudioStream = {};

  const head = parts[0] ?? "";
  const codecMatch = /^([A-Za-z0-9_.-]+)(?:\s*\(([^)]*)\))?/.exec(head);
  if (codecMatch) {
    if (codecMatch[1]) audio.codec = codecMatch[1];
    const profile = (codecMatch[2] ?? "").trim();
    if (profile && /^[A-Za-z][A-Za-z0-9 .+-]*$/.test(profile)) audio.codecProfile = profile;
  }

  for (const part of parts.slice(1)) {
    const hz = /^(\d{3,6})\s*Hz$/i.exec(part);
    if (hz && audio.sampleRate === undefined) {
      audio.sampleRate = Number(hz[1]);
      continue;
    }
    const layout = part.trim().toLowerCase().replace(/\(.*\)$/, "").trim();
    if (audio.channelLayout === undefined && layout in CHANNEL_COUNTS) {
      audio.channelLayout = layout;
      audio.channelCount = CHANNEL_COUNTS[layout];
      continue;
    }
    const chans = /^(\d+)\s*channels?$/i.exec(part);
    if (chans && audio.channelCount === undefined) {
      audio.channelCount = Number(chans[1]);
    }
  }

  const rate = bitrate(parts.slice(1));
  if (rate !== undefined) audio.encodedBitrate = rate;

  return audio;
}

/**
 * Parse FFmpeg's input banner. Returns only what the text actually contains:
 * a video-only input yields no audio, an audio-only input yields no video, and
 * an unparseable input yields an empty result.
 */
export function parseFfmpegMetadata(raw: unknown): ParsedFfmpegMetadata {
  if (typeof raw !== "string" || raw.trim() === "") return {};
  const result: ParsedFfmpegMetadata = {};

  for (const line of streamLines(raw)) {
    const m = /^Stream #\d+:\d+[^:]*:\s*(Video|Audio)\s*:\s*(.+)$/i.exec(line);
    if (!m) continue;
    const kind = m[1].toLowerCase();
    const parts = fields(m[2]);
    if (parts.length === 0) continue;

    if (kind === "video" && !result.video) {
      const video = parseVideo(parts);
      if (Object.keys(video).length > 0) result.video = video;
    } else if (kind === "audio" && !result.audio) {
      const audio = parseAudio(parts);
      if (Object.keys(audio).length > 0) result.audio = audio;
    }
  }

  return result;
}
