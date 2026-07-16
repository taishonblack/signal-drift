import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LogIn, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ensureIdentity } from "@/lib/identity";
import {
  joinSessionRemote,
  hydrateMemberSessions,
  upsertLocalStub,
  type JoinRemoteResult,
} from "@/lib/sessions-remote";
import { getCurrentUserRef, joinSession } from "@/lib/session-store";
import { toast } from "@/components/ui/sonner";
import JoinConfirmDialog from "@/components/session/JoinConfirmDialog";

const JoinSession = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessionId, setSessionId] = useState(searchParams.get("session") || "");
  const [pin, setPin] = useState(searchParams.get("pin") || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<JoinRemoteResult | null>(null);

  const handleVerify = async () => {
    if (!sessionId || !pin) {
      setError("Enter both a Session ID and a PIN.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      ensureIdentity();
      const result = await joinSessionRemote(sessionId.trim(), pin.trim());
      setPending(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not join session.";
      setError(msg);
      toast(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    if (!pending) return;
    const self = getCurrentUserRef();
    try {
      if (pending.granted) {
        await hydrateMemberSessions();
      } else {
        upsertLocalStub(pending.session, self);
      }
      joinSession(pending.session.id, self);
      const id = pending.session.id;
      setPending(null);
      navigate(`/session/${id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not enter session.";
      toast(msg);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-8 pt-12">
      <div className="text-center">
        <h1 className="text-xl font-semibold text-foreground">Join Session</h1>
        <p className="text-sm text-muted-foreground">Enter a session ID and PIN to view streams</p>
      </div>

      <div className="mako-glass rounded-lg p-6 space-y-4">
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Session ID</label>
          <Input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="sess-001"
            disabled={busy}
            className="bg-muted/30 border-border/30 text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">PIN</label>
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="1234"
            maxLength={6}
            disabled={busy}
            className="bg-muted/30 border-border/30 text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        <Button onClick={handleVerify} disabled={busy} className="w-full gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {busy ? "Verifying…" : "Join"}
        </Button>
        <p className="text-[11px] text-muted-foreground/70 text-center">
          Not signed in? You'll join as a Temporary Operator. Sign in later to
          keep the session in your history.
        </p>
      </div>

      <JoinConfirmDialog
        summary={pending?.session ?? null}
        granted={!!pending?.granted}
        onCancel={() => setPending(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
};

export default JoinSession;
