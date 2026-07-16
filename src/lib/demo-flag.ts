// Central flag controlling whether seeded demo data (team sessions,
// mock viewers, sample drafts, sample incidents, etc.) is included in
// the UI. Off by default — production users see empty or real state.
//
// Enable per-environment via .env:
//   VITE_ENABLE_DEMO_DATA=true

export const DEMO_DATA_ENABLED =
  String(import.meta.env.VITE_ENABLE_DEMO_DATA ?? "").toLowerCase() === "true";
