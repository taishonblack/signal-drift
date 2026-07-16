import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import ActiveSessionReturnBar from "./ActiveSessionReturnBar";
import {
  addSession,
  endSession,
  type SessionRecord,
} from "@/lib/session-store";

const USER_ID = "u-test-1";

function seedIdentity() {
  localStorage.setItem(
    "mako_member_identity",
    JSON.stringify({ kind: "member", id: USER_ID, name: "Tester" }),
  );
}

function makeActiveSession(): SessionRecord {
  return {
    id: "sess-test",
    name: "Test Monitoring Session",
    status: "active",
    createdAt: new Date(Date.now() - 60_000).toISOString(),
    host: "Tester",
    hostUserId: USER_ID,
    ownerUserId: USER_ID,
    defaultOriginTimeZone: "America/New_York",
    pin: "0000",
    notes: [],
    markers: [],
    lines: [
      {
        id: 1,
        enabled: true,
        label: "Line 1",
        srtAddress: "srt://example:9000",
        passphrase: "",
        bitrate: "",
        mode: "caller",
        notes: "",
        originTimeZone: "",
      },
    ],
    viewers: [
      {
        userId: USER_ID,
        name: "Tester",
        isOwner: true,
        joinedAt: new Date().toISOString(),
        lastHeartbeatAt: Date.now(),
      },
    ],
    changeLog: [],
  };
}

function Nav({ to }: { to: string }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to);
  }, [navigate, to]);
  return null;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="*" element={<ActiveSessionReturnBar />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ActiveSessionReturnBar lifecycle", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    seedIdentity();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("shows the bar when an active session exists", () => {
    addSession(makeActiveSession());
    renderAt("/sessions");
    expect(screen.getByRole("region", { name: /active session return bar/i })).toBeInTheDocument();
    expect(screen.getByText("Test Monitoring Session")).toBeInTheDocument();
  });

  it("hides the bar immediately when the session ends (no refresh)", () => {
    addSession(makeActiveSession());
    renderAt("/sessions");
    expect(screen.getByRole("region", { name: /active session return bar/i })).toBeInTheDocument();

    act(() => {
      endSession("sess-test");
    });

    expect(screen.queryByRole("region", { name: /active session return bar/i })).toBeNull();
  });

  it("stays hidden across route navigation after ending", () => {
    addSession(makeActiveSession());
    const { rerender } = render(
      <MemoryRouter initialEntries={["/sessions"]}>
        <Routes>
          <Route path="*" element={<ActiveSessionReturnBar />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("region", { name: /active session return bar/i })).toBeInTheDocument();

    act(() => {
      endSession("sess-test");
    });
    expect(screen.queryByRole("region", { name: /active session return bar/i })).toBeNull();

    // Navigate to several other routes; bar must remain hidden.
    for (const path of ["/account", "/ops", "/create", "/sessions"]) {
      rerender(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="*" element={<ActiveSessionReturnBar />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(
        screen.queryByRole("region", { name: /active session return bar/i }),
      ).toBeNull();
    }
  });

  it("does not restore the bar after a simulated browser refresh", () => {
    addSession(makeActiveSession());
    const first = renderAt("/sessions");
    act(() => {
      endSession("sess-test");
    });
    expect(screen.queryByRole("region", { name: /active session return bar/i })).toBeNull();
    first.unmount();

    // Simulate refresh: fresh render, same localStorage. Ended session must
    // NOT be restored as the current session.
    renderAt("/sessions");
    expect(screen.queryByRole("region", { name: /active session return bar/i })).toBeNull();
  });
});
