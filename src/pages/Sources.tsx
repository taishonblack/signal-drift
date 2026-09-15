import { useState } from "react";
import { Plus, Radio, Trash2, Pencil, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import GatedEmptyState from "@/components/GatedEmptyState";
import { useAuth } from "@/hooks/useAuth";
import {
  useMySources,
  MAX_ACTIVE_SOURCES,
  RECEIVE_DESTINATION,
  lifecycleLabel,
  connectionLabel,
  type MySource,
} from "@/hooks/use-my-sources";

const NAME_MAX = 64;

/** Same shape the server enforces: printable, trimmed, non-empty. */
function validateName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < 1 || name.length > NAME_MAX) return null;
  if (!/^[\w\s.\-()]+$/.test(name)) return null;
  return name;
}

const StatusDot = ({ tone }: { tone: "ready" | "pending" | "error" }) => (
  <span
    className={
      "inline-block h-1.5 w-1.5 rounded-full shrink-0 " +
      (tone === "ready"
        ? "bg-primary"
        : tone === "error"
          ? "bg-destructive"
          : "bg-muted-foreground/50")
    }
  />
);

const Sources = () => {
  const { user, loading: authLoading } = useAuth();
  const isMember = !!user;
  const {
    sources,
    loading,
    error,
    refresh,
    createSource,
    renameSource,
    deleteSource,
    atLimit,
  } = useMySources(isMember);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const [renaming, setRenaming] = useState<MySource | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [deleting, setDeleting] = useState<MySource | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const handleCreate = async () => {
    const name = validateName(newName);
    if (!name) {
      toast.error("Give the source a short name (letters, numbers, spaces).");
      return;
    }
    setCreating(true);
    const res = await createSource(name);
    setCreating(false);
    if (res.ok) {
      setCreateOpen(false);
      setNewName("");
      toast.success(
        res.source.port
          ? `${res.source.name} is ready on port ${res.source.port}.`
          : `${res.source.name} is ready.`,
      );
      return;
    }
    const reason = "reason" in res ? res.reason : "";
    if (reason === "limit") {
      toast.error(`You already have ${MAX_ACTIVE_SOURCES} sources. Delete one to add another.`);
    } else if (reason === "invalid_name") {
      toast.error("That name isn't allowed. Try letters, numbers and spaces.");
    } else {
      toast.error("Couldn't create the source. Please try again.");
    }
  };

  const handleRename = async () => {
    if (!renaming) return;
    const name = validateName(renameValue);
    if (!name) {
      toast.error("Give the source a short name (letters, numbers, spaces).");
      return;
    }
    setSavingName(true);
    const ok = await renameSource(renaming.id, name);
    setSavingName(false);
    if (ok) {
      setRenaming(null);
      toast.success("Name updated.");
    } else {
      toast.error("Couldn't rename that source.");
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    const res = await deleteSource(deleting);
    setDeletingBusy(false);
    if (res.ok) {
      setDeleting(null);
      toast.success("Source deleted.");
      return;
    }
    const reason = "reason" in res ? res.reason : "";
    if (reason === "source_in_use") {
      toast.error("That source is attached to a live session. End the session first.");
    } else if (reason === "not_ready") {
      toast.error("That source is still being set up. Try again shortly.");
    } else {
      toast.error("Couldn't delete that source. Please try again.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">My Sources</h1>
          <p className="text-sm text-muted-foreground">
            Your private MAKO Receive destinations. Only you can see them.
          </p>
        </div>
        {isMember && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void refresh()}
              aria-label="Refresh sources"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="gap-2"
              disabled={atLimit}
              title={atLimit ? `Limit of ${MAX_ACTIVE_SOURCES} sources reached` : undefined}
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" /> New Source
            </Button>
          </div>
        )}
      </div>

      {!isMember && !authLoading && (
        <GatedEmptyState
          title="Sign in to keep your own sources"
          body="Sources are reusable encoder destinations tied to your account. Sign in to create up to four and use them in any session."
          icon={<Radio className="h-5 w-5" />}
        />
      )}

      {isMember && (
        <>
          <p className="text-xs text-muted-foreground/70">
            {sources.length} of {MAX_ACTIVE_SOURCES} sources used
          </p>

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your sources…
            </div>
          )}

          {!loading && error && (
            <div className="mako-glass rounded-lg p-5 text-sm text-destructive">{error}</div>
          )}

          {!loading && !error && sources.length === 0 && (
            <div className="mako-glass rounded-lg border border-dashed border-border/30 p-6 text-center space-y-2">
              <div className="flex justify-center text-muted-foreground/60">
                <Radio className="h-5 w-5" />
              </div>
              <p className="text-sm text-foreground">No sources yet</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Create a source to get a dedicated destination your encoder can send to. You can
                reuse it in every session.
              </p>
            </div>
          )}

          {!loading && !error && sources.length > 0 && (
            <ul className="space-y-2">
              {sources.map((s) => {
                const ready = s.lifecycleStatus === "ready";
                const failed = s.lifecycleStatus === "error";
                return (
                  <li key={s.id} className="mako-glass-solid rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <StatusDot tone={failed ? "error" : ready ? "ready" : "pending"} />
                          <span className="text-sm text-foreground truncate">{s.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {lifecycleLabel(s.lifecycleStatus)} · {connectionLabel(s.connectionStatus)}
                        </p>
                        {ready && s.srtPort && (
                          <p className="text-[11px] text-muted-foreground/70 font-mono truncate">
                            {RECEIVE_DESTINATION} : {s.srtPort}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Rename ${s.name}`}
                          onClick={() => {
                            setRenaming(s);
                            setRenameValue(s.name);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${s.name}`}
                          onClick={() => setDeleting(s)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {/* ─── New source ─── */}
      <Dialog open={createOpen} onOpenChange={(o) => !creating && setCreateOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Source</DialogTitle>
            <DialogDescription>
              We'll set up a dedicated destination for your encoder and show you the port.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="source-name">Name</Label>
            <Input
              id="source-name"
              value={newName}
              maxLength={NAME_MAX}
              placeholder="Camera A"
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={creating} className="gap-2">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {creating ? "Setting up…" : "Create Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Rename ─── */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && !savingName && setRenaming(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Source</DialogTitle>
            <DialogDescription>
              Only the display name changes. The encoder destination stays exactly the same.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-source">Name</Label>
            <Input
              id="rename-source"
              value={renameValue}
              maxLength={NAME_MAX}
              onChange={(e) => setRenameValue(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)} disabled={savingName}>
              Cancel
            </Button>
            <Button onClick={() => void handleRename()} disabled={savingName}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete ─── */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && !deletingBusy && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              The encoder destination and its port are released. Anything currently sending to it
              will stop. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deletingBusy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={deletingBusy}
              className="gap-2"
            >
              {deletingBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {deletingBusy ? "Deleting…" : "Delete Source"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Sources;
