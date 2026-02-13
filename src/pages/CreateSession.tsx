import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Save, Eraser, Radio, CheckCircle2, Download, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import AddressBookModal from "@/components/AddressBookModal";
import {
  type SrtLine, type SessionRecord,
  createDefaultLine, getSessions, addSession,
  generateSessionId, generatePin, exportSessionLog,
  saveDraft,
} from "@/lib/session-store";

type HistoryFilter = "all" | "active" | "expired";
type LineStatus = "empty" | "configured" | "error";

const isValidSrt = (addr: string) => addr.trim().startsWith("srt://");

const getLineStatus = (line: SrtLine): LineStatus => {
  if (!line.enabled) return "empty";
  if (!line.srtAddress.trim()) return "empty";
  if (!isValidSrt(line.srtAddress)) return "error";
  return "configured";
};

const statusDot: Record<LineStatus, string> = {
  empty: "",
  configured: "bg-primary",
  error: "bg-destructive",
};

const CreateSession = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [lines, setLines] = useState<SrtLine[]>([
    createDefaultLine(1),
    createDefaultLine(2),
    createDefaultLine(3),
    createDefaultLine(4),
  ]);
  const [activeTab, setActiveTab] = useState(1);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const sessions = getSessions();

  const activeLine = lines.find((l) => l.id === activeTab)!;

  const updateLine = useCallback(
    (patch: Partial<SrtLine>) => {
      setLines((prev) =>
        prev.map((l) => (l.id === activeTab ? { ...l, ...patch } : l))
      );
    },
    [activeTab]
  );

  const handleStart = () => {
    const enabledLines = lines.filter((l) => l.enabled && l.srtAddress.trim());
    if (enabledLines.length === 0) return;
    const sessionName =
      name.trim() || enabledLines[0]?.srtAddress || "Untitled Session";
    const session: SessionRecord = {
      id: generateSessionId(),
      name: sessionName,
      status: "active",
      createdAt: new Date().toISOString(),
      host: "You",
      hostUserId: "u1",
      lines,
      pin: generatePin(),
      notes: [],
      markers: [],
    };
    addSession(session);
    navigate(`/session/${session.id}`);
  };

  const handleSaveDraft = () => {
    saveDraft({
      id: `draft-${Date.now()}`,
      name: name || "Untitled Draft",
      lines,
      createdAt: new Date().toISOString(),
    });
  };

  const handleClearLine = () => {
    updateLine({
      srtAddress: "",
      passphrase: "",
      bitrate: "",
      mode: "caller",
      notes: "",
    });
  };

  const handleDownloadLog = (session: SessionRecord) => {
    const log = exportSessionLog(session);
    const blob = new Blob([log], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mako-session-${session.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredSessions = sessions
    .filter(
      (s) =>
        historyFilter === "all" || s.status === historyFilter
    )
    .slice(0, 10);

  const hasValidLine = lines.some(
    (l) => l.enabled && isValidSrt(l.srtAddress)
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto">
      {/* ─── Left: Create Session Form ─── */}
      <div className="flex-1 lg:flex-[7] space-y-6 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Create Session
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              Configure up to 4 SRT lines. Start with one and add more now or
              later.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <User className="h-3.5 w-3.5" />
            <span>Host: You</span>
          </div>
        </div>

        <div className="mako-glass-solid rounded-lg p-5 md:p-6 space-y-6">
          {/* Session name */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Session Name{" "}
              <span className="normal-case tracking-normal font-normal">
                (optional)
              </span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Super Bowl LVIII — Main Feed Review"
              className="bg-muted/20 border-border/20 text-foreground placeholder:text-muted-foreground/40"
            />
            <p className="text-[10px] text-muted-foreground/60">
              If left blank, MAKO will name the session using the first SRT
              address.
            </p>
          </div>

          {/* SRT Line Tabs */}
          <div className="space-y-4">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              SRT Inputs
            </label>

            <div className="flex gap-1 p-1 rounded-md bg-muted/15 border border-border/15">
              {lines.map((line) => {
                const st = getLineStatus(line);
                return (
                  <button
                    key={line.id}
                    onClick={() => setActiveTab(line.id)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded text-xs font-medium transition-all",
                      activeTab === line.id
                        ? "bg-muted/40 text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground/70"
                    )}
                  >
                    <span>SRT {line.id}</span>
                    {st !== "empty" && (
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          statusDot[st]
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active line form */}
            <div
              className={cn(
                "rounded-md border p-4 space-y-4 transition-colors",
                activeLine.enabled
                  ? "border-border/20 bg-muted/8"
                  : "border-border/10 bg-muted/4 opacity-60"
              )}
            >
              {/* Enable + label row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={activeLine.enabled}
                    onCheckedChange={(checked) =>
                      updateLine({ enabled: checked })
                    }
                  />
                  <Input
                    value={activeLine.label}
                    onChange={(e) => updateLine({ label: e.target.value })}
                    className="w-40 h-7 text-xs bg-transparent border-none px-1 text-foreground"
                  />
                </div>
                <AddressBookModal
                  onSelect={(addr) => updateLine({ srtAddress: addr })}
                />
              </div>

              {activeLine.enabled && (
                <>
                  {/* SRT Address */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      SRT Address
                    </label>
                    <Input
                      value={activeLine.srtAddress}
                      onChange={(e) =>
                        updateLine({ srtAddress: e.target.value })
                      }
                      placeholder="srt://ip:port?mode=caller"
                      className={cn(
                        "bg-muted/15 border-border/15 text-sm text-foreground placeholder:text-muted-foreground/40",
                        activeLine.srtAddress &&
                          !isValidSrt(activeLine.srtAddress) &&
                          "border-destructive/40"
                      )}
                    />
                    {activeLine.srtAddress &&
                      !isValidSrt(activeLine.srtAddress) && (
                        <p className="text-[10px] text-destructive/80">
                          Address must start with srt://
                        </p>
                      )}
                  </div>

                  {/* Passphrase + Bitrate */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Passphrase
                      </label>
                      <Input
                        type="password"
                        value={activeLine.passphrase}
                        onChange={(e) =>
                          updateLine({ passphrase: e.target.value })
                        }
                        placeholder="Optional"
                        className="bg-muted/15 border-border/15 text-sm text-foreground placeholder:text-muted-foreground/40"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Bitrate (kbps)
                      </label>
                      <Input
                        type="number"
                        value={activeLine.bitrate}
                        onChange={(e) =>
                          updateLine({ bitrate: e.target.value })
                        }
                        placeholder="Optional"
                        className="bg-muted/15 border-border/15 text-sm text-foreground placeholder:text-muted-foreground/40"
                      />
                    </div>
                  </div>

                  {/* Mode selector */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Mode
                    </label>
                    <div className="flex gap-1 p-0.5 rounded bg-muted/15 border border-border/15 w-fit">
                      {(["caller", "listener"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => updateLine({ mode: m })}
                          className={cn(
                            "px-4 py-1.5 rounded text-xs font-medium transition-all capitalize",
                            activeLine.mode === m
                              ? "bg-muted/40 text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground/70"
                          )}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Notes
                    </label>
                    <Textarea
                      value={activeLine.notes}
                      onChange={(e) => updateLine({ notes: e.target.value })}
                      placeholder="Optional notes for this line..."
                      rows={2}
                      className="bg-muted/15 border-border/15 text-xs text-foreground placeholder:text-muted-foreground/40 min-h-0"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              onClick={handleStart}
              size="lg"
              disabled={!hasValidLine}
              className="flex-1 gap-2"
            >
              <Play className="h-4 w-4" /> Start Session
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={handleSaveDraft}
              className="gap-2 border-border/30 text-foreground"
            >
              <Save className="h-4 w-4" /> Save Draft
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={handleClearLine}
              className="gap-2 text-muted-foreground"
            >
              <Eraser className="h-4 w-4" /> Clear Line
            </Button>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/50 text-center">
          Host can be transferred inside the session.
        </p>
      </div>

      {/* ─── Right: History Panel ─── */}
      <div className="lg:flex-[3] min-w-0">
        <div className="mako-glass-solid rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-foreground">
              Recent Sessions
            </h2>
            <div className="flex gap-0.5 p-0.5 rounded bg-muted/15 border border-border/15">
              {(["all", "active", "expired"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f)}
                  className={cn(
                    "px-2.5 py-1 rounded text-[10px] font-medium capitalize transition-all",
                    historyFilter === f
                      ? "bg-muted/40 text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground/70"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            {filteredSessions.length === 0 && (
              <p className="text-xs text-muted-foreground/60 text-center py-6">
                No sessions found
              </p>
            )}
            {filteredSessions.map((session) => {
              const isActive = session.status === "active";
              return (
                <button
                  key={session.id}
                  onClick={() =>
                    isActive
                      ? navigate(`/session/${session.id}`)
                      : handleDownloadLog(session)
                  }
                  className="w-full text-left p-3 rounded-md hover:bg-muted/15 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {session.name}
                    </p>
                    {isActive ? (
                      <span className="flex items-center gap-1 text-[10px] text-primary shrink-0">
                        <Radio className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
                        <CheckCircle2 className="h-3 w-3" /> Expired
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(session.createdAt).toLocaleDateString()}{" "}
                      {new Date(session.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50">
                      Host: {session.host}
                    </span>
                  </div>
                  {!isActive && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground/50 mt-1">
                      <Download className="h-2.5 w-2.5" /> Click to download
                      log
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateSession;
