import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Users, Circle, Crown, ShieldCheck, Hand, Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SessionViewer, SessionOwnershipRequest, OwnershipRequestKind } from "@/lib/session-store";
import {
  getSessionById,
  requestOwnership,
  resolveOwnershipRequest,
  cancelOwnershipRequest,
  getCurrentUserRef,
} from "@/lib/session-store";
import { cn } from "@/lib/utils";

interface Props {
  viewers: SessionViewer[];
  className?: string;
  align?: "start" | "center" | "end";
  triggerAs?: "chip" | "count";
  onClick?: (e: React.MouseEvent) => void;
  /** When provided, ownership request/approval UI is enabled. */
  sessionId?: string;
  currentUserId?: string;
  /** Called after any ownership-related mutation so the parent can refresh. */
  onChange?: () => void;
}

const initials = (name: string) =>
  name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

const ViewersPanel = ({
  viewers,
  className,
  align = "end",
  triggerAs = "chip",
  onClick,
  sessionId,
  currentUserId,
  onChange,
}: Props) => {
  const [choosingKind, setChoosingKind] = useState(false);
  const count = viewers.length;

  // Live-read requests/owner from store so approvals refresh immediately.
  const record = sessionId ? getSessionById(sessionId) : undefined;
  const ownerId = record?.ownerUserId ?? record?.hostUserId;
  const allRequests: SessionOwnershipRequest[] = record?.ownershipRequests ?? [];
  const pending: SessionOwnershipRequest[] = allRequests.filter((r) => r.status === "pending");
  const latestRequestFor = (userId: string): SessionOwnershipRequest | undefined => {
    const forUser = allRequests.filter((r) => r.userId === userId);
    if (forUser.length === 0) return undefined;
    return [...forUser].sort((a, b) => (a.requestedAt < b.requestedAt ? 1 : -1))[0];
  };

  const me = viewers.find((v) => v.userId === currentUserId);
  const isOwner = !!currentUserId && ownerId === currentUserId;
  const isCoOwner = !!me?.isCoOwner;
  const hasPending = !!currentUserId && pending.some((r) => r.userId === currentUserId);
  const canRequest =
    !!sessionId && !!currentUserId && !!me && !isOwner && !isCoOwner && !hasPending;

  const handleRequest = (kind: OwnershipRequestKind) => {
    if (!sessionId) return;
    const user = currentUserId
      ? { id: currentUserId, name: me?.name ?? getCurrentUserRef().name }
      : getCurrentUserRef();
    requestOwnership(sessionId, user, kind);
    setChoosingKind(false);
    toast.success(
      kind === "full"
        ? "Requested full ownership"
        : "Requested co-ownership",
      { description: "The session owner will be notified." }
    );
    onChange?.();
  };

  const handleResolve = (reqId: string, decision: "approve" | "deny") => {
    if (!sessionId || !currentUserId) return;
    const approver = { id: currentUserId, name: me?.name ?? getCurrentUserRef().name };
    const req = pending.find((r) => r.id === reqId);
    resolveOwnershipRequest(sessionId, reqId, decision, approver);
    if (req) {
      toast.success(
        decision === "approve"
          ? req.kind === "full"
            ? `Transferred ownership to ${req.userName}`
            : `${req.userName} is now a co-owner`
          : `Denied ${req.userName}'s request`
      );
    }
    onChange?.();
  };

  const handleCancel = (reqId: string) => {
    if (!sessionId || !currentUserId) return;
    const actor = { id: currentUserId, name: me?.name ?? getCurrentUserRef().name };
    cancelOwnershipRequest(sessionId, reqId, actor);
    toast.success("Ownership request cancelled");
    onChange?.();
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
          className={cn(
            "inline-flex items-center gap-1.5 text-xs rounded-md transition-colors relative",
            triggerAs === "chip"
              ? "px-2 py-1 border border-border/30 bg-muted/20 hover:bg-muted/40 text-foreground/80"
              : "text-muted-foreground hover:text-foreground",
            className
          )}
        >
          <Users className="h-3 w-3" />
          <span className="tabular-nums">{count}</span>
          <span>{count === 1 ? "Viewer" : "Viewers"}</span>
          {isOwner && pending.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-[hsl(var(--warning))] text-[9px] font-bold text-background">
              {pending.length}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="mako-glass-solid border-border/30 w-72 p-0">
        {/* Pending requests — owner only */}
        {isOwner && pending.length > 0 && (
          <div className="border-b border-border/20 bg-[hsl(var(--warning))]/5">
            <div className="px-3 py-2">
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--warning))] font-semibold">
                Ownership Requests
              </p>
            </div>
            <div className="pb-1">
              {pending.map((r) => (
                <div key={r.id} className="px-3 py-2 border-t border-border/10 first:border-t-0">
                  <div className="flex items-start gap-2">
                    <Hand className="h-3 w-3 mt-0.5 text-[hsl(var(--warning))] shrink-0" />
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="text-foreground truncate">
                        <span className="font-medium">{r.userName}</span>{" "}
                        <span className="text-muted-foreground">
                          requested {r.kind === "full" ? "full ownership" : "co-ownership"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-2 pl-5">
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px] gap-1"
                      onClick={() => handleResolve(r.id, "approve")}
                    >
                      <Check className="h-3 w-3" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
                      onClick={() => handleResolve(r.id, "deny")}
                    >
                      <X className="h-3 w-3" /> Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-3 py-2 border-b border-border/20">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Currently Watching
          </p>
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {viewers.length === 0 && (
            <p className="px-3 py-3 text-xs text-muted-foreground">No viewers yet.</p>
          )}
          {viewers.map((v) => {
            const latest = latestRequestFor(v.userId);
            const isSelfRow = v.userId === currentUserId;
            const showStatus =
              !!latest && !v.isOwner && !(latest.status === "approved" && latest.kind === "co" && v.isCoOwner === false);
            return (
              <div key={v.userId} className="flex items-start gap-2 px-3 py-2 hover:bg-muted/20">
                <div className="h-7 w-7 rounded-full bg-primary/15 border border-primary/25 text-primary text-[10px] font-semibold flex items-center justify-center shrink-0">
                  {initials(v.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span className="text-xs font-medium text-foreground truncate">{v.name}</span>
                    {v.isOwner && (
                      <span className="text-[9px] uppercase font-semibold text-primary bg-primary/10 border border-primary/25 rounded px-1 py-[1px] shrink-0 inline-flex items-center gap-0.5">
                        <Crown className="h-2.5 w-2.5" /> Owner
                      </span>
                    )}
                    {!v.isOwner && v.isCoOwner && (
                      <span className="text-[9px] uppercase font-semibold text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/25 rounded px-1 py-[1px] shrink-0 inline-flex items-center gap-0.5">
                        <ShieldCheck className="h-2.5 w-2.5" /> Co-owner
                      </span>
                    )}
                    {showStatus && latest.status === "pending" && (
                      <span
                        title={`Pending ${latest.kind === "full" ? "full ownership" : "co-ownership"} request`}
                        className="text-[9px] uppercase font-semibold text-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 border border-[hsl(var(--warning))]/25 rounded px-1 py-[1px] shrink-0 inline-flex items-center gap-0.5"
                      >
                        <Clock className="h-2.5 w-2.5" /> Pending
                      </span>
                    )}
                    {showStatus && latest.status === "approved" && !v.isCoOwner && (
                      <span className="text-[9px] uppercase font-semibold text-[hsl(var(--success,142_71%_45%))] bg-emerald-500/10 border border-emerald-500/25 rounded px-1 py-[1px] shrink-0 inline-flex items-center gap-0.5">
                        <Check className="h-2.5 w-2.5" /> Approved
                      </span>
                    )}
                    {showStatus && latest.status === "denied" && (
                      <span className="text-[9px] uppercase font-semibold text-muted-foreground bg-muted/30 border border-border/30 rounded px-1 py-[1px] shrink-0 inline-flex items-center gap-0.5">
                        <X className="h-2.5 w-2.5" /> Denied
                      </span>
                    )}
                    {isSelfRow && latest?.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => handleCancel(latest.id)}
                        className="text-[9px] uppercase font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  {v.focus && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Circle className="h-1.5 w-1.5 fill-primary text-primary" />
                      <span className="text-[10px] text-muted-foreground truncate">
                        focused on {v.focus}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Request ownership — non-owner viewers */}
        {sessionId && me && !isOwner && (
          <div className="border-t border-border/20 p-2">
            {isCoOwner ? (
              <div className="text-[10px] text-muted-foreground px-2 py-1 inline-flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-[hsl(var(--warning))]" />
                You have co-owner configuration access.
              </div>
            ) : hasPending ? (
              <div className="text-[10px] text-muted-foreground px-2 py-1">
                Request pending owner approval…
              </div>
            ) : !choosingKind ? (
              <Button
                size="sm"
                variant="outline"
                className="w-full h-7 text-[11px] gap-1.5 border-border/30"
                onClick={() => setChoosingKind(true)}
              >
                <Hand className="h-3 w-3" /> Request ownership
              </Button>
            ) : (
              <div className="flex flex-col gap-1.5">
                <p className="text-[10px] text-muted-foreground px-1">
                  What would you like to request?
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] gap-1.5 border-border/30 justify-start"
                  onClick={() => handleRequest("co")}
                >
                  <ShieldCheck className="h-3 w-3 text-[hsl(var(--warning))]" />
                  Co-ownership
                  <span className="text-muted-foreground ml-auto text-[9px]">
                    edit alongside owner
                  </span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px] gap-1.5 border-border/30 justify-start"
                  onClick={() => handleRequest("full")}
                >
                  <Crown className="h-3 w-3 text-primary" />
                  Full ownership
                  <span className="text-muted-foreground ml-auto text-[9px]">
                    transfer control
                  </span>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[10px] text-muted-foreground"
                  onClick={() => setChoosingKind(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default ViewersPanel;
