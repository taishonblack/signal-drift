import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface InputLine {
  id: string;
  label: string;
  enabled: boolean;
  srtAddress: string;
  passphrase: string;
}

const defaultLine = (n: number): InputLine => ({
  id: `line-${n}`,
  label: `Line ${n}`,
  enabled: true,
  srtAddress: "",
  passphrase: "",
});

const CreateSession = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [lines, setLines] = useState<InputLine[]>([defaultLine(1)]);

  const addLine = () => {
    if (lines.length >= 4) return;
    setLines([...lines, defaultLine(lines.length + 1)]);
  };

  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, patch: Partial<InputLine>) => {
    setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleStart = () => {
    navigate("/session/sess-001");
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Create Review Session</h1>
        <p className="text-sm text-muted-foreground">Configure SRT inputs for live signal monitoring</p>
      </div>

      <div className="mako-glass rounded-lg p-6 space-y-6">
        {/* Session name */}
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Session Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Super Bowl LVIII — Main Feed Review"
            className="bg-muted/30 border-border/30 text-foreground placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Input lines */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
              SRT Inputs
            </label>
            {lines.length < 4 && (
              <Button variant="ghost" size="sm" onClick={addLine} className="gap-1 text-xs text-primary hover:text-primary">
                <Plus className="h-3 w-3" /> Add Input
              </Button>
            )}
          </div>

          {lines.map((line) => (
            <div
              key={line.id}
              className={`rounded-md border p-4 space-y-3 transition-colors ${
                line.enabled ? "border-border/30 bg-muted/10" : "border-border/10 bg-muted/5 opacity-50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={line.enabled}
                    onCheckedChange={(checked) => updateLine(line.id, { enabled: checked })}
                  />
                  <Input
                    value={line.label}
                    onChange={(e) => updateLine(line.id, { label: e.target.value })}
                    className="w-40 h-7 text-xs bg-transparent border-none px-1 text-foreground"
                  />
                </div>
                {lines.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeLine(line.id)} className="h-7 w-7 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {line.enabled && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">SRT Address</label>
                    <Input
                      value={line.srtAddress}
                      onChange={(e) => updateLine(line.id, { srtAddress: e.target.value })}
                      placeholder="srt://host:port?streamid=..."
                      className="bg-muted/20 border-border/20 text-sm text-foreground placeholder:text-muted-foreground/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Passphrase</label>
                    <Input
                      type="password"
                      value={line.passphrase}
                      onChange={(e) => updateLine(line.id, { passphrase: e.target.value })}
                      placeholder="Optional"
                      className="bg-muted/20 border-border/20 text-sm text-foreground placeholder:text-muted-foreground/40"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <Button onClick={handleStart} size="lg" className="w-full gap-2">
        Start Session
      </Button>
    </div>
  );
};

export default CreateSession;
