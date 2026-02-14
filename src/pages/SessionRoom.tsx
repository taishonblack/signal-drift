import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import type { TallyState } from "@/components/SignalTile";
import SignalTile from "@/components/SignalTile";
import InspectorPanel from "@/components/InspectorPanel";
import SessionToolbar, { type Layout } from "@/components/session/SessionToolbar";
import FullscreenOverlay from "@/components/session/FullscreenOverlay";
import QCNotesPanel from "@/components/session/QCNotesPanel";
import EditInputModal from "@/components/session/EditInputModal";
import { mockSessions, mockMarkers, type QCMarker, type StreamInput } from "@/lib/mock-data";
import { useLiveMetrics } from "@/hooks/use-live-metrics";
import { toast } from "@/hooks/use-toast";

const gridClass: Record<Layout, string> = {
  "1": "grid-cols-1",
  "2": "grid-cols-1",
  "3": "grid-cols-1 md:grid-cols-3",
  "4": "grid-cols-1 sm:grid-cols-2",
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
  const { getMetrics } = useLiveMetrics(session.inputs);

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
          setTallyMap((prev) => ({ ...prev, [input.id]: prev[input.id] === "preview" ? "none" : "preview" }));
        } else {
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

  const fullscreenInput = fullscreenId ? activeInputs.find((i) => i.id === fullscreenId) : null;

  const renderTile = (input: StreamInput) => (
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
  );

  return (
    <>
      {fullscreenInput && (
        <FullscreenOverlay
          input={fullscreenInput}
          liveMetrics={getMetrics(fullscreenInput.id)}
          tally={tallyMap[fullscreenInput.id] || "none"}
          isAudioSource={audioSource === fullscreenInput.id}
          onClose={() => setFullscreenId(null)}
          onTallyClick={() => cycleTally(fullscreenInput.id)}
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
          showNotes={showNotes}
          onToggleNotes={() => setShowNotes(!showNotes)}
          showInspector={showInspector}
          onToggleInspector={() => setShowInspector(!showInspector)}
        />

        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          <div className={`flex-1 grid ${gridClass[layout]} gap-3 overflow-y-auto`}>
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
