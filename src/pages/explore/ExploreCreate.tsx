import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DemoShell from "@/components/demo/DemoShell";
import { useDemo, trackDemoEvent } from "@/contexts/DemoModeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, BookMarked, CheckCircle2, Loader2, Play } from "lucide-react";

const DURATIONS = ["30 minutes", "1 hour", "2 hours", "4 hours"];
const LOADING_STEPS = [
  "Initializing demo workspace…",
  "Connecting sample sources…",
  "Starting Quinn analysis…",
  "Monitoring ready.",
];

export default function ExploreCreate() {
  const { config, updateConfig, updateSource, startDemo } = useDemo();
  const navigate = useNavigate();
  const [active, setActive] = useState(config.sources[0]?.id ?? "");
  const [testing, setTesting] = useState<string | null>(null);
  const [tested, setTested] = useState<Record<string, boolean>>({});
  const [addressBook, setAddressBook] = useState(false);
  const [loadingStep, setLoadingStep] = useState<number | null>(null);

  useEffect(() => {
    document.title = "Demo — Create Session | MAKO";
  }, []);

  useEffect(() => {
    if (loadingStep === null) return;
    if (loadingStep >= LOADING_STEPS.length) {
      startDemo();
      navigate("/explore/session");
      return;
    }
    const t = window.setTimeout(() => setLoadingStep((s) => (s ?? 0) + 1), 550);
    return () => window.clearTimeout(t);
  }, [loadingStep, navigate, startDemo]);

  if (loadingStep !== null) {
    return (
      <DemoShell stage="configure">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-24 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary motion-reduce:animate-none" />
          <p aria-live="polite" className="text-sm text-muted-foreground">
            {LOADING_STEPS[Math.min(loadingStep, LOADING_STEPS.length - 1)]}
          </p>
        </div>
      </DemoShell>
    );
  }

  return (
    <DemoShell stage="configure">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-lg font-medium text-foreground">Create Demo Session</h1>
          <p className="text-xs text-muted-foreground">
            Sample configuration — nothing here reaches a real SRT endpoint.
          </p>
        </header>

        <section className="grid gap-4 rounded-lg border border-border/20 bg-card/30 p-4 backdrop-blur-[18px] md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="demo-name" className="text-xs">Session Name</Label>
            <Input
              id="demo-name"
              value={config.name}
              onChange={(e) => updateConfig({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="demo-purpose" className="text-xs">Purpose</Label>
            <Input id="demo-purpose" value={config.purpose} onChange={(e) => updateConfig({ purpose: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="demo-tz" className="text-xs">Event Time Zone</Label>
            <Input id="demo-tz" value={config.timeZone} onChange={(e) => updateConfig({ timeZone: e.target.value })} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Session Duration</Label>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={config.durationLabel === d ? "secondary" : "outline"}
                  className="h-7 text-[11px]"
                  onClick={() => updateConfig({ durationLabel: d })}
                >
                  {d}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border/20 bg-card/30 p-4 backdrop-blur-[18px]">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-foreground">Sources</h2>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 gap-1 text-[11px]"
              onClick={() => setAddressBook((v) => !v)}
            >
              <BookMarked className="h-3 w-3" /> Address Book
            </Button>
          </div>

          {addressBook && (
            <div className="mb-3 rounded border border-border/20 bg-muted/10 p-3">
              <p className="mb-2 text-[11px] text-muted-foreground">
                Saved demo endpoints (preview only)
              </p>
              <ul className="space-y-1 text-[11px] font-mono text-muted-foreground/80">
                {config.sources.map((s) => (
                  <li key={s.id} className="truncate">{s.address}:{s.port}</li>
                ))}
              </ul>
            </div>
          )}

          <Tabs value={active} onValueChange={setActive}>
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/20">
              {config.sources.map((s) => (
                <TabsTrigger key={s.id} value={s.id} className="text-[11px]">
                  Source {s.slot}
                </TabsTrigger>
              ))}
            </TabsList>

            {config.sources.map((s) => (
              <TabsContent key={s.id} value={s.id} className="mt-3 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${s.id}-name`} className="text-xs">Friendly Name</Label>
                    <Input
                      id={`${s.id}-name`}
                      value={s.name}
                      onChange={(e) => updateSource(s.id, { name: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`${s.id}-enabled`}
                        checked={s.enabled}
                        onCheckedChange={(v) => updateSource(s.id, { enabled: v })}
                      />
                      <Label htmlFor={`${s.id}-enabled`} className="text-xs">Enabled</Label>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Demo Address</Label>
                    <Input readOnly value={s.address} className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Demo Port</Label>
                    <Input readOnly value={s.port} className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor={`${s.id}-notes`} className="text-xs">Notes</Label>
                    <Textarea
                      id={`${s.id}-notes`}
                      rows={2}
                      value={s.notes}
                      onChange={(e) => updateSource(s.id, { notes: e.target.value })}
                    />
                  </div>
                </div>

                <Accordion type="single" collapsible>
                  <AccordionItem value="advanced" className="border-border/20">
                    <AccordionTrigger className="text-xs">Advanced settings</AccordionTrigger>
                    <AccordionContent className="space-y-1 text-[11px] text-muted-foreground">
                      <p>Latency: 800 ms · Passphrase: demo · Stream ID: {s.address.replace("demo://", "")}</p>
                      <p>Encryption: AES-128 (simulated) · Reconnect: automatic</p>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-[11px]"
                    disabled={testing === s.id}
                    onClick={() => {
                      setTesting(s.id);
                      window.setTimeout(() => {
                        setTesting(null);
                        setTested((p) => ({ ...p, [s.id]: true }));
                      }, 700);
                    }}
                  >
                    {testing === s.id ? (
                      <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                    ) : (
                      <Play className="h-3 w-3" />
                    )}
                    Test Connection
                  </Button>
                </div>

                {tested[s.id] && (
                  <div
                    className={`rounded border p-3 ${
                      s.testResult.ok
                        ? "border-primary/30 bg-primary/5"
                        : "border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/5"
                    }`}
                  >
                    <p
                      className={`flex items-center gap-1.5 text-xs font-medium ${
                        s.testResult.ok ? "text-primary" : "text-[hsl(var(--warning))]"
                      }`}
                    >
                      {s.testResult.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      )}
                      {s.testResult.headline}
                    </p>
                    <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      {s.testResult.lines.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </section>

        <div className="flex justify-end">
          <Button
            size="lg"
            className="gap-2"
            onClick={() => {
              trackDemoEvent("demo_session_started");
              setLoadingStep(0);
            }}
          >
            Start Demo Session
          </Button>
        </div>
      </div>
    </DemoShell>
  );
}
