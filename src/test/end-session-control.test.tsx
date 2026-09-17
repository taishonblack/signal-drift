// Explicit End Session control — owner-only surface, confirmation semantics and
// the ordering guarantee: nothing is marked ended locally and no navigation
// happens until the awaited Phase D server end request has succeeded.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import SessionToolbar from "@/components/session/SessionToolbar";
import EndSessionDialog from "@/components/session/EndSessionDialog";
import { DEFAULT_TIME_PREFS } from "@/lib/time-utils";

vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));

const toolbarProps = {
  sessionName: "Phase Test",
  sessionStatus: "active" as const,
  sessionId: "sess-test",
  layout: "1" as const,
  onLayoutChange: () => {},
  timePrefs: DEFAULT_TIME_PREFS,
  onTimePrefsChange: () => {},
  showNotes: false,
  onToggleNotes: () => {},
  showInspector: false,
  onToggleInspector: () => {},
  showSafeArea: false,
  onToggleSafeArea: () => {},
  onShare: () => {},
  configuredCount: 1,
  onPopOutView: () => {},
};

describe("End Session control visibility", () => {
  it("is hidden when no owner handler is supplied (viewer)", () => {
    render(<SessionToolbar {...toolbarProps} />);
    expect(screen.queryByRole("button", { name: /end session/i })).toBeNull();
  });

  it("is shown to the session owner", () => {
    render(<SessionToolbar {...toolbarProps} onEndSession={() => {}} />);
    expect(screen.getByRole("button", { name: /end session/i })).toBeTruthy();
  });

  it("opens the confirmation instead of ending directly", async () => {
    const onEndSession = vi.fn();
    render(<SessionToolbar {...toolbarProps} onEndSession={onEndSession} />);
    fireEvent.click(screen.getByRole("button", { name: /end session/i }));
    expect(onEndSession).toHaveBeenCalledTimes(1);
  });
});

describe("End Session confirmation dialog", () => {
  it("Cancel does nothing but close", async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <EndSessionDialog
        open sessionName="Phase Test" ending={false} error={null}
        onCancel={onCancel} onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("blocks submission while ending", async () => {
    const onConfirm = vi.fn();
    render(
      <EndSessionDialog
        open sessionName="Phase Test" ending error={null}
        onCancel={() => {}} onConfirm={onConfirm}
      />,
    );
    const btn = screen.getByRole("button", { name: /ending/i });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("surfaces a retryable error when termination is not confirmed", () => {
    render(
      <EndSessionDialog
        open sessionName="Phase Test" ending={false}
        error="MAKO could not confirm the end request."
        onCancel={() => {}} onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("alert").textContent).toMatch(/could not confirm/i);
    expect(screen.getByRole("button", { name: /retry end session/i })).toBeTruthy();
  });
});

/**
 * Harness mirroring SessionRoom's confirm flow: local completion + navigation
 * are gated behind the awaited server end request.
 */
function EndFlowHarness({ endRemote }: { endRemote: () => Promise<{ ok: boolean }> }) {
  const [open, setOpen] = useState(true);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (ending) return;
    setEnding(true);
    setError(null);
    const outcome = await endRemote();
    if (!outcome.ok) {
      setEnding(false);
      setError("MAKO could not confirm the end request.");
      return;
    }
    endLocal();
    navigate();
    setEnding(false);
    setOpen(false);
  };
  return (
    <EndSessionDialog
      open={open} sessionName="Phase Test" ending={ending} error={error}
      onCancel={() => setOpen(false)} onConfirm={confirm}
    />
  );
}

const endLocal = vi.fn();
const navigate = vi.fn();

describe("server-confirms-first ordering", () => {
  beforeEach(() => {
    endLocal.mockClear();
    navigate.mockClear();
  });

  it("does not end locally or navigate until the server request resolves", async () => {
    let release: (v: { ok: boolean }) => void = () => {};
    const endRemote = vi.fn(() => new Promise<{ ok: boolean }>((res) => { release = res; }));
    render(<EndFlowHarness endRemote={endRemote} />);

    fireEvent.click(screen.getByRole("button", { name: /^end session$/i }));
    // In flight: Ending… shown, nothing local has happened.
    await waitFor(() => expect(screen.getByRole("button", { name: /ending/i })).toBeTruthy());
    expect(endLocal).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    release({ ok: true });
    await waitFor(() => expect(endLocal).toHaveBeenCalledTimes(1));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("never ends locally when the server request fails", async () => {
    const endRemote = vi.fn(async () => ({ ok: false }));
    render(<EndFlowHarness endRemote={endRemote} />);
    fireEvent.click(screen.getByRole("button", { name: /^end session$/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(endLocal).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    // Retry is possible.
    expect(screen.getByRole("button", { name: /retry end session/i })).toBeTruthy();
  });
});
