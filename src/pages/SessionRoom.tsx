import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import SignalTile from "@/components/SignalTile";
import InspectorPanel from "@/components/InspectorPanel";
import SessionToolbar, { type Layout } from "@/components/session/SessionToolbar";
import FullscreenOverlay from "@/components/session/FullscreenOverlay";
import QCNotesPanel from "@/components/session/QCNotesPanel";
import EditInputModal from "@/components/session/EditInputModal";
import QuinnPanel from "@/components/quinn/QuinnPanel";
import { mockSessions, mockMarkers, type QCMarker, type StreamInput } from "@/lib/mock-data";
import { useLiveMetrics } from "@/hooks/use-live-metrics";
import { useSessionFocus } from "@/hooks/use-session-focus";
import { loadTimePrefs, saveTimePrefs, type TimeDisplayPrefs } from "@/lib/time-utils";
import { toast } from "@/hooks/use-toast";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getUnackedAlertCountForSession, getCurrentUser, isHost } from "@/lib/quinn-store";

/** Grid style for each effective layout mode */
const gridStyles: Record<string, string> = {
  "1": "grid-cols-1",
  "2": "grid-cols-1",
  "3": "grid-cols-[2fr_1fr]",
  "4": "grid-cols-2",
};

const SessionRoom = () => {
  const { id } = useParams();
  const session = mockSessions.find((s) => s.id === id) || mockSessions[0];
  const activeInputs = session.inputs.filter((i) => i.enabled);

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
  const [showQuinn, setShowQuinn] = useState(false);
  const [showSafeArea, setShowSafeArea] = useState(false);

  const user = getCurrentUser();
  const isHostUser = isHost("u1"); // mock host user id
  const alertCount = getUnackedAlertCountForSession(session.id, user.id);

  // Time display preferences (persisted per session)
  const [timePrefs, setTimePrefs] = useState<TimeDisplayPrefs>(() => loadTimePrefs(session.id));
  const handleTimePrefsChange = useCallback((p: TimeDisplayPrefs) => {
    setTimePrefs(p);
    saveTimePrefs(session.id, p);
  }, [session.id]);

  // Shared Focus state via realtime
  const { focusedId, focusedBy, setFocus } = useSessionFocus(session.id, activeInputs[0]?.id ?? "");
  const { getMetrics } = useLiveMetrics(session.inputs);

  const focusedInput = activeInputs.find((i) => i.id === focusedId);
  const focusedLabel = focusedInput?.label ?? "Unknown";

  // Resolve origin TZ for the focused line (mock: use session default or "UTC")
  const getOriginTZ = useCallback((_inputId: string) => {
    // In a real implementation, each input would have its own originTimeZone
    // For now, use a sensible default per mock input
    return "America/Los_Angeles";
  }, []);
  const focusedOriginTZ = getOriginTZ(focusedId);

  // Keyboard shortcuts: ESC fullscreen, 1-4 set Focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreenId) {
        setFullscreenId(null);
        return;
      }
      const num = parseInt(e.key);
      if (num >= 1 && num <= 4 && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const input = activeInputs[num - 1];
        if (input) setFocus(input.id);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreenId, activeInputs, setFocus]);

  const addMarker = () => {
    if (!markerNote.trim()) return;
    const marker: QCMarker = {
      id: `m-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      streamLabel: focusedLabel,
      note: markerNote,
    };
    setMarkers([marker, ...markers]);
    setMarkerNote("");
  };

  const openEdit = useCallback((input: StreamInput) => {
    setEditInput(input);
    setEditAddress(input.srtAddress);
    setEditPassphrase(input.passphrase || "");
  }, []);

  const applyEdit = () => {
    if (!editInput) return;
    toast({ title: `${editInput.label} updated`, description: "Reconnecting with new SRT address…" });
    setEditInput(null);
  };

  const fullscreenInput = fullscreenId ? activeInputs.find((i) => i.id === fullscreenId) : null;

  const renderTile = (input: StreamInput) => (
    <SignalTile
      key={input.id}
      input={input}
      liveMetrics={getMetrics(input.id)}
      isFocused={focusedId === input.id}
      onFocusClick={() => setFocus(input.id)}
      isAudioSource={audioSource === input.id}
      onSelectAudio={() => setAudioSource(input.id)}
      onFullscreen={() => setFullscreenId(input.id)}
      onEdit={() => openEdit(input)}
      timePrefs={timePrefs}
      tileOriginTZ={getOriginTZ(input.id)}
      focusedOriginTZ={focusedOriginTZ}
      sessionStartedAt={session.createdAt}
      showSafeArea={showSafeArea}
    />
  );

  return (
    <>
      {fullscreenInput && (
        <FullscreenOverlay
          input={fullscreenInput}
          liveMetrics={getMetrics(fullscreenInput.id)}
          isFocused={focusedId === fullscreenInput.id}
          isAudioSource={audioSource === fullscreenInput.id}
          onClose={() => setFullscreenId(null)}
          onFocusClick={() => setFocus(fullscreenInput.id)}
          onSelectAudio={() => setAudioSource(fullscreenInput.id)}
          onEdit={() => openEdit(fullscreenInput)}
        />
      )}

      <EditInputModal
        editInput={editInput}
        address={editAddress}
        passphrase={editPassphrase}
        onAddressChange={setEditAddress}
        onPassphraseChange={setEditPassphrase}
        onClose={() => setEditInput(null)}
        onApply={applyEdit}
      />

      <div className="flex flex-col h-[calc(100vh-3rem-2rem)] md:h-[calc(100vh-3rem-3rem)] gap-4">
        <SessionToolbar
          sessionName={session.name}
          sessionStatus={session.status}
          sessionId={session.id}
          sessionPin={session.pin}
          layout={layout}
          onLayoutChange={setLayout}
          timePrefs={timePrefs}
          onTimePrefsChange={handleTimePrefsChange}
          showNotes={showNotes}
          onToggleNotes={() => setShowNotes(!showNotes)}
          showInspector={showInspector}
          onToggleInspector={() => setShowInspector(!showInspector)}
          showSafeArea={showSafeArea}
          onToggleSafeArea={() => setShowSafeArea(!showSafeArea)}
        />

        {/* Quinn toggle + alert badge */}
        <div className="flex items-center gap-2 -mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowQuinn(!showQuinn)}
            className={`h-7 gap-1.5 text-xs relative ${showQuinn ? "text-primary bg-muted/30" : "text-muted-foreground"}`}
          >
            <Bot className="h-3.5 w-3.5" />
            Quinn
            {isHostUser && alertCount > 0 && (
              <span className="h-4 min-w-[16px] px-1 rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center font-bold">
                {alertCount}
              </span>
            )}
          </Button>
        </div>

        {/* Focus indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Focused:</span>
          <span className="text-primary font-medium">{focusedLabel}</span>
          <span className="text-muted-foreground/50">· Focused by: {focusedBy}</span>
        </div>

        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          {/* Multiview grid — auto-packed, no empty tiles */}
          {(() => {
            const effectiveMode = Math.min(parseInt(layout), activeInputs.length).toString();
            const visibleInputs = activeInputs.slice(0, parseInt(effectiveMode));
            const gridCls = gridStyles[effectiveMode] || gridStyles["1"];

            return (
              <div className={`flex-1 grid ${gridCls} gap-3 min-h-0 items-start content-start overflow-y-auto`}>
                {effectiveMode === "3" ? (
                  <>
                    <div className="row-span-2">{visibleInputs[0] && renderTile(visibleInputs[0])}</div>
                    {visibleInputs.slice(1, 3).map(renderTile)}
                  </>
                ) : (
                  visibleInputs.map(renderTile)
                )}
              </div>
            );
          })()}

          {activeInputs.length < parseInt(layout) && (
            <div className="flex items-center px-3">
              <span className="text-[10px] text-muted-foreground/60">
                {activeInputs.length}/{layout} lines active
              </span>
            </div>
          )}

          {showInspector && (
            <InspectorPanel
              input={session.inputs.find((i) => i.id === selectedInput) || session.inputs[0]}
              inputs={session.inputs}
              selectedId={selectedInput}
              onSelect={setSelectedInput}
              liveMetrics={getMetrics(selectedInput)}
            />
          )}

          {showQuinn && (
            <div className="w-72 shrink-0 mako-glass rounded-lg overflow-hidden flex flex-col">
              <QuinnPanel sessionId={session.id} sessionHostUserId="u1" />
            </div>
          )}
        </div>

        {/* Notes panel — in normal flow below multiview, never overlaps */}
        {showNotes && (
          <div className="flex-shrink-0 max-h-60 overflow-auto">
            <QCNotesPanel
              focusedLabel={focusedLabel}
              notes={notes}
              onNotesChange={setNotes}
              markerNote={markerNote}
              onMarkerNoteChange={setMarkerNote}
              markers={markers}
              onAddMarker={addMarker}
            />
          </div>
        )}
      </div>
    </>
  );
};

export default SessionRoom;
