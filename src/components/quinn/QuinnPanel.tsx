import { useState, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Bot, Send, Bell, Loader2 } from "lucide-react";
import IncidentList from "@/components/quinn/IncidentList";
import IncidentDetailDrawer from "@/components/quinn/IncidentDetailDrawer";
import {
  type Incident,
  getIncidentsForSession,
  getIncidents,
  getEvents,
  getUnackedAlertCountForSession,
  getCurrentUser,
  isHost as checkIsHost,
} from "@/lib/quinn-store";
import { useQuinnSimulator } from "@/hooks/use-quinn-simulator";
import { toast } from "@/hooks/use-toast";

const QUINN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quinn-chat`;

interface QuinnMessage {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  sessionId?: string;
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
    { role: "assistant", content: sessionId ? "Quinn is watching this session. Ask me about incidents, line health, or say \"show incident log.\"" : "Quinn Ops online. Ask about active sessions, incidents, or system health." },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const alertCount = sessionId ? getUnackedAlertCountForSession(sessionId, user.id) : 0;
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    setIncidents(sessionId ? getIncidentsForSession(sessionId) : getIncidents());
  }, [sessionId]);

  useQuinnSimulator(refresh);

  const buildContext = () => {
    const inc = sessionId ? getIncidentsForSession(sessionId) : getIncidents();
    const allEvents = getEvents();
    const relevantEvents = sessionId
      ? allEvents.filter((e) => e.sessionId === sessionId)
      : allEvents.slice(0, 30);
    return {
      incidents: inc.slice(0, 20),
      events: relevantEvents.slice(0, 40),
      sessionName: sessionId ? inc[0]?.sessionName : undefined,
    };
  };

  const send = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: QuinnMessage = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    // Build chat history for API (skip system greeting)
    const apiMessages = newMessages
      .slice(1)
      .map((m) => ({ role: m.role, content: m.content }));

    let assistantSoFar = "";

    try {
      const resp = await fetch(QUINN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: apiMessages,
          context: buildContext(),
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        toast({ title: "Quinn error", description: err.error || `HTTP ${resp.status}`, variant: "destructive" });
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamDone = false;

      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && prev.length > newMessages.length) {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      };

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split("\n")) {
          if (!raw) continue;
          if (raw.endsWith("\r")) raw = raw.slice(0, -1);
          if (raw.startsWith(":") || raw.trim() === "") continue;
          if (!raw.startsWith("data: ")) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error("Quinn stream error:", e);
      toast({ title: "Quinn unavailable", description: "Could not reach Quinn AI. Try again.", variant: "destructive" });
    }

    setIsLoading(false);
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
            <div className="space-y-3 py-2" ref={scrollRef}>
              {messages.map((m, i) => (
                <div key={i} className={`text-xs leading-relaxed ${m.role === "assistant" ? "text-muted-foreground" : "text-foreground"}`}>
                  <span className={`font-medium ${m.role === "assistant" ? "text-primary" : "text-foreground"}`}>
                    {m.role === "assistant" ? "Quinn" : "You"}:
                  </span>{" "}
                  {m.role === "assistant" ? (
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <span className="inline">{children}</span>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        ul: ({ children }) => <ul className="list-disc list-inside mt-1 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside mt-1 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li className="text-xs">{children}</li>,
                        code: ({ children, className }) => {
                          const isBlock = className?.includes("language-");
                          return isBlock ? (
                            <pre className="mt-1 p-2 rounded bg-muted/30 overflow-x-auto text-[11px] font-mono text-foreground"><code>{children}</code></pre>
                          ) : (
                            <code className="px-1 py-0.5 rounded bg-muted/30 text-[11px] font-mono text-foreground">{children}</code>
                          );
                        },
                        h1: ({ children }) => <span className="font-semibold text-foreground block mt-1">{children}</span>,
                        h2: ({ children }) => <span className="font-semibold text-foreground block mt-1">{children}</span>,
                        h3: ({ children }) => <span className="font-semibold text-foreground block mt-1">{children}</span>,
                      }}
                    >
                      {m.content}
                    </ReactMarkdown>
                  ) : (
                    m.content
                  )}
                </div>
              ))}
              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex items-center gap-1.5 text-xs text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" /> Quinn is thinking…
                </div>
              )}
            </div>
          </ScrollArea>
          <div className="flex gap-1.5 mt-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask Quinn…"
              className="h-8 text-xs bg-muted/20 border-border/20"
              disabled={isLoading}
            />
            <Button size="icon" className="h-8 w-8 shrink-0" onClick={send} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
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
