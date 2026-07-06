import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "list_recent_feedback",
  title: "List recent feedback",
  description: "Return the most recent user-submitted feedback entries for the MAKO app (newest first).",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10).describe("Max entries to return (1-50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase
      .from("feedback")
      .select("id, first_name, last_name, email, message, page_url, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { feedback: data ?? [] },
    };
  },
});
