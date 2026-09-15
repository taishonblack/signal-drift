import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Fake-only: no network, no Supabase, no MAKO API.
const authState = { user: { id: "u1" } as { id: string } | null, loading: false };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => authState }));

const hookState = {
  sources: [] as unknown[],
  loading: false,
  error: null as string | null,
  refresh: vi.fn(),
  createSource: vi.fn(),
  renameSource: vi.fn(),
  deleteSource: vi.fn(),
  atLimit: false,
};

vi.mock("@/hooks/use-my-sources", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-my-sources")>(
    "@/hooks/use-my-sources",
  );
  return { ...actual, useMySources: () => hookState };
});

import Sources from "@/pages/Sources";

const view = () =>
  render(
    <MemoryRouter>
      <Sources />
    </MemoryRouter>,
  );

const source = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  name: "Camera A",
  connectionMode: "receive",
  lifecycleStatus: "ready",
  connectionStatus: "unknown",
  srtPort: 10025,
  infrastructureSourceId: "src_abc123",
  createdAt: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  authState.user = { id: "u1" };
  hookState.sources = [];
  hookState.loading = false;
  hookState.error = null;
  hookState.atLimit = false;
});

describe("My Sources page", () => {
  it("invites signed-out visitors to sign in instead of showing sources", () => {
    authState.user = null;
    view();
    expect(screen.getByText(/Sign in to keep your own sources/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New Source/i })).not.toBeInTheDocument();
  });

  it("shows the quota counter and an empty state for a new operator", () => {
    view();
    expect(screen.getByText("0 of 4 sources used")).toBeInTheDocument();
    expect(screen.getByText(/No sources yet/i)).toBeInTheDocument();
  });

  it("lists an owned source with its destination and port", () => {
    hookState.sources = [source()];
    view();
    expect(screen.getByText("Camera A")).toBeInTheDocument();
    expect(screen.getByText(/stream\.makosrt\.com : 10025/)).toBeInTheDocument();
  });

  it("disables New Source at the quota limit", () => {
    hookState.sources = [source(), source({ id: "s2" }), source({ id: "s3" }), source({ id: "s4" })];
    hookState.atLimit = true;
    view();
    expect(screen.getByRole("button", { name: /New Source/i })).toBeDisabled();
  });

  it("does not display internal infrastructure identifiers", () => {
    hookState.sources = [source()];
    view();
    expect(screen.queryByText(/src_abc123/)).not.toBeInTheDocument();
  });
});
