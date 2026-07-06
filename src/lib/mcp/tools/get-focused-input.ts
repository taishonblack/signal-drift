import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "get_focused_input",
  title: "Get session focus",
  description: "Return the currently focused SRT input for a MAKO session, showing which stream operators are watching in 1-up mode.",
  inputSchema: {
    session_id: z.string().min(1).describe("The MAKO session ID."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ session_id }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase
      .from("session_focus")
      .select("session_id, focused_input_id, focused_by, updated_at")
      .eq("session_id", session_id)
      .maybeSingle();

    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
    if (!data) {
      return { content: [{ type: "text", text: `No focus set for session ${session_id}.` }] };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { focus: data },
    };
  },
});
