import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/identity", async () => {
  const actual = await vi.importActual<typeof import("@/lib/identity")>("@/lib/identity");
  return {
    ...actual,
    ensureIdentity: vi.fn(),
    useIdentity: () => ({ kind: "member", id: "user-1", name: "Operator" }),
  };
});

vi.mock("@/lib/session-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/session-store")>("@/lib/session-store");
  return {
    ...actual,
    getSessions: () => [],
    getCurrentUserRef: () => ({ id: "user-1", name: "Operator" }),
    getActiveSessionForUser: () => undefined,
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, loading: false }),
}));

import CreateSession from "@/pages/CreateSession";

const renderPage = () => render(<MemoryRouter><CreateSession /></MemoryRouter>);

const openGuidance = (name: string) => {
  const button = screen.getByRole("button", { name });
  fireEvent.click(button);
  return button;
};

const closeGuidance = async () => {
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
};

describe("Phase F.1A Create Session guidance", () => {
  it("shows concise truthful helper text for every requested field and action", () => {
    renderPage();

    expect(screen.getByText("Give this monitoring session a recognizable name.")).toBeInTheDocument();
    expect(screen.getByText("Describe how this session will be used.")).toBeInTheDocument();
    expect(screen.getByText("Controls how event timestamps are displayed.")).toBeInTheDocument();
    expect(screen.getByText("Sets the planned duration of this monitoring session.")).toBeInTheDocument();
    expect(screen.getByText(/Signal details that MAKO can directly observe/)).toBeInTheDocument();
    expect(screen.getByText("Name this source so operators can identify it quickly.")).toBeInTheDocument();
    expect(screen.getByText("Remote SRT Listener address. MAKO connects as Caller.")).toBeInTheDocument();
    expect(screen.getByText("UDP port exposed by the remote SRT Listener.")).toBeInTheDocument();
    expect(screen.getByText("Address Book: Reuse previously saved endpoint information.")).toBeInTheDocument();
    expect(screen.getByText("Save this source configuration for future sessions.")).toBeInTheDocument();
    expect(screen.getByText(/Optional connection settings/)).toBeInTheDocument();
    expect(screen.getByText(/Configuration checks validate the information MAKO can confirm/)).toBeInTheDocument();
    expect(screen.getByText(/Start Monitoring validates the configuration/)).toBeInTheDocument();
    expect(screen.queryByText(/discovers codec|discovers.*bitrate|discovers.*latency/i)).not.toBeInTheDocument();
  });

  it("defines session naming, Purpose and UTC without changing transport meaning", async () => {
    renderPage();

    openGuidance("About session name");
    expect(await screen.findByText(/signed-in operators find this workspace in Recent Sessions/i)).toBeVisible();
    expect(screen.getByText(/Temporary sessions remain in this browser tab/i)).toBeVisible();
    await closeGuidance();

    openGuidance("About purpose");
    expect(await screen.findByText(/does not change the incoming signal, SRT connection, or media processing/i)).toBeVisible();
    await closeGuidance();

    openGuidance("About default event time zone");
    expect(await screen.findByText(/UTC remains the underlying recorded reference/i)).toBeVisible();
    expect(screen.getByText(/does not alter recorded event time/i)).toBeVisible();
  });

  it("defines caller addressing and UDP without claiming network evidence", async () => {
    renderPage();

    openGuidance("About friendly name");
    expect(await screen.findByText(/human-readable label/i)).toBeVisible();
    expect(screen.getByText(/does not affect SRT transport/i)).toBeVisible();
    await closeGuidance();

    openGuidance("About srt address or ip");
    const addressBody = await screen.findByText(/MAKO is always the Caller/i);
    expect(addressBody).toHaveTextContent(/private LAN addresses/i);
    expect(addressBody).toHaveTextContent(/does not prove reachability/i);
    await closeGuidance();

    openGuidance("About port");
    const portBody = await screen.findByText(/UDP port used by the remote SRT Listener/i);
    expect(portBody).toHaveTextContent(/does not verify firewall state/i);

    const page = within(document.body);
    expect(page.getByText(/do not test SRT network reachability/i)).toBeInTheDocument();
    expect(page.queryByText(/Connection successful|Endpoint reachable|SRT available|Listener detected/i)).not.toBeInTheDocument();
  });
});