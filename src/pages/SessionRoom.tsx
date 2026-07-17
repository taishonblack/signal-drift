import { useState, useEffect, useCallback, useRef } from "react";
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
import ScheduledEndDialog from "@/components/session/ScheduledEndDialog";
import ShareSessionDialog from "@/components/session/ShareSessionDialog";
import SessionEndIndicator from "@/components/session/SessionEndIndicator";
import { mockSessions, mockMarkers, type QCMarker, type StreamInput } from "@/lib/mock-data";
import {
  getSessionById,
  updateSession,
  endSession as endSessionRecord,
  extendScheduledEnd,
  joinSession,
  leaveSession,

  claimOwnership,
  orphanSweep,
  updateViewerFocus,
  getCurrentUserRef,
  canConfigureSession,
  appendChangeLog,
  type SessionRecord,
  type SessionChangeEntry,
} from "@/lib/session-store";
import { useIdentity, ensureIdentity } from "@/lib/identity";
import ViewersPanel from "@/components/session/ViewersPanel";
import SharedSessionBadge from "@/components/session/SharedSessionBadge";

import OwnerLeftDialog from "@/components/session/OwnerLeftDialog";
import SaveSessionPrompt from "@/components/session/SaveSessionPrompt";
import SessionChangeLogPanel from "@/components/session/SessionChangeLogPanel";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { History, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import ResizeDivider from "@/components/session/ResizeDivider";
import { useWorkspacePrefs } from "@/hooks/use-workspace-prefs";
import { WORKSPACE_LIMITS, DEFAULT_WORKSPACE_PREFS } from "@/lib/workspace-prefs";
import { ChevronUp, Volume2, VolumeX } from "lucide-react";


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
  const navigate = useNavigate();
  const session = mockSessions.find((s) => s.id === id) || mockSessions[0];
  const activeInputs = session.inputs.filter((i) => i.enabled);
  const isMobile = useIsMobile();
  const identity = useIdentity();

  // Ensure a persistent identity (guest, if not member) before joining.
  const currentUserRef = (() => {
    ensureIdentity();
    return getCurrentUserRef();
  })();

  const [record, setRecord] = useState<SessionRecord | undefined>(() =>
    id ? getSessionById(id) : undefined,
  );
  // Derive scheduledEndAt directly from the record — single source of
  // truth. Do NOT keep a separate local copy that could drift on remount.
  const scheduledEndAt = record?.scheduledEndAt || null;
  const [ownerLeftOpen, setOwnerLeftOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);


  // Join on mount. Presence heartbeat continues via AppLayout's
  // usePresenceLifecycle even after the user navigates away, so leaving
  // this route MUST NOT remove the viewer entry — only explicit "Leave"
  // actions call leaveSession().
  useEffect(() => {
    if (!id) return;
    joinSession(id, currentUserRef);
    setRecord(getSessionById(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);


  // Track last-seen change-log entry to fire toasts for new configuration changes.
  const [lastSeenChangeId, setLastSeenChangeId] = useState<string | undefined>(
    () => record?.changeLog?.[record.changeLog.length - 1]?.id,
  );

  // Poll for viewer/ownership + config-change updates (mock realtime).
  useEffect(() => {
    if (!id) return;
    const t = window.setInterval(() => {
      orphanSweep();
      const next = getSessionById(id);
      setRecord(next);
      const iAmParticipant = (next?.viewers ?? []).some((v) => v.userId === currentUserRef.id);
      if (next && !next.ownerUserId && iAmParticipant && next.status === "active") {
        setOwnerLeftOpen(true);
      } else if (next?.ownerUserId) {
        setOwnerLeftOpen(false);
      }
      // If the session terminated (orphan-swept), navigate out.
      if (next && next.status !== "active" && iAmParticipant === false) {
        // leave-of-session cleanup happens in unmount
      }
      // Change log deltas → toast for changes by other users.
      const log = next?.changeLog ?? [];
      if (log.length > 0) {
        const lastIdx = lastSeenChangeId
          ? log.findIndex((e) => e.id === lastSeenChangeId)
          : -1;
        const fresh: SessionChangeEntry[] = log.slice(lastIdx + 1);
        const foreign = fresh.filter((e) => e.userId !== currentUserRef.id);
        if (foreign.length === 1) {
          toast({
            title: `${foreign[0].userName} updated the session`,
            description: foreign[0].summary,
          });
        } else if (foreign.length > 1) {
          const actor = foreign[foreign.length - 1].userName;
          toast({
            title: `${actor} made ${foreign.length} configuration changes`,
            description: foreign[foreign.length - 1].summary,
          });
        }
        if (fresh.length > 0) {
          setLastSeenChangeId(log[log.length - 1].id);
        }
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [id, currentUserRef.id, lastSeenChangeId]);

  // beforeunload warning for owner with other viewers
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const cur = id ? getSessionById(id) : undefined;
      if (!cur || cur.status !== "active") return;
      const iAmOwner = (cur.ownerUserId ?? cur.hostUserId) === currentUserRef.id;
      const otherViewers = (cur.viewers ?? []).filter((v) => v.userId !== currentUserRef.id);
      if (iAmOwner && otherViewers.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [id, currentUserRef.id]);


  const viewers = record?.viewers ?? [];
  const isOwner = (record?.ownerUserId ?? record?.hostUserId) === currentUserRef.id;
  const canConfigure = canConfigureSession(record, currentUserRef.id);


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
  const [cycleFlash, setCycleFlash] = useState(false);
  const [muteAll, setMuteAll] = useState(false);
  // Phase 1C: double-click a tile to maximize (1-up). Stores the layout to
  // restore on the next double-click. null = not currently maximized.
  const [maximizedRestoreLayout, setMaximizedRestoreLayout] = useState<Layout | null>(null);



  // Per-viewer workspace layout preferences (pane splits, notes height, panel visibility).
  const { prefs: workspacePrefs, update: updateWorkspacePrefs, ready: workspacePrefsReady } =
    useWorkspacePrefs();
  const hydratedInspectorRef = useRef(false);
  useEffect(() => {
    if (!workspacePrefsReady || hydratedInspectorRef.current) return;
    hydratedInspectorRef.current = true;
    setShowInspector(workspacePrefs.inspectorOpen);
    setShowNotes(!workspacePrefs.notesCollapsed ? true : false);
    // Only hydrate once from prefs. Subsequent toggles are user-driven.
  }, [workspacePrefsReady, workspacePrefs.inspectorOpen, workspacePrefs.notesCollapsed]);

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const layout3RowRef = useRef<HTMLDivElement | null>(null);
  const rightStackRef = useRef<HTMLDivElement | null>(null);


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

  /**
   * Personal audio-follows-selection: clicking a pane sets both visual
   * focus AND audio to that source, and clears mute-all. Focus and audio
   * are kept as separate state so a future preference can decouple them
   * (spec §9). Do not merge into one variable.
   */
  const selectSourceForViewer = useCallback(
    (inputId: string) => {
      setFocus(inputId);
      setAudioSource(inputId);
      setMuteAll(false);
    },
    [setFocus],
  );

  const toggleMaximize = useCallback(
    (inputId: string) => {
      if (maximizedRestoreLayout) {
        setLayout(maximizedRestoreLayout);
        setMaximizedRestoreLayout(null);
        return;
      }
      if (layout === "1") return;
      setMaximizedRestoreLayout(layout);
      setFocus(inputId);
      setLayout("1");
    },
    [layout, maximizedRestoreLayout, setFocus],
  );

  // If the user manually changes the layout while maximized, clear the
  // restore memory — their explicit choice supersedes the temporary state.
  const handleLayoutChange = useCallback(
    (next: Layout) => {
      setLayout(next);
      setMaximizedRestoreLayout(null);
    },
    [],
  );


  // Presence: write focused label into current viewer entry.
  useEffect(() => {
    if (!id || !focusedInput) return;
    updateViewerFocus(id, currentUserRef.id, focusedInput.label);
  }, [id, focusedInput, currentUserRef.id]);

  const handleBecomeOwner = useCallback(() => {
    if (!id) return;
    const won = claimOwnership(id, currentUserRef);
    setRecord(getSessionById(id));
    setOwnerLeftOpen(false);
    if (won) {
      toast({ title: "You are now the session owner" });
    } else {
      toast({ title: "Another viewer claimed ownership first" });
    }
  }, [id, currentUserRef]);

  const handleLeaveAsViewer = useCallback(() => {
    if (!id) return;
    leaveSession(id, currentUserRef.id);
    setOwnerLeftOpen(false);
    navigate("/sessions");
  }, [id, currentUserRef.id, navigate]);

  const handleOrphanExpired = useCallback(() => {
    if (!id) return;
    endSessionRecord(id);
    setOwnerLeftOpen(false);
    toast({ title: "Session ended", description: "No owner claimed the session." });
    navigate("/sessions");
  }, [id, navigate]);



  const getOriginTZ = useCallback((_inputId: string) => {
    return "America/Los_Angeles";
  }, []);
  const focusedOriginTZ = getOriginTZ(focusedId);

  // Escape to exit fullscreen; "M" toggles global mute-all (spec §32).
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || el.isContentEditable;
    };
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreenId) {
        setFullscreenId(null);
        return;
      }
      if ((e.key === "m" || e.key === "M") && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (isTyping(e.target)) return;
        e.preventDefault();
        setMuteAll((m) => !m);
      }
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
        onFocusClick={() => selectSourceForViewer(input.id)}
        isAudioSource={audioSource === input.id}
        muteAll={muteAll}
        onSelectAudio={() => selectSourceForViewer(input.id)}
        onDoubleClick={() => toggleMaximize(input.id)}
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

  const handleExtendSession = useCallback(
    (minutes: number) => {
      if (!id) return;
      const nextIso = extendScheduledEnd(id, minutes);
      if (!nextIso) return;
      setRecord(getSessionById(id));
      const label =
        minutes === 60 ? "1 hour" : minutes === 30 ? "30 minutes" : `${minutes} minutes`;
      const endLabel = new Date(nextIso).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
        timeZone: record?.defaultOriginTimeZone,
      });
      appendChangeLog(id, {
        id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        at: new Date().toISOString(),
        userId: currentUserRef.id,
        userName: currentUserRef.name,
        kind: "duration_changed",
        summary: `Session extended by ${label}. New scheduled end: ${endLabel}`,
        after: nextIso,
      });
      toast({ title: `Session extended by ${label}`, description: `New end: ${endLabel}` });
    },
    [id, record?.defaultOriginTimeZone, currentUserRef.id, currentUserRef.name],
  );

  const handleEndSession = useCallback(() => {
    // Guest owner ending a session → offer to save via account creation.
    const cur = id ? getSessionById(id) : undefined;
    const iAmOwner = cur && (cur.ownerUserId ?? cur.hostUserId) === currentUserRef.id;
    if (identity.kind !== "member" && iAmOwner) {
      setSaveOpen(true);
      return;
    }
    if (id) endSessionRecord(id);
    toast({ title: "Session ended" });
    navigate("/sessions");
  }, [id, navigate, identity.kind, currentUserRef.id]);

  const finalizeEnd = useCallback(
    (mode: "keep" | "discard") => {
      setSaveOpen(false);
      if (id) endSessionRecord(id);
      toast({
        title: mode === "discard" ? "Session discarded" : "Session ended",
      });
      navigate("/sessions");
    },
    [id, navigate],
  );

  const handleRegeneratePin = useCallback(async () => {
    if (!id) return;
    const { generatePin } = await import("@/lib/session-store");
    const newPin = generatePin();
    updateSession(id, { pin: newPin });
    const next = getSessionById(id);
    setRecord(next);
    if (identity.kind === "member" && next) {
      try {
        const { saveSessionRemote } = await import("@/lib/sessions-remote");
        await saveSessionRemote(next);
      } catch {
        // Non-fatal: local update stands; remote sync will retry later.
      }
    }
    appendChangeLog(id, {
      id: `cl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      at: new Date().toISOString(),
      userId: currentUserRef.id,
      userName: currentUserRef.name,
      kind: "duration_changed",
      summary: "Session PIN regenerated. Previous PIN no longer accepts new joins.",
    });
  }, [id, identity.kind, currentUserRef.id, currentUserRef.name]);




  return (
    <>
      <ScheduledEndDialog
        scheduledEndAt={scheduledEndAt}
        timeZone={record?.defaultOriginTimeZone}
        onExtend={handleExtendSession}
        onEnd={handleEndSession}
      />

      <OwnerLeftDialog
        open={ownerLeftOpen}
        noOwnerSince={record?.noOwnerSince ?? null}
        onClaim={handleBecomeOwner}
        onLeave={handleLeaveAsViewer}
        onCountdownExpired={handleOrphanExpired}
      />

      <SaveSessionPrompt
        open={saveOpen}
        session={record}
        onDismiss={() => finalizeEnd("keep")}
        onDiscard={() => finalizeEnd("discard")}
      />



      {fullscreenInput && (
        <FullscreenOverlay
          input={fullscreenInput}
          liveMetrics={getMetrics(fullscreenInput.id)}
          isFocused={focusedId === fullscreenInput.id}
          isAudioSource={audioSource === fullscreenInput.id}
          onClose={() => setFullscreenId(null)}
          onFocusClick={() => selectSourceForViewer(fullscreenInput.id)}
          onSelectAudio={() => selectSourceForViewer(fullscreenInput.id)}

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

      <div ref={workspaceRef} className="flex flex-col h-[calc(100vh-3rem-2rem)] md:h-[calc(100vh-3rem-3rem)] gap-4 w-full max-w-full overflow-x-hidden" style={{ touchAction: "pan-y" }}>
        <SessionToolbar
          sessionName={session.name}
          sessionStatus={session.status}
          sessionId={session.id}
          layout={layout}
          onLayoutChange={handleLayoutChange}
          timePrefs={timePrefs}
          onTimePrefsChange={handleTimePrefsChange}
          showNotes={showNotes}
          onToggleNotes={() => {
            const next = !showNotes;
            setShowNotes(next);
            updateWorkspacePrefs({ notesCollapsed: !next });
          }}
          showInspector={showInspector}
          onToggleInspector={() => {
            const next = !showInspector;
            setShowInspector(next);
            updateWorkspacePrefs({ inspectorOpen: next });
          }}
          showSafeArea={showSafeArea}
          onToggleSafeArea={() => setShowSafeArea(!showSafeArea)}
          onShare={() => setShareOpen(true)}
        />


        <ShareSessionDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          sessionId={session.id}
          sessionName={record?.name ?? session.name}
          pin={isOwner ? (record?.pin ?? session.pin) : null}
          isOwner={isOwner}
          onRegeneratePin={isOwner ? handleRegeneratePin : undefined}
        />


        {record?.guestOwned && (
          <div className="-mt-2 rounded-md border border-primary/25 bg-primary/[0.05] px-3 py-2 flex flex-wrap items-center gap-2 text-[11px] text-foreground/85">
            <span className="uppercase tracking-wider text-[9px] text-primary/80 font-semibold">
              Temporary session
            </span>
            <span className="text-muted-foreground">
              This session will not be saved after you close this browser tab unless you sign in or transfer ownership.
            </span>
            <Button
              asChild
              size="sm"
              variant="link"
              className="h-auto p-0 ml-auto text-xs text-primary"
            >
              <a href="/account?mode=login">Sign In to Save</a>
            </Button>
          </div>
        )}

        {/* Quinn toggle + alert badge + Reset layout + Mute All */}
        <div className="flex items-center gap-2 -mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMuteAll((m) => !m)}
            className={`h-7 gap-1.5 text-xs ${muteAll ? "text-primary bg-muted/30" : "text-muted-foreground"}`}
            title="Mute all sources (M)"
            aria-pressed={muteAll}
          >
            {muteAll ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            {muteAll ? "Muted" : "Mute All"}
          </Button>

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
          {canConfigure && id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(`/session/${id}/configure`)}
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              title="Configure this session"
            >
              <Settings className="h-3 w-3" />
              Configure
            </Button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                title="Session change log"
              >
                <History className="h-3 w-3" />
                Activity
                {(record?.changeLog?.length ?? 0) > 0 && (
                  <span className="text-[10px] text-muted-foreground/70">
                    ({record?.changeLog?.length})
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              className="w-80 max-h-96 overflow-auto p-4 mako-glass-solid border-border/20"
            >
              <SessionChangeLogPanel entries={record?.changeLog ?? []} />
            </PopoverContent>
          </Popover>
        </div>

        {/* Focus indicator + presence chip */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Focused:</span>
          <span className="text-primary font-medium">{focusedLabel}</span>
          <span className="text-muted-foreground/50">· Focused by: {focusedBy}</span>
          <div className="ml-auto flex items-center gap-2">
            <SessionEndIndicator
              scheduledEndAt={scheduledEndAt}
              timeZone={record?.defaultOriginTimeZone}
            />
            {isOwner && <span className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold">Owner</span>}
            {viewers.length > 1 && <SharedSessionBadge asViewer={!isOwner} />}
            <ViewersPanel
              viewers={viewers}
              sessionId={id}
              currentUserId={currentUserRef.id}
              onChange={() => id && setRecord(getSessionById(id))}
            />

          </div>
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
                  if (!isMobile || activeLineIds.length < 2) return;
                  const idx = activeLineIds.indexOf(focusedId);
                  const nextIdx = (idx + 1) % activeLineIds.length;
                  setFocus(activeLineIds[nextIdx]);
                  setCycleFlash(true);
                  setTimeout(() => setCycleFlash(false), 350);
                };

                return (
                  <div
                    className={`flex-1 grid ${grid.cls} gap-3 min-h-0 relative`}
                    style={grid.style}
                    onDoubleClick={handleDoubleTap}
                  >
                    <DraggableSignalTile
                      slotId="A"
                      input={input}
                      liveMetrics={getMetrics(input.id)}
                      isFocused={true}
                      onFocusClick={() => selectSourceForViewer(input.id)}
                      isAudioSource={audioSource === input.id}
                      muteAll={muteAll}
                      onSelectAudio={() => selectSourceForViewer(input.id)}

                      onFullscreen={() => setFullscreenId(input.id)}
                      onEdit={() => openEdit(input)}
                      timePrefs={timePrefs}
                      tileOriginTZ={getOriginTZ(input.id)}
                      focusedOriginTZ={focusedOriginTZ}
                      sessionStartedAt={session.createdAt}
                      showSafeArea={showSafeArea}
                      canDrag={false}
                    />
                    {/* Double-tap cycle flash */}
                    {cycleFlash && (
                      <div
                        className="absolute inset-0 rounded-lg pointer-events-none z-20"
                        style={{
                          background: "radial-gradient(ellipse at center, hsla(var(--primary), 0.18) 0%, transparent 70%)",
                          animation: "cycle-flash 350ms ease-out forwards",
                        }}
                      />
                    )}
                  </div>
                );
              }

              // Layout 3 on desktop: resizable big-left + stacked-right.
              if (effectiveStr === "3" && !isMobile) {
                return (
                  <SortableContext items={slots}>
                    <div
                      ref={layout3RowRef}
                      className="flex-1 flex min-h-0 min-w-0 items-stretch"
                    >
                      <div
                        className="min-h-0 min-w-0"
                        style={{ flexBasis: `${workspacePrefs.mainSplitPct}%`, flexGrow: 0, flexShrink: 0 }}
                      >
                        {renderDraggableTile("A")}
                      </div>
                      <ResizeDivider
                        orientation="vertical"
                        value={workspacePrefs.mainSplitPct}
                        min={WORKSPACE_LIMITS.mainSplitMin}
                        max={WORKSPACE_LIMITS.mainSplitMax}
                        step={2}
                        containerRef={layout3RowRef}
                        toValue={(clientX, rect) => ((clientX - rect.left) / rect.width) * 100}
                        onChange={(next) => updateWorkspacePrefs({ mainSplitPct: next })}
                        onDoubleClick={() => updateWorkspacePrefs({ mainSplitPct: DEFAULT_WORKSPACE_PREFS.mainSplitPct })}
                        ariaLabel="Resize left and right panes"
                      />
                      <div
                        ref={rightStackRef}
                        className="flex-1 min-h-0 min-w-0 flex flex-col"
                      >
                        <div
                          className="min-h-0 min-w-0"
                          style={{ flexBasis: `${workspacePrefs.rightStackPct}%`, flexGrow: 0, flexShrink: 0 }}
                        >
                          {renderDraggableTile("B")}
                        </div>
                        <ResizeDivider
                          orientation="horizontal"
                          value={workspacePrefs.rightStackPct}
                          min={WORKSPACE_LIMITS.rightStackMin}
                          max={WORKSPACE_LIMITS.rightStackMax}
                          step={2}
                          containerRef={rightStackRef}
                          toValue={(clientY, rect) => ((clientY - rect.top) / rect.height) * 100}
                          onChange={(next) => updateWorkspacePrefs({ rightStackPct: next })}
                          onDoubleClick={() => updateWorkspacePrefs({ rightStackPct: DEFAULT_WORKSPACE_PREFS.rightStackPct })}
                          ariaLabel="Resize upper and lower right panes"
                        />
                        <div className="flex-1 min-h-0 min-w-0">
                          {renderDraggableTile("C")}
                        </div>
                      </div>
                    </div>
                  </SortableContext>
                );
              }

              return (
                <SortableContext items={slots}>
                  <div className={`flex-1 grid ${grid.cls} gap-3 min-h-0`} style={grid.style}>
                    {slots.map((slot) => renderDraggableTile(slot))}
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
                    muteAll={true}

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

        {/* Notes panel — resizable, with collapse to compact bar. */}
        {showNotes && (
          workspacePrefs.notesCollapsed ? (
            <button
              type="button"
              onClick={() => {
                updateWorkspacePrefs({ notesCollapsed: false });
              }}
              className="flex-shrink-0 flex items-center justify-between gap-3 mako-glass rounded-lg px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Expand notes"
            >
              <span className="flex items-center gap-2">
                <ChevronUp className="h-3.5 w-3.5" />
                <span className="uppercase tracking-wider font-medium">Notes</span>
                <span className="text-muted-foreground/60">·</span>
                <span>{markers.length} markers</span>
                <span className="text-muted-foreground/60">·</span>
                <span>{alertCount} Quinn events</span>
              </span>
              <span className="text-[10px] text-muted-foreground/60">Click to expand</span>
            </button>
          ) : (
            <>
              <ResizeDivider
                orientation="horizontal"
                value={workspacePrefs.notesHeightPx}
                min={WORKSPACE_LIMITS.notesMinPx}
                max={Math.max(
                  WORKSPACE_LIMITS.notesMinPx,
                  Math.floor((workspaceRef.current?.clientHeight ?? 800) * WORKSPACE_LIMITS.notesMaxFraction),
                )}
                step={16}
                containerRef={workspaceRef}
                toValue={(clientY, rect) => rect.bottom - clientY}
                onChange={(next) => updateWorkspacePrefs({ notesHeightPx: next })}
                onDoubleClick={() => updateWorkspacePrefs({ notesHeightPx: DEFAULT_WORKSPACE_PREFS.notesHeightPx })}
                ariaLabel="Resize notes panel"
              />
              <div
                className="flex-shrink-0 overflow-hidden"
                style={{ height: `${workspacePrefs.notesHeightPx}px` }}
              >
                <QCNotesPanel
                  focusedLabel={focusedLabel}
                  notes={notes}
                  onNotesChange={setNotes}
                  markerNote={markerNote}
                  onMarkerNoteChange={setMarkerNote}
                  markers={markers}
                  onAddMarker={addMarker}
                  onCollapse={() => updateWorkspacePrefs({ notesCollapsed: true })}
                />
              </div>
            </>
          )
        )}

      </div>
    </>
  );
};

export default SessionRoom;
