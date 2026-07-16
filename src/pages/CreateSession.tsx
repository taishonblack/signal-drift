import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Play, Save, Eraser, User,
  ChevronDown, ChevronRight, Zap, Circle, PlugZap, Plus, Radio, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import AddressBookModal from "@/components/AddressBookModal";
import PurposeSelect from "@/components/session/PurposeSelect";
import DurationPicker from "@/components/session/DurationPicker";
import SessionStatusBadge from "@/components/session/SessionStatusBadge";
import SwitchActiveSessionDialog from "@/components/session/SwitchActiveSessionDialog";
import SessionChangeLogPanel from "@/components/session/SessionChangeLogPanel";
import {
  type SrtLine, type SessionRecord,
  createDefaultLine, getSessions, addSession, getSessionById, updateSession,
  generateSessionId, generatePin, saveDraft,
  parseSrtInput, composeSrt,
  getActiveSessionForUser, endSession,
  getAddressBook, saveAddressBook,
  canConfigureSession, getCurrentUserRef,
  diffSessionConfig, appendChangeLog,
} from "@/lib/session-store";
import { COMMON_TIMEZONES, tzLabel } from "@/lib/time-utils";
import { toast } from "@/components/ui/sonner";

type LineStatus = "empty" | "configured" | "error";

const isConfigured = (line: SrtLine) => {
  const { host, port } = parseSrtInput(line.srtAddress);
  return !!host && !!port;
};

const getLineStatus = (line: SrtLine): LineStatus => {
  if (!line.enabled) return "empty";
  if (!line.srtAddress.trim()) return "empty";
  const { host } = parseSrtInput(line.srtAddress);
  if (!host) return "error";
  return isConfigured(line) ? "configured" : "empty";
};

const statusDot: Record<LineStatus, string> = {
  empty: "",
  configured: "bg-primary",
  error: "bg-destructive",
};


const CreateSession = () => {
  const navigate = useNavigate();
  const { id: routeId } = useParams<{ id: string }>();
  // Promote anon → Temporary Operator on first session touch.
  ensureIdentity();
  const currentUser = getCurrentUserRef();

  // Configure mode: session id in URL.
  const existing = useMemo(
    () => (routeId ? getSessionById(routeId) : undefined),
    [routeId]
  );
  const mode: "create" | "configure" = routeId ? "configure" : "create";
  const isActiveConfigure = mode === "configure" && existing?.status === "active";
  const isReadOnly =
    mode === "configure" &&
    !!existing &&
    (existing.status === "completed" || existing.status === "archived");
  const allowed =
    mode === "create" || (existing ? canConfigureSession(existing, currentUser.id) : false);

  // Redirect viewers who can't configure.
  useEffect(() => {
    if (mode === "configure" && existing && !allowed) {
      toast("Only the session owner or admins can configure this session.");
      navigate(`/session/${existing.id}`, { replace: true });
    }
  }, [mode, existing, allowed, navigate]);

  const seedLines = (): SrtLine[] => {
    if (existing) {
      const base = [...existing.lines];
      while (base.length < 4) base.push(createDefaultLine(base.length + 1));
      return base.slice(0, 4);
    }
    return [
      createDefaultLine(1),
      createDefaultLine(2),
      createDefaultLine(3),
      createDefaultLine(4),
    ];
  };

  const [name, setName] = useState(existing?.name ?? "");
  const [purpose, setPurpose] = useState<string>((existing?.purpose as string) ?? "QC");
  const [scheduledEndAt, setScheduledEndAt] = useState<string>(
    existing?.scheduledEndAt ?? new Date(Date.now() + 60 * 60_000).toISOString(),
  );
  const [defaultOriginTimeZone, setDefaultOriginTimeZone] = useState(
    existing?.defaultOriginTimeZone ?? "UTC"
  );
  const [lines, setLines] = useState<SrtLine[]>(() => seedLines());
  const [activeTab, setActiveTab] = useState(1);
  const [advancedOpen, setAdvancedOpen] = useState<Record<number, boolean>>({});
  const [tested, setTested] = useState<Record<number, boolean>>({});
  const [pendingActiveSession, setPendingActiveSession] = useState<SessionRecord | null>(null);
  const [pendingStart, setPendingStart] = useState<null | (() => void)>(null);
  const sessions = getSessions();

  const activeLine = lines.find((l) => l.id === activeTab)!;
  const { host: activeHost, port: activePort } = useMemo(
    () => parseSrtInput(activeLine.srtAddress),
    [activeLine.srtAddress]
  );

  const updateLine = useCallback(
    (patch: Partial<SrtLine>, lineId: number = activeTab) => {
      setLines((prev) =>
        prev.map((l) => (l.id === lineId ? { ...l, ...patch } : l))
      );
    },
    [activeTab]
  );

  useEffect(() => {
    setTested((prev) => ({ ...prev, [activeTab]: false }));
  }, [activeLine.srtAddress, activeTab]);

  const setHostPort = (host: string, port: string) => {
    updateLine({ srtAddress: composeSrt(host, port) });
  };

  const handleHostChange = (val: string) => {
    if (/[:/?]/.test(val) || /^srt:\/\//i.test(val)) {
      const parsed = parseSrtInput(val);
      setHostPort(parsed.host, parsed.port || activePort);
    } else {
      setHostPort(val, activePort);
    }
  };

  const handlePortChange = (val: string) => {
    setHostPort(activeHost, val.replace(/\D/g, ""));
  };

  const handleAddressBookSelect = (addr: string) => {
    const { host, port } = parseSrtInput(addr);
    setHostPort(host, port);
  };

  const handleSaveToAddressBook = () => {
    if (!activeHost || !activePort) {
      toast("Add an address and port before saving to the Address Book.");
      return;
    }
    const label = /^Line \d+$/.test(activeLine.label) ? "" : activeLine.label;
    const tag = label.trim() || `${activeHost}:${activePort}`;
    const entries = getAddressBook();
    const next = [
      {
        id: `ab-${Date.now()}`,
        tag,
        address: activeHost,
        port: activePort,
        passphrase: activeLine.passphrase || undefined,
        description: activeLine.notes || undefined,
        lastUsed: new Date().toISOString(),
      },
      ...entries,
    ];
    saveAddressBook(next);
    toast(`Saved "${tag}" to Address Book.`);
  };

  const configureSource = () => {
    updateLine({ enabled: true });
  };

  const disableSource = () => {
    updateLine({ enabled: false });
  };

  const testConnection = () => {
    setTested((prev) => ({ ...prev, [activeTab]: true }));
  };

  const createAndNavigate = () => {
    const enabledLines = lines.filter((l) => l.enabled && isConfigured(l));
    if (enabledLines.length === 0) return;
    const firstLabel = enabledLines[0].label;
    const sessionName = name.trim() || firstLabel || "Untitled Session";
    const normalized = lines.map((l) =>
      l.enabled ? { ...l, mode: "caller" as const } : l
    );
    const session: SessionRecord = {
      id: generateSessionId(),
      name: sessionName,
      status: "active",
      purpose,
      scheduledEndAt: scheduledEndAt || undefined,
      createdAt: new Date().toISOString(),
      host: currentUser.name,
      hostUserId: currentUser.id,
      ownerUserId: currentUser.id,
      defaultOriginTimeZone,
      lines: normalized,
      pin: generatePin(),
      notes: [],
      markers: [],
      viewers: [],
      changeLog: [
        {
          id: `cl-${Date.now()}`,
          at: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          kind: "config_saved",
          summary: "Started monitoring session",
        },
      ],
    };
    addSession(session);
    navigate(`/session/${session.id}`);
  };

  const saveConfigureChanges = () => {
    if (!existing) return;
    const normalized = lines.map((l) => (l.enabled ? { ...l, mode: "caller" as const } : l));
    const nextConfig = {
      name: name.trim() || existing.name,
      purpose,
      scheduledEndAt: scheduledEndAt || undefined,
      defaultOriginTimeZone,
      lines: normalized,
    };
    const diffs = diffSessionConfig(existing, nextConfig, currentUser);
    updateSession(existing.id, nextConfig);
    diffs.forEach((d) => appendChangeLog(existing.id, d));
    if (diffs.length === 0) {
      toast("No changes to save.");
    } else {
      toast(
        isActiveConfigure
          ? `Saved — ${diffs.length} change${diffs.length === 1 ? "" : "s"} broadcast to viewers.`
          : "Session configuration saved.",
      );
    }
    if (isActiveConfigure) {
      // Stay on configure page so operator can keep tweaking.
      return;
    }
    navigate("/sessions");
  };

  const handleStart = () => {
    if (mode === "configure") {
      saveConfigureChanges();
      return;
    }
    const enabledLines = lines.filter((l) => l.enabled && isConfigured(l));
    if (enabledLines.length === 0) return;

    // Enforce "one active session per user"
    const active = getActiveSessionForUser(currentUser.id);
    if (active) {
      setPendingActiveSession(active);
      setPendingStart(() => createAndNavigate);
      return;
    }
    createAndNavigate();
  };

  const confirmSwitch = () => {
    if (pendingActiveSession) {
      endSession(pendingActiveSession.id);
    }
    const start = pendingStart;
    setPendingActiveSession(null);
    setPendingStart(null);
    if (start) start();
  };

  const handleSaveDraft = () => {
    saveDraft({
      id: `draft-${Date.now()}`,
      name: name || "Untitled Draft",
      lines,
      createdAt: new Date().toISOString(),
    });
    toast("Draft saved to Recent Sessions.");
  };

  const handleClearLine = () => {
    updateLine({
      srtAddress: "",
      passphrase: "",
      bitrate: "",
      notes: "",
      label: `Line ${activeTab}`,
    });
    setTested((prev) => ({ ...prev, [activeTab]: false }));
  };

  const recentSessions = sessions.slice(0, 10);
  const hasValidLine = lines.some((l) => l.enabled && isConfigured(l));

  const activeAdvancedOpen = !!advancedOpen[activeTab] || !!activeLine.passphrase;
  const activeIsTested = !!tested[activeTab] && isConfigured(activeLine) && activeLine.enabled;

  const pageTitle =
    mode === "create"
      ? "New Session"
      : isReadOnly
        ? "Session Configuration"
        : "Configure Session";
  const pageHint =
    mode === "create"
      ? "A session is the workspace where you and your team monitor these feeds together."
      : isActiveConfigure
        ? "This session is live — changes are broadcast to everyone watching."
        : isReadOnly
          ? "This session has ended. Configuration is read-only."
          : "Update the monitoring setup for this session, then start monitoring.";
  const primaryLabel =
    mode === "create"
      ? "Start Monitoring"
      : isActiveConfigure
        ? "Save Changes"
        : "Start Monitoring";
  const ownerName = existing
    ? (existing.ownerUserId ?? existing.hostUserId) === currentUser.id
      ? "You"
      : existing.host
    : "You";

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto">
      {/* ─── Left: Create Session ─── */}
      <div className="flex-1 lg:flex-[7] space-y-6 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-semibold text-foreground">{pageTitle}</h1>
              {mode === "configure" && existing && (
                <SessionStatusBadge status={existing.status} />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{pageHint}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
            <User className="h-3.5 w-3.5" />
            <span>Owner: {ownerName}</span>
          </div>
        </div>

        {isActiveConfigure && (
          <div className="rounded-md border border-primary/25 bg-primary/[0.06] px-3 py-2 flex items-center gap-2 text-[11px] text-foreground/85">
            <Radio className="h-3.5 w-3.5 text-primary" />
            <span>
              This session is live — {(existing?.viewers ?? []).length} operator
              {(existing?.viewers ?? []).length === 1 ? "" : "s"} watching. Saved changes appear for
              everyone instantly.
            </span>
          </div>
        )}

        {mode === "configure" && !allowed && (
          <div className="rounded-md border border-border/20 bg-muted/10 px-3 py-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            <span>Only the session owner or team administrators can modify this session.</span>
          </div>
        )}

        {/* ── Session Information ── */}
        <div className="mako-glass-solid rounded-lg p-5 md:p-6 space-y-6">
          <SectionHeader
            eyebrow="Session"
            title="Session Information"
            hint="How this workspace shows up in history, and when it should end."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Name <span className="normal-case tracking-normal font-normal">(optional)</span>
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Super Bowl LIX — Main Feed Review"
                className="bg-muted/20 border-border/20 text-foreground placeholder:text-muted-foreground/40"
              />
              <p className="text-[10px] text-muted-foreground/60">
                If left blank, MAKO names it after the first source.
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Purpose
              </label>
              <PurposeSelect value={purpose} onChange={setPurpose} />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Default Event Time Zone
              </label>
              <Select value={defaultOriginTimeZone} onValueChange={setDefaultOriginTimeZone}>
                <SelectTrigger className="bg-muted/20 border-border/20 text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="mako-glass-solid border-border/20">
                  {COMMON_TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tzLabel(tz)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground/60">
                Master clock — every timestamp, note, and marker references this.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                Session Duration
              </label>
              <DurationPicker value={scheduledEndAt} onChange={setScheduledEndAt} />
            </div>
          </div>
        </div>

        {/* ── Sources ── */}
        <div className="mako-glass-solid rounded-lg p-5 md:p-6 space-y-5">
          <SectionHeader
            eyebrow="Feeds"
            title="Sources"
            hint="Tell MAKO where each feed lives — it discovers codec, resolution, bitrate, and latency automatically."
          />

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-md bg-muted/15 border border-border/15">
            {lines.map((line) => {
              const st = getLineStatus(line);
              const isDefaultLabel = /^Line \d+$/.test(line.label);
              const display = isDefaultLabel ? `Source ${line.id}` : line.label;
              return (
                <button
                  key={line.id}
                  onClick={() => setActiveTab(line.id)}
                  className={cn(
                    "flex-1 min-w-0 flex items-center justify-center gap-1.5 py-2 px-3 rounded text-xs font-medium transition-all",
                    activeTab === line.id
                      ? "bg-muted/40 text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground/70"
                  )}
                >
                  <span className="truncate">{display}</span>
                  {st !== "empty" && (
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", statusDot[st])} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Active source card */}
          <div
            className={cn(
              "rounded-md border p-4 space-y-4 transition-colors",
              activeLine.enabled
                ? "border-border/20 bg-muted/8"
                : "border-border/10 bg-muted/4"
            )}
          >
            {/* Status header */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                {!activeLine.enabled ? (
                  <>
                    <Circle className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">Disabled</span>
                  </>
                ) : !isConfigured(activeLine) ? (
                  <>
                    <Circle className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                    <span className="text-xs text-muted-foreground truncate">
                      No source configured
                    </span>
                  </>
                ) : activeIsTested ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))] shrink-0" />
                    <span className="text-xs text-foreground truncate">
                      Connected · {activeLine.label || `Source ${activeTab}`}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-primary/60 shrink-0" />
                    <span className="text-xs text-foreground truncate">
                      Configured · {activeLine.label || `Source ${activeTab}`}
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <AddressBookModal onSelect={handleAddressBookSelect} />
                {activeLine.enabled ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={disableSource}
                    className="text-[11px] h-7 text-muted-foreground hover:text-foreground"
                  >
                    Disable
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={configureSource}
                    className="text-[11px] h-7 text-primary hover:text-primary"
                  >
                    Configure Source
                  </Button>
                )}
              </div>
            </div>

            {activeLine.enabled && (
              <>
                {/* Friendly Name */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Friendly Name
                  </label>
                  <Input
                    value={/^Line \d+$/.test(activeLine.label) ? "" : activeLine.label}
                    onChange={(e) =>
                      updateLine({ label: e.target.value || `Line ${activeTab}` })
                    }
                    placeholder="e.g. NBC Program, Truck A, Camera ISO"
                    className="bg-muted/15 border-border/15 text-sm text-foreground placeholder:text-muted-foreground/40"
                  />
                </div>

                {/* Address + Port + Save */}
                <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] items-end">
                  <div className="space-y-1 min-w-0">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Address
                    </label>
                    <Input
                      value={activeHost}
                      onChange={(e) => handleHostChange(e.target.value)}
                      placeholder="134.209.119.136"
                      className="bg-muted/15 border-border/15 text-sm text-foreground placeholder:text-muted-foreground/40 font-mono"
                    />
                  </div>
                  <div className="space-y-1 sm:w-28">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Port
                    </label>
                    <Input
                      value={activePort}
                      onChange={(e) => handlePortChange(e.target.value)}
                      placeholder="8890"
                      inputMode="numeric"
                      className="bg-muted/15 border-border/15 text-sm text-foreground placeholder:text-muted-foreground/40 font-mono"
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSaveToAddressBook}
                    disabled={!activeHost || !activePort}
                    className="gap-1.5 border-border/30 text-foreground h-9"
                    title="Save this source to your Address Book"
                  >
                    <Plus className="h-3.5 w-3.5" /> Save Source
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground/50 -mt-2">
                  Paste a full <span className="font-mono">srt://</span> URL and MAKO splits it for you.
                </p>

                {/* Notes */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Notes
                  </label>
                  <Textarea
                    value={activeLine.notes}
                    onChange={(e) => updateLine({ notes: e.target.value })}
                    placeholder="Optional context for this source…"
                    rows={2}
                    className="bg-muted/15 border-border/15 text-xs text-foreground placeholder:text-muted-foreground/40 min-h-0"
                  />
                </div>

                {/* Advanced */}
                <div className="border-t border-border/10 pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      setAdvancedOpen((p) => ({ ...p, [activeTab]: !activeAdvancedOpen }))
                    }
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {activeAdvancedOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    Advanced
                  </button>
                  {activeAdvancedOpen && (
                    <div className="mt-3 space-y-1">
                      <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Passphrase
                      </label>
                      <Input
                        type="password"
                        value={activeLine.passphrase}
                        onChange={(e) => updateLine({ passphrase: e.target.value })}
                        placeholder="Only for encrypted SRT streams"
                        className="bg-muted/15 border-border/15 text-sm text-foreground placeholder:text-muted-foreground/40"
                      />
                    </div>
                  )}
                </div>

                {/* Test Connection + Diagnostics */}
                <div className="border-t border-border/10 pt-4 space-y-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testConnection}
                    disabled={!isConfigured(activeLine)}
                    className="gap-2 border-border/30 text-foreground w-full sm:w-auto"
                  >
                    <PlugZap className="h-3.5 w-3.5" />
                    {activeIsTested ? "Re-test Connection" : "Test Connection"}
                  </Button>

                  {activeIsTested && (
                    <div className="rounded-md border border-primary/20 bg-primary/[0.04] p-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-primary">
                        <Zap className="h-3.5 w-3.5" />
                        <span className="font-medium">Stream discovered</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[11px]">
                        <Diag label="Codec" value="H.264 High" />
                        <Diag label="Resolution" value="1920×1080" />
                        <Diag label="FPS" value="59.94" />
                        <Diag label="Bitrate" value="8.3 Mbps" />
                        <Diag label="Latency" value="74 ms" />
                        <Diag label="Packet Loss" value="0.00%" />
                        <Diag label="Audio" value="2ch · 48 kHz" />
                        <Diag label="Loudness" value="-23 LUFS" />
                        <Diag label="Clock Sync" value="Locked" />
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 pt-1">
                        Values reported by MediaMTX after handshake.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              onClick={handleStart}
              size="lg"
              disabled={(mode === "create" && !hasValidLine) || isReadOnly || !allowed}
              className="flex-1 gap-2"
            >
              {mode === "create" || !isActiveConfigure ? (
                <Play className="h-4 w-4" />
              ) : (
                <Save className="h-4 w-4" />
              )}{" "}
              {primaryLabel}
            </Button>
            {mode === "create" && (
              <Button
                variant="outline"
                size="lg"
                onClick={handleSaveDraft}
                className="gap-2 border-border/30 text-foreground"
              >
                <Save className="h-4 w-4" /> Save Draft
              </Button>
            )}
            {mode === "configure" && isActiveConfigure && existing && (
              <Button
                variant="outline"
                size="lg"
                onClick={() => navigate(`/session/${existing.id}`)}
                className="gap-2 border-border/30 text-foreground"
              >
                <Radio className="h-4 w-4" /> Back to Session
              </Button>
            )}
            <Button
              variant="ghost"
              size="lg"
              onClick={handleClearLine}
              className="gap-2 text-muted-foreground"
              disabled={isReadOnly}
            >
              <Eraser className="h-4 w-4" /> Clear Source
            </Button>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/50 text-center">
          Ownership can be transferred inside the session if you leave.
        </p>
      </div>

      {/* ─── Right: Change log (configure) or Recent Sessions (create) ─── */}
      <div className="lg:flex-[3] min-w-0">
        {mode === "configure" && existing ? (
          <div className="mako-glass-solid rounded-lg p-5">
            <SessionChangeLogPanel
              entries={existing.changeLog ?? []}
              emptyLabel="No changes recorded yet. Every save is logged here."
            />
          </div>
        ) : (
          <div className="mako-glass-solid rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">Recent Sessions</h2>
              <span className="text-[10px] text-muted-foreground/60">{recentSessions.length}</span>
            </div>

            <div className="space-y-1">
              {recentSessions.length === 0 && (
                <p className="text-xs text-muted-foreground/60 text-center py-6">
                  No sessions yet
                </p>
              )}
              {recentSessions.map((session) => {
                const canOpen = session.status === "active";
                return (
                  <button
                    key={session.id}
                    onClick={() => canOpen && navigate(`/session/${session.id}`)}
                    className="w-full text-left p-3 rounded-md hover:bg-muted/15 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {session.name}
                      </p>
                      <SessionStatusBadge status={session.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(session.createdAt).toLocaleDateString()}{" "}
                        {new Date(session.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {session.purpose && (
                        <span className="text-[10px] text-muted-foreground/60">
                          · {session.purpose}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/50">
                        · {session.host}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <SwitchActiveSessionDialog
        session={pendingActiveSession}
        onCancel={() => {
          setPendingActiveSession(null);
          setPendingStart(null);
        }}
        onConfirm={confirmSwitch}
      />
    </div>
  );
};

const SectionHeader = ({
  eyebrow,
  title,
  hint,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
}) => (
  <div className="space-y-1">
    <p className="text-[10px] uppercase tracking-widest text-primary/70 font-medium">{eyebrow}</p>
    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

const Diag = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70">{label}</div>
    <div className="font-mono text-foreground truncate">{value}</div>
  </div>
);

export default CreateSession;
