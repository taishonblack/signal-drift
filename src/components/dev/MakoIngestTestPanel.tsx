import { useState } from "react";
import { Loader2, Plus, RefreshCw, Server, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface IngestSource {
  name?: string;
  source_id?: string;
  port?: number | string;
  output_path?: string;
  state?: string;
}

type LoadState = "idle" | "loading" | "success" | "auth_error" | "generic_error";
type CreateState = "idle" | "creating" | "success" | "auth_error" | "forbidden" | "generic_error";

function statusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null) {
    const e = error as { status?: number; context?: { status?: number } };
    return e.status ?? e.context?.status;
  }
  return undefined;
}

export function MakoIngestTestPanel() {
  const [state, setState] = useState<LoadState>("idle");
  const [sources, setSources] = useState<IngestSource[]>([]);
  const [sourceName, setSourceName] = useState("");
  const [createState, setCreateState] = useState<CreateState>("idle");
  const [created, setCreated] = useState<IngestSource | null>(null);

  const loadSources = async () => {
    setState("loading");
    setSources([]);

    try {
      const { data, error } = await supabase.functions.invoke("mako-ingest", {
        body: { action: "list_sources" },
      });

      if (error) {
        const status =
          typeof error === "object" && error !== null && "status" in error
            ? (error as { status?: number }).status
            : undefined;
        setState(status === 401 ? "auth_error" : "generic_error");
        return;
      }

      const parsed = Array.isArray(data) ? data : (data as { sources?: IngestSource[] })?.sources ?? [];
      setSources(parsed);
      setState("success");
    } catch {
      setState("generic_error");
    }
  };

  const createSource = async () => {
    const name = sourceName.trim();
    if (!name) return;

    setCreateState("creating");
    setCreated(null);

    try {
      const { data, error } = await supabase.functions.invoke("mako-ingest", {
        body: { action: "create_source", name },
      });

      if (error) {
        const status = statusOf(error);
        setCreateState(
          status === 401 ? "auth_error" : status === 403 ? "forbidden" : "generic_error"
        );
        return;
      }

      const source = ((data as { source?: IngestSource })?.source ?? data) as IngestSource;
      setCreated(source);
      setCreateState("success");
      setSourceName("");
      await loadSources();
    } catch {
      setCreateState("generic_error");
    }
  };

  return (
    <div className="mako-glass-solid rounded-lg p-5 md:p-6 border border-dashed border-border/30">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-foreground">MAKO Ingest API Test</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/30 border border-border/20 px-2 py-0.5 text-[10px] text-muted-foreground">
              <Wrench className="h-3 w-3" />
              dev tooling
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Verifies the authenticated browser path to the MAKO ingest API via the
            Supabase Edge Function.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadSources}
          disabled={state === "loading"}
          className="shrink-0 gap-2 border-border/30 text-foreground"
        >
          {state === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Load Ingest Sources
        </Button>
      </div>

      {state === "auth_error" && (
        <div className="mt-4 rounded-md border border-destructive/25 bg-destructive/[0.06] p-3 text-xs text-destructive">
          Your session is not authorized to access ingest sources.
        </div>
      )}

      {state === "generic_error" && (
        <div className="mt-4 rounded-md border border-warning/25 bg-warning/[0.06] p-3 text-xs text-warning">
          Unable to load ingest sources right now.
        </div>
      )}

      {state === "success" && sources.length === 0 && (
        <div className="mt-4 rounded-md border border-border/20 bg-muted/10 p-3 text-xs text-muted-foreground">
          No ingest sources returned.
        </div>
      )}

      {sources.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-md border border-border/20">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/20 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Source ID</th>
                <th className="px-3 py-2 font-medium">Port</th>
                <th className="px-3 py-2 font-medium">Output Path</th>
                <th className="px-3 py-2 font-medium">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {sources.map((source, idx) => (
                <tr
                  key={source.source_id ?? `source-${idx}`}
                  className={cn(
                    "hover:bg-muted/10 transition-colors",
                    idx % 2 === 0 ? "bg-transparent" : "bg-muted/5"
                  )}
                >
                  <td className="px-3 py-2 text-foreground">
                    {source.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {source.source_id ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">
                    {source.port ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground truncate max-w-[180px]">
                    {source.output_path ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5">
                      <Server className="h-3 w-3 text-primary" />
                      <span className="text-foreground">{source.state ?? "—"}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default MakoIngestTestPanel;
