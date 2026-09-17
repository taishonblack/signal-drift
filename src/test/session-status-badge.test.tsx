// Regression coverage: the Session Room header badge renders SESSION state
// through the shared SessionStatusBadge — never a hard-coded LIVE/ENDED
// ternary. Feed state (connecting/live/offline) is independent and is not
// asserted here.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SessionToolbar from "@/components/session/SessionToolbar";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

const baseProps = {
  sessionId: "sess-test",
  layout: "1" as const,
  onLayoutChange: () => {},
  timePrefs: { mode: "event" as const, timeZone: "UTC", showElapsed: true },
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

function renderToolbar(sessionStatus: string) {
  return render(
    <SessionToolbar
      {...baseProps}
      sessionName="Phase C Test"
      sessionStatus={sessionStatus as never}
    />,
  );
}

describe("Session Room header badge (session state)", () => {
  it("shows Active for an active session and never ENDED", () => {
    renderToolbar("active");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("ENDED")).not.toBeInTheDocument();
  });

  it("shows Paused for a paused session", () => {
    renderToolbar("paused");
    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.queryByText("ENDED")).not.toBeInTheDocument();
  });

  it("shows Scheduled for a scheduled session", () => {
    renderToolbar("scheduled");
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
    expect(screen.queryByText("ENDED")).not.toBeInTheDocument();
  });

  it("shows Ended for a completed session", () => {
    renderToolbar("completed");
    expect(screen.getByText("Ended")).toBeInTheDocument();
  });

  it("shows Archived for an archived session", () => {
    renderToolbar("archived");
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.queryByText("ENDED")).not.toBeInTheDocument();
  });

  it("maps legacy live to Active", () => {
    renderToolbar("live");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("ENDED")).not.toBeInTheDocument();
  });

  it("a completed session still shows Ended regardless of playback (session state is not masked by feed state)", () => {
    // The toolbar receives no feed/playback props: a completed session renders
    // Ended even while a feed is still playing.
    renderToolbar("completed");
    expect(screen.getByText("Ended")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });
});
