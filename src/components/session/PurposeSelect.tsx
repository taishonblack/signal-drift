import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const PRESETS = ["Review", "QC", "Troubleshooting", "Replay Review", "Engineering"] as const;

interface Props {
  value: string;
  onChange: (val: string) => void;
}

const PurposeSelect = ({ value, onChange }: Props) => {
  const isPreset = (PRESETS as readonly string[]).includes(value);
  const [customMode, setCustomMode] = useState(!!value && !isPreset);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = value === p && !customMode;
          return (
            <button
              key={p}
              type="button"
              onClick={() => {
                setCustomMode(false);
                onChange(p);
              }}
              className={cn(
                "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
                active
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "bg-muted/15 text-muted-foreground border-border/20 hover:text-foreground"
              )}
            >
              {p}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setCustomMode(true);
            if (isPreset) onChange("");
          }}
          className={cn(
            "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
            customMode
              ? "bg-primary/15 text-primary border-primary/40"
              : "bg-muted/15 text-muted-foreground border-border/20 hover:text-foreground"
          )}
        >
          Custom
        </button>
      </div>
      {customMode && (
        <Input
          value={isPreset ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Describe the purpose…"
          className="bg-muted/15 border-border/15 text-sm h-8"
        />
      )}
    </div>
  );
};

export default PurposeSelect;
