import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

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
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import SourcesRedirect from "@/pages/SourcesRedirect";

describe("caller-only operator workflow", () => {
  it("shows the listener fields and Address Book without legacy source instructions", () => {
    render(
      <MemoryRouter>
        <CreateSession />
      </MemoryRouter>,
    );

    expect(screen.getByText("Friendly Name")).toBeInTheDocument();
    expect(screen.getByText("SRT Address / IP")).toBeInTheDocument();
    expect(screen.getByText("Port")).toBeInTheDocument();
    expect(screen.getByText("MAKO will connect to this SRT listener.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Address Book/i })).toBeInTheDocument();
    expect(screen.queryByText(/My Sources/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Stream ID/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/MAKO Receive/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("134.209.119.136"), {
      target: { value: "174.166.29.128" },
    });
    fireEvent.change(screen.getByPlaceholderText("8890"), { target: { value: "8000" } });
    expect(screen.getByRole("button", { name: "Test Connection" })).toBeDisabled();
  });

  it("does not include Sources in desktop navigation", () => {
    render(
      <MemoryRouter>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "Sources" })).not.toBeInTheDocument();
  });

  it("redirects the retired source path to Create", () => {
    render(
      <MemoryRouter initialEntries={["/sources"]}>
        <Routes>
          <Route path="/sources" element={<SourcesRedirect />} />
          <Route path="/create" element={<div>Create destination</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Create destination")).toBeInTheDocument();
  });
});