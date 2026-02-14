import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import SignalTile from "@/components/SignalTile";
import InspectorPanel from "@/components/InspectorPanel";
import SessionToolbar, { type Layout, type CompareMode } from "@/components/session/SessionToolbar";
import FullscreenOverlay from "@/components/session/FullscreenOverlay";
import QCNotesPanel from "@/components/session/QCNotesPanel";
import EditInputModal from "@/components/session/EditInputModal";
import { mockSessions, mockMarkers, type QCMarker, type StreamInput } from "@/lib/mock-data";
import { useLiveMetrics } from "@/hooks/use-live-metrics";
import { useSessionFocus } from "@/hooks/use-session-focus";
import { toast } from "@/hooks/use-toast";

const gridClass = (layout: Layout, compareMode: CompareMode): string => {
  const map: Record<Layout, string> = {
    "1": "grid-cols-1",
    "2": compareMode === "side-by-side" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1",
    "3": "grid-cols-1 md:grid-cols-3",
    "4": "grid-cols-1 sm:grid-cols-2",
  };
  return map[layout];
};

const SessionRoom = () => {
  const { id } = useParams();
  const session = mockSessions.find((s) => s.id === id) || mockSessions[0];
  const activeInputs = session.inputs.filter((i) => i.enabled);

  const [layout, setLayout] = useState<Layout>("4");
  const [compareMode, setCompareMode] = useState<CompareMode>("stacked");
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

  // Shared Focus state via realtime
  const { focusedId, focusedBy, setFocus } = useSessionFocus(session.id, activeInputs[0]?.id ?? "");
  const { getMetrics } = useLiveMetrics(session.inputs);

  const focusedInput = activeInputs.find((i) => i.id === focusedId);
  const focusedLabel = focusedInput?.label ?? "Unknown";

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
          compareMode={compareMode}
          onCompareModeChange={setCompareMode}
          showNotes={showNotes}
          onToggleNotes={() => setShowNotes(!showNotes)}
          showInspector={showInspector}
          onToggleInspector={() => setShowInspector(!showInspector)}
        />

        {/* Focus indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Focused:</span>
          <span className="text-primary font-medium">{focusedLabel}</span>
          <span className="text-muted-foreground/50">· Focused by: {focusedBy}</span>
        </div>

        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          <div className={`flex-1 grid ${gridClass(layout, compareMode)} gap-3 overflow-y-auto`}>
            {layout === "3" ? (
              <>
                <div className="md:col-span-2">{activeInputs[0] && renderTile(activeInputs[0])}</div>
                {activeInputs.slice(1, 3).map(renderTile)}
              </>
            ) : (
              activeInputs.slice(0, parseInt(layout)).map(renderTile)
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

        {showNotes && (
          <QCNotesPanel
            focusedLabel={focusedLabel}
            notes={notes}
            onNotesChange={setNotes}
            markerNote={markerNote}
            onMarkerNoteChange={setMarkerNote}
            markers={markers}
            onAddMarker={addMarker}
          />
        )}
      </div>
    </>
  );
};

export default SessionRoom;
