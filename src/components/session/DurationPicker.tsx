import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const PRESETS: { label: string; minutes: number }[] = [
  { label: "30 min", minutes: 30 },
  { label: "1 hr", minutes: 60 },
  { label: "2 hr", minutes: 120 },
  { label: "4 hr", minutes: 240 },
  { label: "6 hr", minutes: 360 },
];

interface Props {
  /** ISO string or empty */
  value: string;
  onChange: (iso: string) => void;
}

function toLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DurationPicker = ({ value, onChange }: Props) => {
  const [mode, setMode] = useState<"preset" | "custom">("preset");
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(60);

  // If value clears externally, reset local state.
  useEffect(() => {
    if (!value) setSelectedMinutes(null);
  }, [value]);

  const setPreset = (minutes: number) => {
    setMode("preset");
    setSelectedMinutes(minutes);
    const end = new Date(Date.now() + minutes * 60_000);
    onChange(end.toISOString());
  };

  const setCustom = (localValue: string) => {
    setMode("custom");
    setSelectedMinutes(null);
    if (!localValue) {
      onChange("");
      return;
    }
    const d = new Date(localValue);
    if (!isNaN(d.getTime())) onChange(d.toISOString());
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = mode === "preset" && selectedMinutes === p.minutes;
          return (
            <button
              key={p.minutes}
              type="button"
              onClick={() => setPreset(p.minutes)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                active
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "bg-muted/15 text-muted-foreground border-border/20 hover:text-foreground"
              )}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setMode("custom");
            setSelectedMinutes(null);
          }}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
            mode === "custom"
              ? "bg-primary/15 text-primary border-primary/40"
              : "bg-muted/15 text-muted-foreground border-border/20 hover:text-foreground"
          )}
        >
          Ends at…
        </button>
      </div>

      {mode === "custom" && (
        <Input
          type="datetime-local"
          value={toLocalInput(value)}
          onChange={(e) => setCustom(e.target.value)}
          className="bg-muted/15 border-border/15 text-sm h-8 w-full sm:w-64"
        />
      )}

      {value && (
        <p className="text-[10px] text-muted-foreground/70">
          Scheduled to end{" "}
          <span className="text-foreground/80">
            {new Date(value).toLocaleString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </p>
      )}
    </div>
  );
};

export default DurationPicker;
