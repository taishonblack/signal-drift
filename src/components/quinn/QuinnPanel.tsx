import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Bell, Zap, AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import type { QuinnIncident } from "@/hooks/use-quinn-incidents";

const CHAT_ENABLED = import.meta.env.VITE_ENABLE_QUINN_CHAT === "true";

interface Props {
  sessionId?: string;
  incidents?: QuinnIncident[];
  onSelectIncident?: (id: string) => void;
}

type Filter = "all" | "critical" | "warning" | "open";

const severityBg: Record<QuinnIncident["severity"], string> = {
  warn: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  critical: "bg-destructive/15 text-destructive",
};

const statusBg: Record<QuinnIncident["status"], string> = {
  open: "bg-destructive/15 text-destructive",
  ack: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  resolved: "bg-primary/15 text-primary",
};

export default function QuinnPanel({ incidents = [], onSelectIncident }: Props) {
  const [filter, setFilter] = useState<Filter>("all");

  const openCount = useMemo(
    () => incidents.filter((i) => i.status !== "resolved").length,
    [incidents],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "critical":
        return incidents.filter((i) => i.severity === "critical");
      case "warning":
        return incidents.filter((i) => i.severity === "warn");
      case "open":
        return incidents.filter((i) => i.status !== "resolved");
      default:
        return incidents;
    }
  }, [incidents, filter]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/10">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-foreground">Quinn Ops</span>
        {openCount > 0 && (
          <Badge variant="destructive" className="ml-auto text-[10px] h-5 px-1.5 gap-1">
            <Bell className="h-3 w-3" /> {openCount}
          </Badge>
        )}
      </div>

      <Tabs value="incidents" className="flex-1 flex flex-col min-h-0">
        <TabsList className="h-8 bg-muted/20 mx-2 mt-2">
          <TabsTrigger value="incidents" className="text-[11px] h-6">Incidents</TabsTrigger>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <TabsTrigger
                    value="chat"
                    disabled
                    className="text-[11px] h-6 opacity-50 cursor-not-allowed"
                    aria-disabled
                  >
                    Chat · Coming later
                  </TabsTrigger>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-[11px]">
                {CHAT_ENABLED
                  ? "Quinn Chat is being finalized."
                  : "Quinn Chat is temporarily unavailable while incident monitoring is being finalized."}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TabsList>

        <TabsContent value="incidents" className="flex-1 min-h-0 px-2 pb-2 flex flex-col">
          <div className="flex items-center gap-1 py-2">
            {(["all", "critical", "warning", "open"] as Filter[]).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "secondary" : "ghost"}
                className="h-6 text-[10px] px-2 capitalize"
                onClick={() => setFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>
          <ScrollArea className="flex-1 min-h-0">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground/60 text-center py-6">No incidents.</p>
            ) : (
              <div className="space-y-1.5">
                {filtered.map((inc) => {
                  const SevIcon = inc.severity === "critical" ? Zap : AlertTriangle;
                  return (
                    <button
                      key={inc.id}
                      onClick={() => onSelectIncident?.(inc.id)}
                      className="w-full text-left p-2 rounded bg-muted/10 hover:bg-muted/20 border border-border/10 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Badge className={`${severityBg[inc.severity]} text-[10px] uppercase border-0 gap-1 inline-flex items-center`}>
                          <SevIcon className="h-3 w-3" /> {inc.severity === "warn" ? "warn" : "crit"}
                        </Badge>
                        <Badge className={`${statusBg[inc.status]} text-[10px] uppercase border-0`}>{inc.status}</Badge>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {new Date(inc.lastSeenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[11px] text-foreground/90 line-clamp-2">{inc.latestMessage}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{inc.sourceName}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
