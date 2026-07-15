import { defineMcp, auth } from "@lovable.dev/mcp-js";
import getFocusedInput from "./tools/get-focused-input";
import listFeedback from "./tools/list-feedback";
import submitFeedback from "./tools/submit-feedback";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "https://pwdxgwbigjqkokeoixia.supabase.co";

export default defineMcp({
  name: "mako-mcp",
  title: "MAKO Broadcast MCP",
  version: "0.1.0",
  instructions:
    "Tools for the MAKO live-broadcast platform. Read session focus state, browse recent user feedback, and submit new feedback entries on a user's behalf.",
  auth: auth.oauth.issuer({
    issuer: `${SUPABASE_URL}/auth/v1`,
    jwksUri: `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
    acceptedAudiences: ["authenticated"],
  }),
  tools: [getFocusedInput, listFeedback, submitFeedback],
});
