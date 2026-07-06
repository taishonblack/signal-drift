import { defineMcp } from "@lovable.dev/mcp-js";
import getFocusedInput from "./tools/get-focused-input";
import listFeedback from "./tools/list-feedback";
import submitFeedback from "./tools/submit-feedback";

export default defineMcp({
  name: "mako-mcp",
  title: "MAKO Broadcast MCP",
  version: "0.1.0",
  instructions:
    "Tools for the MAKO live-broadcast platform. Read session focus state, browse recent user feedback, and submit new feedback entries on a user's behalf.",
  tools: [getFocusedInput, listFeedback, submitFeedback],
});
