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
}

/**
 * Signal Inspector.
 *
 * Phase E.2: reads the typed telemetry contract. Only genuinely observed values
 * render; anything MAKO does not measure stays `—` with the quiet "Not measured"
 * caption. Transport carries no measurements in this phase, and MAKO's own
 * output audio is shown separately from the source's audio.
 */
const InspectorPanel = ({ input, inputs, selectedId, onSelect, telemetry }: InspectorPanelProps) => {
  const t = telemetry ?? null;

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

const MetricItem = ({ label, text }: { label: string; text: string | null }) => (
  <div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    <div className={`font-medium font-mono ${text ? "text-foreground" : "text-muted-foreground/70"}`}>
      {text ?? "—"}
    </div>
  </div>
);

export default InspectorPanel;
