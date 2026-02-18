import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { DndContext, closestCenter, DragEndEvent, DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import SignalTile from "@/components/SignalTile";
import DraggableSignalTile from "@/components/session/DraggableSignalTile";
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
import { Bot, RotateCcw } from "lucide-react";
import { useSessionKeyboardShortcuts } from "@/hooks/use-session-keyboard-shortcuts";
import { Button } from "@/components/ui/button";
import { getUnackedAlertCountForSession, getCurrentUser, isHost } from "@/lib/quinn-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { type SlotId, type SlotMap, defaultSlotMap, loadSlotMap, saveSlotMap, swapSlots } from "@/lib/slot-map";

const SLOT_IDS: SlotId[] = ["A", "B", "C", "D"];

/** Grid style for each effective layout mode */
const gridStylesDesktop: Record<string, { cls: string; style: React.CSSProperties }> = {
  "1": { cls: "grid-cols-1", style: { gridTemplateRows: "minmax(0, 1fr)" } },
  "2": { cls: "grid-cols-2", style: { gridTemplateRows: "minmax(0, 1fr)" } },
  "3": { cls: "grid-cols-[2fr_1fr]", style: { gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)" } },
  "4": { cls: "grid-cols-2", style: { gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)" } },
};

const gridStylesMobile: Record<string, { cls: string; style: React.CSSProperties }> = {
  "1": { cls: "grid-cols-1", style: { gridTemplateRows: "minmax(0, 1fr)" } },
  "2": { cls: "grid-cols-1", style: { gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr)" } },
  "3": { cls: "grid-cols-1", style: { gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)" } },
  "4": { cls: "grid-cols-1", style: { gridTemplateRows: "repeat(4, minmax(0, 1fr))" } },
};

const SessionRoom = () => {
  const { id } = useParams();
  const session = mockSessions.find((s) => s.id === id) || mockSessions[0];
  const activeInputs = session.inputs.filter((i) => i.enabled);
  const isMobile = useIsMobile();

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
  const [activeDragSlot, setActiveDragSlot] = useState<SlotId | null>(null);

  const user = getCurrentUser();
  const isHostUser = isHost("u1");
  const alertCount = getUnackedAlertCountForSession(session.id, user.id);

  // Slot map for tile ordering
  const activeLineIds = activeInputs.map((i) => i.id);
  const [slotMap, setSlotMap] = useState<SlotMap>(() =>
    loadSlotMap(session.id, activeLineIds)
  );

  const resetSlotMap = useCallback(() => {
    const def = defaultSlotMap(activeLineIds);
    setSlotMap(def);
    saveSlotMap(session.id, def);
    toast({ title: "Layout reset to default" });
  }, [activeLineIds, session.id]);

  // Time display preferences
  const [timePrefs, setTimePrefs] = useState<TimeDisplayPrefs>(() => loadTimePrefs(session.id));
  const handleTimePrefsChange = useCallback((p: TimeDisplayPrefs) => {
    setTimePrefs(p);
    saveTimePrefs(session.id, p);
  }, [session.id]);

  // Shared Focus state
  const { focusedId, focusedBy, setFocus } = useSessionFocus(session.id, activeInputs[0]?.id ?? "");
  const { getMetrics } = useLiveMetrics(session.inputs);

  const focusedInput = activeInputs.find((i) => i.id === focusedId);
  const focusedLabel = focusedInput?.label ?? "Unknown";

  const getOriginTZ = useCallback((_inputId: string) => {
    return "America/Los_Angeles";
  }, []);
  const focusedOriginTZ = getOriginTZ(focusedId);

  // Escape to exit fullscreen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreenId) setFullscreenId(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreenId]);

  // Global keyboard shortcuts (1-4 jump + arrow cycling) — single-stream mode only
  useSessionKeyboardShortcuts({
    enabled: layout === "1",
    activeLineIds: activeLineIds,
    focusedLineId: focusedId,
    setFocusedLineId: setFocus,
  });

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

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    if (!isHostUser) {
      toast({ title: "Only the host can reorder the multiview" });
      return;
    }
    setActiveDragSlot(event.active.id as SlotId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragSlot(null);
    if (!isHostUser) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const newMap = swapSlots(slotMap, active.id as SlotId, over.id as SlotId);
    setSlotMap(newMap);
    saveSlotMap(session.id, newMap);
  };

  const fullscreenInput = fullscreenId ? activeInputs.find((i) => i.id === fullscreenId) : null;

  // Resolve slot -> input
  const getInputForSlot = (slot: SlotId): StreamInput | undefined => {
    const lineId = slotMap[slot];
    return activeInputs.find((i) => i.id === lineId);
  };

  const draggedInput = activeDragSlot ? getInputForSlot(activeDragSlot) : null;

  const renderDraggableTile = (slot: SlotId) => {
    const input = getInputForSlot(slot);
    if (!input) return null;
    return (
      <DraggableSignalTile
        key={slot}
        slotId={slot}
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
        canDrag={isHostUser}
      />
    );
  };

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

      <div className="flex flex-col h-[calc(100vh-3rem-2rem)] md:h-[calc(100vh-3rem-3rem)] gap-4 w-full max-w-full overflow-x-hidden" style={{ touchAction: "pan-y" }}>
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

        {/* Quinn toggle + alert badge + Reset layout */}
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
          {isHostUser && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetSlotMap}
              className="h-7 gap-1.5 text-xs text-muted-foreground"
              title="Reset tile order to default"
            >
              <RotateCcw className="h-3 w-3" />
              Reset Layout
            </Button>
          )}
        </div>

        {/* Focus indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Focused:</span>
          <span className="text-primary font-medium">{focusedLabel}</span>
          <span className="text-muted-foreground/50">· Focused by: {focusedBy}</span>
        </div>

        <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
          {/* Multiview grid with drag-and-drop */}
          <DndContext
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {(() => {
              const effectiveMode = Math.min(parseInt(layout), activeInputs.length);
              const effectiveStr = effectiveMode.toString();
              const gridMap = isMobile ? gridStylesMobile : gridStylesDesktop;
              const grid = gridMap[effectiveStr] || gridMap["1"];
              const slots = SLOT_IDS.slice(0, effectiveMode);

              // In 1-up mode, show the focused input directly (keyboard shortcut driven)
              if (effectiveMode === 1) {
                const input = focusedInput ?? activeInputs[0];
                if (!input) return null;

                const handleDoubleTap = () => {
                  if (!isMobile) return;
                  const idx = activeLineIds.indexOf(focusedId);
                  const nextIdx = (idx + 1) % activeLineIds.length;
                  setFocus(activeLineIds[nextIdx]);
                };

                return (
                  <div
                    className={`flex-1 grid ${grid.cls} gap-3 min-h-0`}
                    style={grid.style}
                    onDoubleClick={handleDoubleTap}
                  >
                    <DraggableSignalTile
                      slotId="A"
                      input={input}
                      liveMetrics={getMetrics(input.id)}
                      isFocused={true}
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
                      canDrag={false}
                    />
                  </div>
                );
              }

              return (
                <SortableContext items={slots}>
                  <div className={`flex-1 grid ${grid.cls} gap-3 min-h-0`} style={grid.style}>
                    {effectiveStr === "3" && !isMobile ? (
                      <>
                        <div className="row-span-2 min-h-0">{renderDraggableTile("A")}</div>
                        {renderDraggableTile("B")}
                        {renderDraggableTile("C")}
                      </>
                    ) : (
                      slots.map((slot) => renderDraggableTile(slot))
                    )}
                  </div>
                </SortableContext>
              );
            })()}

            <DragOverlay>
              {draggedInput && (
                <div className="opacity-80 rounded-lg overflow-hidden" style={{ width: 320 }}>
                  <SignalTile
                    input={draggedInput}
                    liveMetrics={getMetrics(draggedInput.id)}
                    isFocused={focusedId === draggedInput.id}
                    isAudioSource={audioSource === draggedInput.id}
                    showSafeArea={false}
                  />
                </div>
              )}
            </DragOverlay>
          </DndContext>

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

        {/* Notes panel — in normal flow below multiview */}
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
