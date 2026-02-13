import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Grid2X2, Square, Columns2, LayoutDashboard, PanelRightClose, PanelRightOpen, Copy, FileText, X } from "lucide-react";
import type { TallyState } from "@/components/SignalTile";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import SignalTile from "@/components/SignalTile";
import InspectorPanel from "@/components/InspectorPanel";
import { mockSessions, mockMarkers, type QCMarker, type StreamInput } from "@/lib/mock-data";
import { useLiveMetrics } from "@/hooks/use-live-metrics";
import { toast } from "@/hooks/use-toast";

type Layout = "1" | "2" | "3" | "4";

const layoutIcons: Record<Layout, typeof Square> = {
  "1": Square,
  "2": Columns2,
  "3": LayoutDashboard,
  "4": Grid2X2,
};

const SessionRoom = () => {
  const { id } = useParams();
  const session = mockSessions.find((s) => s.id === id) || mockSessions[0];
  const [layout, setLayout] = useState<Layout>("4");
  const [audioSource, setAudioSource] = useState(session.inputs[0]?.id);
  const [showInspector, setShowInspector] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [markers, setMarkers] = useState<QCMarker[]>(mockMarkers);
  const [markerNote, setMarkerNote] = useState("");
  const [selectedInput, setSelectedInput] = useState(session.inputs[0]?.id);
  const [fullscreenId, setFullscreenId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState<StreamInput | null>(null);
  const [editAddress, setEditAddress] = useState("");
  const [editPassphrase, setEditPassphrase] = useState("");
  const [tallyMap, setTallyMap] = useState<Record<string, TallyState>>({});

  const activeInputs = session.inputs.filter((i) => i.enabled);
  const { metrics, getMetrics } = useLiveMetrics(session.inputs);

  // Keyboard shortcuts: ESC fullscreen, 1-4 Program, Shift+1-4 Preview
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreenId) {
        setFullscreenId(null);
        return;
      }
      const num = parseInt(e.key);
      if (num >= 1 && num <= 4) {
        const input = activeInputs[num - 1];
        if (!input) return;
        if (e.shiftKey) {
          // Shift+N → set Preview
          setTallyMap((prev) => ({ ...prev, [input.id]: prev[input.id] === "preview" ? "none" : "preview" }));
        } else {
          // N → set Program (exclusive)
          setTallyMap((prev) => {
            const cleaned: Record<string, TallyState> = {};
            for (const [k, v] of Object.entries(prev)) {
              cleaned[k] = v === "program" ? "preview" : v;
            }
            cleaned[input.id] = prev[input.id] === "program" ? "none" : "program";
            return cleaned;
          });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreenId, activeInputs]);

  const addMarker = () => {
    if (!markerNote.trim()) return;
    const stream = session.inputs.find((i) => i.id === selectedInput);
    const marker: QCMarker = {
      id: `m-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      streamLabel: stream?.label || "Unknown",
      note: markerNote,
    };
    setMarkers([marker, ...markers]);
    setMarkerNote("");
  };

  const copyInvite = () => {
    navigator.clipboard.writeText(`${window.location.origin}/join?session=${session.id}&pin=${session.pin}`);
    toast({ title: "Invite link copied" });
  };

  const openEdit = useCallback((input: StreamInput) => {
    setEditInput(input);
    setEditAddress(input.srtAddress);
    setEditPassphrase(input.passphrase || "");
  }, []);

  const applyEdit = () => {
    if (!editInput) return;
    toast({ title: `${editInput.label} updated`, description: "Reconnecting with new SRT address..." });
    setEditInput(null);
  };

  const cycleTally = useCallback((inputId: string) => {
    setTallyMap((prev) => {
      const current = prev[inputId] || "none";
      const next: TallyState = current === "none" ? "program" : current === "program" ? "preview" : "none";
      // If setting to program, clear any other program
      if (next === "program") {
        const cleaned: Record<string, TallyState> = {};
        for (const [k, v] of Object.entries(prev)) {
          cleaned[k] = v === "program" ? "preview" : v;
        }
        cleaned[inputId] = "program";
        return cleaned;
      }
      return { ...prev, [inputId]: next };
    });
  }, []);

  const gridClass: Record<Layout, string> = {
    "1": "grid-cols-1",
    "2": "grid-cols-1 sm:grid-cols-2",
    "3": "grid-cols-2 grid-rows-2",
    "4": "grid-cols-2",
  };

  const fullscreenInput = fullscreenId ? activeInputs.find((i) => i.id === fullscreenId) : null;
  const fullscreenLive = fullscreenId ? getMetrics(fullscreenId) : undefined;

  return (
    <>
      {/* ─── Fullscreen overlay ─── */}
      {fullscreenInput && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="absolute top-4 right-4 z-10">
            <Button variant="ghost" size="icon" onClick={() => setFullscreenId(null)} className="h-9 w-9 bg-background/60 hover:bg-background/80 text-foreground">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 p-4">
            <SignalTile
              input={fullscreenInput}
              liveMetrics={fullscreenLive}
              tally={tallyMap[fullscreenInput.id] || "none"}
              onTallyClick={() => cycleTally(fullscreenInput.id)}
              isAudioSource={audioSource === fullscreenInput.id}
              onSelectAudio={() => setAudioSource(fullscreenInput.id)}
              onEdit={() => openEdit(fullscreenInput)}
              isFullscreen
            />
          </div>
          <div className="px-4 pb-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">
              {fullscreenInput.label} · {(fullscreenLive?.bitrate ?? fullscreenInput.metrics.bitrate).toFixed(1)} Mbps · {(fullscreenLive?.packetLoss ?? fullscreenInput.metrics.packetLoss).toFixed(2)}% loss · RTT {(fullscreenLive?.rtt ?? fullscreenInput.metrics.rtt).toFixed(0)}ms
            </span>
            <span className="text-[10px] text-muted-foreground/50">Press ESC to exit</span>
          </div>
        </div>
      )}

      {/* ─── Edit SRT Address Modal ─── */}
      <Dialog open={!!editInput} onOpenChange={(open) => !open && setEditInput(null)}>
        <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground text-sm">Edit Input — {editInput?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">SRT Address</label>
              <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="srt://ip:port?mode=caller" className="bg-muted/20 border-border/20 text-sm text-foreground placeholder:text-muted-foreground/40" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Passphrase</label>
              <Input type="password" value={editPassphrase} onChange={(e) => setEditPassphrase(e.target.value)} placeholder="Optional" className="bg-muted/20 border-border/20 text-sm text-foreground placeholder:text-muted-foreground/40" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setEditInput(null)}>Cancel</Button>
              <Button size="sm" onClick={applyEdit}>Apply & Reconnect</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Normal layout ─── */}
      <div className="flex flex-col h-[calc(100vh-3rem-2rem)] md:h-[calc(100vh-3rem-3rem)] gap-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-sm font-medium text-foreground truncate">{session.name}</h1>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium shrink-0">
              {session.status === "live" ? "LIVE" : "ENDED"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {(Object.keys(layoutIcons) as Layout[]).map((l) => {
              const Icon = layoutIcons[l];
              return (
                <Button key={l} variant="ghost" size="icon" onClick={() => setLayout(l)} className={`h-8 w-8 ${layout === l ? "text-primary bg-muted/30" : "text-muted-foreground"}`}>
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              );
            })}
            <div className="w-px h-5 bg-border/30 mx-1" />
            <Button variant="ghost" size="icon" onClick={() => setShowNotes(!showNotes)} className="h-8 w-8 text-muted-foreground hover:text-foreground">
              <FileText className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setShowInspector(!showInspector)} className={`h-8 w-8 ${showInspector ? "text-primary" : "text-muted-foreground"}`}>
              {showInspector ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={copyInvite} className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <Copy className="h-3 w-3" /> PIN {session.pin}
            </Button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          <div className={`flex-1 grid ${gridClass[layout]} gap-3 auto-rows-fr`}>
            {layout === "3" ? (
              <>
                <div className="col-span-2 row-span-1">
                  <SignalTile
                    input={activeInputs[0]}
                    liveMetrics={getMetrics(activeInputs[0]?.id)}
                    tally={tallyMap[activeInputs[0]?.id] || "none"}
                    onTallyClick={() => cycleTally(activeInputs[0]?.id)}
                    isAudioSource={audioSource === activeInputs[0]?.id}
                    onSelectAudio={() => setAudioSource(activeInputs[0]?.id)}
                    onFullscreen={() => setFullscreenId(activeInputs[0]?.id)}
                    onEdit={() => openEdit(activeInputs[0])}
                  />
                </div>
                {activeInputs.slice(1, 3).map((input) => (
                  <SignalTile
                    key={input.id}
                    input={input}
                    liveMetrics={getMetrics(input.id)}
                    tally={tallyMap[input.id] || "none"}
                    onTallyClick={() => cycleTally(input.id)}
                    isAudioSource={audioSource === input.id}
                    onSelectAudio={() => setAudioSource(input.id)}
                    onFullscreen={() => setFullscreenId(input.id)}
                    onEdit={() => openEdit(input)}
                  />
                ))}
              </>
            ) : (
              activeInputs.slice(0, parseInt(layout)).map((input) => (
                <SignalTile
                  key={input.id}
                  input={input}
                  liveMetrics={getMetrics(input.id)}
                  tally={tallyMap[input.id] || "none"}
                  onTallyClick={() => cycleTally(input.id)}
                  isAudioSource={audioSource === input.id}
                  onSelectAudio={() => setAudioSource(input.id)}
                  onFullscreen={() => setFullscreenId(input.id)}
                  onEdit={() => openEdit(input)}
                />
              ))
            )}
          </div>

          {showInspector && (
            <InspectorPanel
              input={session.inputs.find((i) => i.id === selectedInput) || session.inputs[0]}
              inputs={session.inputs}
              selectedId={selectedInput}
              onSelect={setSelectedInput}
              liveMetrics={getMetrics(selectedInput)}
            />
          )}
        </div>

        {/* Notes panel */}
        {showNotes && (
          <div className="mako-glass rounded-lg p-4 space-y-3 max-h-60 overflow-auto">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">QC Notes</span>
            </div>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Shared session notes..." className="bg-muted/20 border-border/20 text-sm min-h-[60px] text-foreground placeholder:text-muted-foreground/40" />
            <div className="flex gap-2">
              <Input value={markerNote} onChange={(e) => setMarkerNote(e.target.value)} placeholder="Add QC marker..." className="bg-muted/20 border-border/20 text-sm text-foreground placeholder:text-muted-foreground/40" onKeyDown={(e) => e.key === "Enter" && addMarker()} />
              <Button size="sm" onClick={addMarker} className="shrink-0">Mark</Button>
            </div>
            <div className="space-y-1">
              {markers.map((m) => (
                <div key={m.id} className="flex items-start gap-2 text-xs py-1 border-t border-border/10">
                  <span className="text-primary font-mono shrink-0">{m.timestamp}</span>
                  <span className="text-muted-foreground shrink-0">{m.streamLabel}</span>
                  <span className="text-foreground">{m.note}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default SessionRoom;
