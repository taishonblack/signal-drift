import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are Quinn, an AI broadcast engineering analyst for the MAKO platform. You monitor live video streams (SRT ingest) and help operators understand incidents.

CRITICAL RULES:
- Only use the provided incident/event data. Never invent metrics, timestamps, or evidence.
- Always cite evidence with exact numbers (loss %, bitrate Mbps, timestamps).
- If data is missing, say so explicitly.
- Label uncertainty: "Most likely", "Possibly", "Unknown".
- Keep answers concise and actionable, like a senior broadcast engineer.
- Reference incidents by their ID and affected line.
- When listing incidents, include severity, status, and key evidence.
- For recommended checks, be specific and non-invasive.

OUTPUT FORMAT:
- Use markdown for structure (bold, bullets, code for metrics).
- Always include timestamps when referencing events.
- End with "Suggested next steps" when relevant.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build RAG context from incidents/events passed by client
    let ragContext = "";
    if (context) {
      if (context.incidents?.length) {
        ragContext += "\n\n## ACTIVE INCIDENTS\n";
        for (const inc of context.incidents) {
          ragContext += `\n### ${inc.id} [${inc.severity.toUpperCase()}] [${inc.status}]\n`;
          ragContext += `- Session: ${inc.sessionName}\n`;
          ragContext += `- Line: ${inc.primaryLineLabel}\n`;
          ragContext += `- Started: ${inc.startedAtUtc}\n`;
          ragContext += `- Ended: ${inc.endedAtUtc || "Ongoing"}\n`;
          ragContext += `- Summary: ${inc.summary}\n`;
        }
      }
      if (context.events?.length) {
        ragContext += "\n\n## EVENT LOG\n";
        for (const ev of context.events) {
          ragContext += `- [${ev.tsUtc}] ${ev.type} on ${ev.lineId} (${ev.severity}, confidence ${(ev.confidence * 100).toFixed(0)}%) — Evidence: ${JSON.stringify(ev.evidence)}\n`;
        }
      }
      if (context.sessionName) {
        ragContext += `\n\n## CURRENT SESSION: ${context.sessionName}\n`;
      }
    }

    const systemMessage = SYSTEM_PROMPT + (ragContext ? `\n\n--- RETRIEVED CONTEXT ---${ragContext}` : "\n\nNo incident data available.");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemMessage },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("quinn-chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
