import type { StreamInput } from "@/lib/mock-data";
import {
  hasValue,
  type MediaTelemetrySnapshot,
  type Observed,
} from "@/lib/telemetry/contract";
import {
  hasAudioMeasurement,
  isStereo,
  type BrowserAudioChannelLevel,
  type BrowserAudioLevelSnapshot,
} from "@/lib/telemetry/browser-audio-contract";
import {
  dbfsToMeterFraction,
  isEffectivelySilent,
  METER_SCALE_TICKS,
} from "@/lib/telemetry/browser-audio-levels";
import { useBrowserAudioLevels } from "@/hooks/use-browser-audio-levels";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { LiveCameraState } from "@/components/LiveCamera";
import {
  observationFromPlaybackState,
  subscribePlaybackState,
} from "@/lib/diagnostics/playback-state-registry";
import { buildPlaybackDiagnostic } from "@/lib/diagnostics/signal-diagnostic";
import { buildDiagnosticSummary } from "@/lib/diagnostics/diagnostic-summary";
import SignalDiagnosticCard from "@/components/diagnostics/SignalDiagnosticCard";
import { Button } from "@/components/ui/button";

interface InspectorPanelProps {
  input: StreamInput;
  inputs: StreamInput[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** Telemetry for the selected source, resolved by runtime route id. */
  telemetry?: MediaTelemetrySnapshot | null;
  /**
   * Phase E.3 browser audio measurement. Normally measured internally from the
   * stream LiveCamera already received; injectable for tests.
   */
  audioLevel?: BrowserAudioLevelSnapshot | null;
  /**
   * Phase F.1 — observed playback state for this source. Normally read from the
   * registry LiveCamera publishes to; injectable for tests.
   */
  playbackState?: LiveCameraState | null;
  /** Opens the source's configuration. */
  onConfigureSource?: () => void;
}

/**
 * Signal Inspector.
 *
 * Phase E.2: reads the typed telemetry contract. Only genuinely observed values
 * render; anything MAKO does not measure stays `—` with the quiet "Not measured"
 * caption. Transport carries no measurements in this phase, and MAKO's own
 * output audio is shown separately from the source's audio.
 */
const InspectorPanel = ({
  input,
  inputs,
  selectedId,
  onSelect,
  telemetry,
  audioLevel,
  playbackState,
  onConfigureSource,
}: InspectorPanelProps) => {
  const t = telemetry ?? null;
  const measured = useBrowserAudioLevels(input?.streamName ?? null);
  const levels = audioLevel !== undefined ? audioLevel : measured;

  // Phase F.1 — passive read of the state LiveCamera already observed.
  const [registryState, setRegistryState] = useState<LiveCameraState | null>(null);
  const streamName = input?.streamName ?? null;
  useEffect(() => {
    if (!streamName) {
      setRegistryState(null);
      return;
    }
    return subscribePlaybackState(streamName, setRegistryState);
  }, [streamName]);

  const observedPlayback = playbackState !== undefined ? playbackState : registryState;
  const routeCreated = Boolean(input?.runtimeRouteId);
  const diagnostic = buildPlaybackDiagnostic({
    observation: observationFromPlaybackState(observedPlayback),
    routeCreated,
    endpoint: input?.srtAddress || null,
    sourceLabel: input?.label ?? null,
  });

  const resolution =
    t && hasValue(t.video.width) && hasValue(t.video.height)
      ? `${t.video.width.value} × ${t.video.height.value}`
      : null;

  const videoFields: Field[] = [
    { label: "Codec", text: codecText(t?.video.codec, t?.video.codecProfile) },
    { label: "Resolution", text: resolution },
    { label: "Frame Rate", text: hasValue(t?.video.frameRate) ? `${t!.video.frameRate.value} fps` : null },
    { label: "Scan", text: hasValue(t?.video.scanType) ? String(t!.video.scanType.value) : null },
    { label: "Color Space", text: hasValue(t?.video.colorSpace) ? String(t!.video.colorSpace.value) : null },
  ];

  const transportFields: Field[] = [
    { label: "Bitrate", text: null },
    { label: "Packet Loss", text: null },
    { label: "RTT", text: null },
  ];

  const audioFields: Field[] = [
    { label: "Codec", text: codecText(t?.audioSource.codec, undefined) },
    {
      label: "Sample Rate",
      text: hasValue(t?.audioSource.sampleRate)
        ? `${(t!.audioSource.sampleRate.value as number) / 1000} kHz`
        : null,
    },
    { label: "Channels", text: numberText(t?.audioSource.channelCount) },
    { label: "Output Codec", text: codecText(t?.audioOutput.outputAudioCodec, undefined) },
    {
      label: "Output Rate",
      text: hasValue(t?.audioOutput.outputAudioSampleRate)
        ? `${(t!.audioOutput.outputAudioSampleRate.value as number) / 1000} kHz`
        : null,
    },
    { label: "Output Channels", text: numberText(t?.audioOutput.outputAudioChannels) },
    {
      label: "Output Bitrate",
      text: hasValue(t?.audioOutput.configuredOutputAudioBitrate)
        ? `${Math.round((t!.audioOutput.configuredOutputAudioBitrate.value as number) / 1000)} kb/s (configured)`
        : null,
    },
  ];

  return (
    <div className="w-72 shrink-0 mako-glass-solid rounded-lg p-4 space-y-4 overflow-auto hidden lg:block">
      {/* Stream selector */}
      <div className="flex gap-1">
        {inputs.filter((i) => i.enabled).map((i) => (
          <button
            key={i.id}
            onClick={() => onSelect(i.id)}
            className={`text-[10px] px-2 py-1 rounded transition-colors ${
              selectedId === i.id ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {i.label.split(" — ")[0]}
          </button>
        ))}
      </div>

      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Signal Inspector</div>

      <Section title="Video" fields={videoFields} />
      <Section title="Transport" fields={transportFields} />
      <Section title="Audio" fields={audioFields} />

      <BrowserAudioLevelSection levels={levels} />


      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">History</div>
        <div className="text-[10px] text-muted-foreground/60">No telemetry history available.</div>
      </div>
    </div>
  );
};

type Field = { label: string; text: string | null };

function numberText(field: Observed<number> | undefined): string | null {
  return hasValue(field) ? String(field!.value) : null;
}

function codecText(
  codec: Observed<string> | undefined,
  profile: Observed<string> | undefined,
): string | null {
  if (!hasValue(codec)) return null;
  const name = String(codec!.value);
  return hasValue(profile) ? `${name} ${profile!.value}` : name;
}

const Section = ({ title, fields }: { title: string; fields: Field[] }) => {
  const anyObserved = fields.some((f) => f.text !== null);
  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{title}</div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        {fields.map((f) => (
          <MetricItem key={f.label} label={f.label} text={f.text} />
        ))}
      </div>
      {!anyObserved && <div className="text-[10px] text-muted-foreground/60">Not measured</div>}
    </div>
  );
};

/**
 * Phase E.3 — Browser audio level.
 *
 * Measured from the decoded PCM of the WebRTC audio MAKO already receives.
 * These are NOT source/SRT levels and NOT loudness (LUFS). With no measurement
 * available the section says plainly that nothing is measured; it never shows
 * animated activity without real samples.
 */
const BrowserAudioLevelSection = ({
  levels,
}: {
  levels: BrowserAudioLevelSnapshot | null | undefined;
}) => {
  const observed = hasAudioMeasurement(levels);
  const stereo = isStereo(levels);

  return (
    <div className="space-y-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
        Browser Audio Level
      </div>

      {!observed || !levels ? (
        <div className="text-[10px] text-muted-foreground/60">— Not measured</div>
      ) : (
        <div className="space-y-1.5">
          {stereo ? (
            <>
              <MeterRow label="L" level={levels.left as BrowserAudioChannelLevel} />
              <MeterRow label="R" level={levels.right as BrowserAudioChannelLevel} />
            </>
          ) : (
            <MeterRow label="M" level={levels.mono as BrowserAudioChannelLevel} />
          )}

          <div className="flex justify-between text-[8px] text-muted-foreground/50 font-mono pl-4">
            {METER_SCALE_TICKS.map((tick) => (
              <span key={tick}>{tick}</span>
            ))}
          </div>

          {allSilent(levels) && (
            <div className="text-[10px] text-muted-foreground/60">Silence</div>
          )}
        </div>
      )}
    </div>
  );
};

function allSilent(levels: BrowserAudioLevelSnapshot): boolean {
  const chans = [levels.mono, levels.left, levels.right].filter(Boolean) as BrowserAudioChannelLevel[];
  return chans.length > 0 && chans.every((c) => isEffectivelySilent(c.rmsDbfs));
}

const MeterRow = ({ label, level }: { label: string; level: BrowserAudioChannelLevel }) => {
  const rms = Math.round(level.rmsDbfs * 10) / 10;
  const peak = Math.round(level.peakDbfs * 10) / 10;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-3 text-[10px] font-mono text-muted-foreground">{label}</span>
      <div
        className="relative h-2 flex-1 min-w-0 rounded-sm overflow-hidden bg-muted/30"
        role="meter"
        aria-label={`${label} level`}
        aria-valuenow={rms}
      >
        <div
          className="absolute inset-y-0 left-0 bg-primary/70"
          style={{ width: `${dbfsToMeterFraction(level.rmsDbfs) * 100}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-primary"
          style={{ left: `calc(${dbfsToMeterFraction(level.peakDbfs) * 100}% - 1px)` }}
        />
      </div>
      <span className="w-[62px] text-right text-[10px] font-mono text-foreground">
        {rms.toFixed(1)} dBFS
      </span>
      <span className="w-[46px] text-right text-[9px] font-mono text-muted-foreground/70">
        pk {peak.toFixed(1)}
      </span>
    </div>
  );
};

const MetricItem = ({ label, text }: { label: string; text: string | null }) => (
  <div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    <div className={`font-medium font-mono ${text ? "text-foreground" : "text-muted-foreground/70"}`}>
      {text ?? "—"}
    </div>
  </div>
);

export default InspectorPanel;
