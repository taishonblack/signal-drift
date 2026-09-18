// Endpoint availability revalidation — the Create/Configure "In use" hint
// must stay truthful and fresh without any user action.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { EndpointAvailability } from "@/lib/session-lease";

const checkMock = vi.fn<(host: string, port: number) => Promise<EndpointAvailability>>();

vi.mock("@/lib/session-lease", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session-lease")>();
  return { ...actual, checkEndpointAvailability: (...args: [string, number]) => checkMock(...args) };
});

import { useEndpointAvailability, ENDPOINT_REVALIDATE_MS } from "@/hooks/use-endpoint-availability";

const available: EndpointAvailability = { available: true, reason: "available" };
const inUse: EndpointAvailability = { available: false, reason: "in_use" };
const unknown: EndpointAvailability = { available: true, reason: "unknown" };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useEndpointAvailability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    checkMock.mockReset();
    checkMock.mockResolvedValue(available);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("initial available endpoint → not busy", async () => {
    checkMock.mockResolvedValue(available);
    const { result } = renderHook(() => useEndpointAvailability("134.209.119.136", "8000"));
    await advance(500);
    expect(checkMock).toHaveBeenCalledWith("134.209.119.136", 8000);
    expect(result.current).toBe(false);
  });

  it("initial occupied endpoint → busy", async () => {
    checkMock.mockResolvedValue(inUse);
    const { result } = renderHook(() => useEndpointAvailability("134.209.119.136", "8000"));
    await advance(500);
    expect(result.current).toBe(true);
  });

  it("occupied → server later reports available → warning clears automatically", async () => {
    checkMock.mockResolvedValueOnce(inUse).mockResolvedValue(available);
    const { result } = renderHook(() => useEndpointAvailability("134.209.119.136", "8000"));
    await advance(500);
    expect(result.current).toBe(true);
    await advance(ENDPOINT_REVALIDATE_MS);
    expect(checkMock).toHaveBeenCalledTimes(2);
    expect(result.current).toBe(false);
  });

  it("available → server later reports occupied → warning appears automatically", async () => {
    checkMock.mockResolvedValueOnce(available).mockResolvedValue(inUse);
    const { result } = renderHook(() => useEndpointAvailability("134.209.119.136", "8000"));
    await advance(500);
    expect(result.current).toBe(false);
    await advance(ENDPOINT_REVALIDATE_MS);
    expect(result.current).toBe(true);
  });

  it("regaining visibility revalidates stale state", async () => {
    checkMock.mockResolvedValueOnce(inUse).mockResolvedValue(available);
    const { result } = renderHook(() => useEndpointAvailability("134.209.119.136", "8000"));
    await advance(500);
    expect(result.current).toBe(true);

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(checkMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
  });

  it("window focus revalidates stale state", async () => {
    checkMock.mockResolvedValueOnce(available).mockResolvedValue(inUse);
    const { result } = renderHook(() => useEndpointAvailability("134.209.119.136", "8000"));
    await advance(500);
    expect(result.current).toBe(false);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(checkMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });

  it("old in-flight result cannot overwrite a newer host/port result", async () => {
    const stale = deferred<EndpointAvailability>();
    checkMock.mockImplementation((host: string) =>
      host === "10.0.0.1" ? stale.promise : Promise.resolve(inUse),
    );

    const { result, rerender } = renderHook(
      ({ host, port }: { host: string; port: string }) => useEndpointAvailability(host, port),
      { initialProps: { host: "10.0.0.1", port: "8000" } },
    );
    await advance(500);
    expect(checkMock).toHaveBeenCalledWith("10.0.0.1", 8000);

    // Engineer changes the endpoint while the first request is in flight.
    rerender({ host: "10.0.0.2", port: "8000" });
    await advance(500);
    expect(checkMock).toHaveBeenCalledWith("10.0.0.2", 8000);
    expect(result.current).toBe(true);

    // The stale response for the old endpoint resolves late and must be ignored.
    await act(async () => {
      stale.resolve(available);
      await stale.promise;
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
  });

  it("RPC error ('unknown') never becomes 'in use' and leaves prior state untouched", async () => {
    checkMock.mockResolvedValueOnce(available).mockResolvedValue(unknown);
    const { result } = renderHook(() => useEndpointAvailability("134.209.119.136", "8000"));
    await advance(500);
    expect(result.current).toBe(false);
    await advance(ENDPOINT_REVALIDATE_MS * 2);
    expect(result.current).toBe(false);

    // And an unknown after a genuine in_use must not clear the warning silently.
    checkMock.mockReset();
    checkMock.mockResolvedValueOnce(inUse).mockResolvedValue(unknown);
    const second = renderHook(() => useEndpointAvailability("134.209.119.136", "8000"));
    await advance(500);
    expect(second.result.current).toBe(true);
    await advance(ENDPOINT_REVALIDATE_MS);
    expect(second.result.current).toBe(true);
  });

  it("invalid endpoint never polls and never warns", async () => {
    const { result } = renderHook(() => useEndpointAvailability("", ""));
    await advance(ENDPOINT_REVALIDATE_MS * 3);
    expect(checkMock).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it("unmount clears interval and listeners — no further checks", async () => {
    checkMock.mockResolvedValue(available);
    const { unmount } = renderHook(() => useEndpointAvailability("134.209.119.136", "8000"));
    await advance(500);
    expect(checkMock).toHaveBeenCalledTimes(1);

    unmount();
    await advance(ENDPOINT_REVALIDATE_MS * 5);
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(checkMock).toHaveBeenCalledTimes(1);
  });
});
