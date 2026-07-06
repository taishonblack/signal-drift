import { createClient } from "@supabase/supabase-js";
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "submit_feedback",
  title: "Submit feedback",
  description: "Submit a feedback entry to the MAKO app on behalf of a user.",
  inputSchema: {
    first_name: z.string().trim().min(1).max(80),
    last_name: z.string().trim().min(1).max(80),
    email: z.string().email(),
    message: z.string().trim().min(1).max(4000),
    page_url: z.string().url().optional().describe("Optional page URL the feedback relates to."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ first_name, last_name, email, message, page_url }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await supabase
      .from("feedback")
      .insert({ first_name, last_name, email, message, page_url: page_url ?? null })
      .select()
      .single();

    if (error) {
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Feedback submitted (id ${data.id}).` }],
      structuredContent: { feedback: data },
    };
  },
});
