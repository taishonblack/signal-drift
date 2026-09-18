import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FieldGuidance from "@/components/session/FieldGuidance";

const Harness = () => {
  const [open, setOpen] = useState(false);
  return (
    <FieldGuidance
      title="Session name"
      body="Signed-in sessions appear in Recent Sessions."
      open={open}
      onOpenChange={setOpen}
    />
  );
};

describe("FieldGuidance", () => {
  it("has an accessible trigger and opens from keyboard focus", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "About session name" });
    expect(trigger).toBeInTheDocument();

    fireEvent.focus(trigger);
    expect(await screen.findByText("Signed-in sessions appear in Recent Sessions.")).toBeVisible();
  });

  it("closes with Escape", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "About session name" }));
    expect(await screen.findByText("Signed-in sessions appear in Recent Sessions.")).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByText("Signed-in sessions appear in Recent Sessions.")).not.toBeInTheDocument();
    });
  });
});