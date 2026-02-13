import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const JoinSession = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sessionId, setSessionId] = useState(searchParams.get("session") || "");
  const [pin, setPin] = useState(searchParams.get("pin") || "");

  const handleJoin = () => {
    if (sessionId) navigate(`/session/${sessionId}`);
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
            className="bg-muted/30 border-border/30 text-foreground placeholder:text-muted-foreground/50"
          />
        </div>
        <Button onClick={handleJoin} className="w-full gap-2">
          <LogIn className="h-4 w-4" /> Join
        </Button>
      </div>
    </div>
  );
};

export default JoinSession;
