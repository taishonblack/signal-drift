import { useState, useCallback, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Bell } from "lucide-react";
import IncidentList from "@/components/quinn/IncidentList";
import IncidentDetailDrawer from "@/components/quinn/IncidentDetailDrawer";
import {
  type Incident,
  getIncidentsForSession,
  getIncidents,
  getUnackedAlertCountForSession,
  getCurrentUser,
  isHost as checkIsHost,
} from "@/lib/quinn-store";
import { useQuinnSimulator } from "@/hooks/use-quinn-simulator";

interface QuinnMessage {
  role: "user" | "quinn";
  content: string;
}

// Mock Quinn responses based on incident data
function mockQuinnResponse(query: string, incidents: Incident[]): string {
  const q = query.toLowerCase();
  const open = incidents.filter((i) => i.status === "open");
  const critical = incidents.filter((i) => i.severity === "critical" && i.status !== "resolved");

  if (q.includes("unstable") || q.includes("worst") || q.includes("critical")) {
    if (critical.length === 0) return "All sessions are stable. No critical incidents at this time.";
    const c = critical[0];
    return `⚠️ Most critical: **${c.sessionName}** — ${c.summary} (Incident ${c.id}, started ${new Date(c.startedAtUtc).toLocaleTimeString()})`;
  }

  if (q.includes("incident") || q.includes("log") || q.includes("show")) {
    if (open.length === 0) return "No open incidents. All systems nominal. ✅";
    return `Currently **${open.length} open incident(s)**:\n${open.map((i) => `• ${i.severity.toUpperCase()}: ${i.summary} (${i.primaryLineLabel})`).join("\n")}`;
  }

  if (q.includes("status") || q.includes("summary") || q.includes("how")) {
    const active = incidents.filter((i) => i.status !== "resolved");
    return `Session health: **${active.length}** active incident(s), **${critical.length}** critical. ${critical.length === 0 ? "Systems looking good." : "Recommend reviewing critical alerts."}`;
  }

  return `I found **${incidents.length}** incidents in scope. ${open.length} open, ${critical.length} critical. Ask me about specific incidents, line issues, or "show incident log" for details.`;
}

interface Props {
  sessionId?: string; // If provided, scoped to session; otherwise global
  sessionHostUserId?: string;
}

export default function QuinnPanel({ sessionId, sessionHostUserId }: Props) {
  const user = getCurrentUser();
  const isHostUser = sessionHostUserId ? checkIsHost(sessionHostUserId) : false;

  const [incidents, setIncidents] = useState<Incident[]>(() =>
    sessionId ? getIncidentsForSession(sessionId) : getIncidents()
  );
  const [selected, setSelected] = useState<Incident | null>(null);
  const [messages, setMessages] = useState<QuinnMessage[]>([
    { role: "quinn", content: sessionId ? "Quinn is watching this session. Ask me about incidents, line health, or say \"show incident log.\"" : "Quinn Ops online. Ask about active sessions, incidents, or system health." },
  ]);
  const [input, setInput] = useState("");
  const alertCount = sessionId ? getUnackedAlertCountForSession(sessionId, user.id) : 0;

  const refresh = useCallback(() => {
    setIncidents(sessionId ? getIncidentsForSession(sessionId) : getIncidents());
  }, [sessionId]);

  // Live simulation
  useQuinnSimulator(refresh);

  const send = () => {
    if (!input.trim()) return;
    const userMsg: QuinnMessage = { role: "user", content: input };
    const response = mockQuinnResponse(input, incidents);
    setMessages((prev) => [...prev, userMsg, { role: "quinn", content: response }]);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/10">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-foreground">Quinn{sessionId ? "" : " Ops"}</span>
        {isHostUser && alertCount > 0 && (
          <Badge variant="destructive" className="ml-auto text-[10px] h-5 px-1.5 gap-1">
            <Bell className="h-3 w-3" /> {alertCount}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="watchfeed" className="flex-1 flex flex-col min-h-0">
        <TabsList className="h-8 bg-muted/20 mx-2 mt-2">
          <TabsTrigger value="watchfeed" className="text-[11px] h-6">Incidents</TabsTrigger>
          <TabsTrigger value="chat" className="text-[11px] h-6">Chat</TabsTrigger>
        </TabsList>

        <TabsContent value="watchfeed" className="flex-1 min-h-0 px-2 pb-2">
          <ScrollArea className="h-full">
            <IncidentList incidents={incidents} onSelect={setSelected} />
          </ScrollArea>
        </TabsContent>

        <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 px-2 pb-2">
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-3 py-2">
              {messages.map((m, i) => (
                <div key={i} className={`text-xs leading-relaxed ${m.role === "quinn" ? "text-muted-foreground" : "text-foreground"}`}>
                  <span className={`font-medium ${m.role === "quinn" ? "text-primary" : "text-foreground"}`}>
                    {m.role === "quinn" ? "Quinn" : "You"}:
                  </span>{" "}
                  {m.content}
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex gap-1.5 mt-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask Quinn…"
              className="h-8 text-xs bg-muted/20 border-border/20"
            />
            <Button size="icon" className="h-8 w-8 shrink-0" onClick={send}>
              <Send className="h-3 w-3" />
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <IncidentDetailDrawer
        incident={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
        canManage={isHostUser || user.role === "ops"}
        onStatusChange={refresh}
      />
    </div>
  );
}
