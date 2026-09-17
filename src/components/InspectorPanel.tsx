import type { StreamInput } from "@/lib/mock-data";

interface InspectorPanelProps {
  input: StreamInput;
  inputs: StreamInput[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * Signal Inspector.
 *
 * Phase E.1A (Truth Pass): MAKO does not measure any of these values yet, so
 * every field reads as unavailable instead of showing a fabricated number.
 * The structure is intentionally preserved — real telemetry will populate it
 * in later Phase E work.
 */
const InspectorPanel = ({ input, inputs, selectedId, onSelect }: InspectorPanelProps) => {
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

      <Section title="Video" fields={["Codec", "Resolution", "Frame Rate", "Bitrate"]} />
      <Section title="Transport" fields={["Packet Loss", "RTT"]} />
      <Section title="Audio" fields={["Channels", "Sample Rate", "Loudness"]} />

      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">History</div>
        <div className="text-[10px] text-muted-foreground/60">No telemetry history available.</div>
      </div>
    </div>
  );
};

const Section = ({ title, fields }: { title: string; fields: string[] }) => (
  <div className="space-y-2">
    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{title}</div>
    <div className="grid grid-cols-2 gap-3 text-xs">
      {fields.map((label) => (
        <MetricItem key={label} label={label} />
      ))}
    </div>
    <div className="text-[10px] text-muted-foreground/60">Not measured</div>
  </div>
);

const MetricItem = ({ label }: { label: string }) => (
  <div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    <div className="font-medium font-mono text-muted-foreground/70">—</div>
  </div>
);

export default InspectorPanel;
