import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { generateMetricHistory, type StreamInput } from "@/lib/mock-data";
import type { LiveMetrics } from "@/hooks/use-live-metrics";

interface InspectorPanelProps {
  input: StreamInput;
  inputs: StreamInput[];
  selectedId: string;
  onSelect: (id: string) => void;
  liveMetrics?: LiveMetrics;
}

const metricHistory = generateMetricHistory();

const InspectorPanel = ({ input, inputs, selectedId, onSelect, liveMetrics }: InspectorPanelProps) => {
  const m = liveMetrics ?? input.metrics;

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

      {/* Codec / format */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <MetricItem label="Codec" value={input.metrics.codec} />
        <MetricItem label="Resolution" value={input.metrics.resolution} />
        <MetricItem label="Frame Rate" value={`${input.metrics.fps} fps`} />
        <MetricItem label="Bitrate" value={`${m.bitrate.toFixed(1)} Mbps`} />
        <MetricItem label="Packet Loss" value={`${m.packetLoss.toFixed(2)}%`} warn={m.packetLoss > 1} />
        <MetricItem label="RTT" value={`${m.rtt.toFixed(0)} ms`} warn={m.rtt > 60} />
        <MetricItem label="Audio" value={`${input.metrics.audioChannels}ch ${input.metrics.audioSampleRate / 1000}kHz`} />
        <MetricItem label="Loudness" value={`${m.lufs.toFixed(1)} LUFS`} />
      </div>

      {/* Mini charts */}
      <div className="space-y-3">
        <MiniChart data={metricHistory} dataKey="bitrate" label="Bitrate" color="hsl(195, 100%, 50%)" />
        <MiniChart data={metricHistory} dataKey="loss" label="Packet Loss" color="hsl(37, 91%, 55%)" />
        <MiniChart data={metricHistory} dataKey="rtt" label="RTT" color="hsl(200, 40%, 60%)" />
      </div>
    </div>
  );
};

const MetricItem = ({ label, value, warn }: { label: string; value: string; warn?: boolean }) => (
  <div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
    <div className={`font-medium font-mono ${warn ? "text-warning" : "text-foreground"}`}>{value}</div>
  </div>
);

const MiniChart = ({ data, dataKey, label, color }: { data: any[]; dataKey: string; label: string; color: string }) => (
  <div>
    <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</div>
    <div className="h-10">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <YAxis hide domain={["auto", "auto"]} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>
);

export default InspectorPanel;
