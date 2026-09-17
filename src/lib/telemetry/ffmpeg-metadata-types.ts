/**
 * Shape of the server-side FFmpeg banner parser's output.
 *
 * The parser itself is server-side only
 * (`supabase/functions/_shared/ffmpeg-metadata.ts`); the browser never parses
 * FFmpeg logs. These types exist so the client contract can consume a parsed
 * payload without importing server code.
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
  encodedBitrate?: number;
}

export interface ParsedFfmpegMetadata {
  video?: ParsedVideoStream;
  audio?: ParsedAudioStream;
}
