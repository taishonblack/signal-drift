
# MAKO — Live Signal Intelligence Platform

## Overview
Build the complete MAKO frontend with the cinematic "digital signal infrastructure" visual system, all core pages, and mock data — ready to connect to a real media backend later.

---

## 1. Design System & Global Visual Foundation
- **Deep layered navy backgrounds** (#050B12 → #081824) with restrained radial cyan glow (8% opacity max)
- **Glass panel system** across all UI: translucent dark panels with backdrop blur, ultra-subtle borders, soft inner glow on active states
- **Typography**: Inter font, uppercase MAKO wordmark with letter spacing, light-weight labels, medium-weight metrics
- **Color palette**: Primary signal #00C2FF, text #E6F6FF / #9EC6DA / #5F7F91, warning #F5A623, error #FF3B3B
- **Subtle CSS-animated light streaks** in backgrounds (very slow, low opacity, ambient only)
- **Interaction feedback**: micro hover elevation, thin edge glow, no bouncing or dramatic animations

## 2. Hero / Landing Page
- Full-width cinematic scene using the uploaded light rail image as background reference art
- Gradient overlay fading from opaque left to transparent right for text readability
- "MAKO" wordmark + "Live Signal Intelligence" tagline, minimal and understated
- CTA buttons: "Create Session" and "Join Session"
- Visual continuity: light rails fade naturally into the app UI below (no hard section break)

## 3. Responsive Navigation
- **Desktop**: Left sidebar, collapsible to icons-only, hideable with "B" keyboard shortcut. Preference saved to localStorage. Glass panel styling, near-invisible borders. Active item = thin vertical cyan light bar
- **Mobile portrait**: Fixed bottom nav with icons + labels (Sessions, Create, Join, Settings) — transparent background, subtle under-glow on active
- **Mobile landscape**: Collapsible left side rail
- Small "MAKO" wordmark top-left of sidebar (14-16px), collapses to "M" mark

## 4. Sessions Home Page
- List of sessions displayed as glass panel cards with session name, status, date, input count
- Mock session data (3-5 example sessions with various states)
- "Create Review Session" and "Join Session" action buttons
- Session cards show live/ended status with subtle accent indicators

## 5. Create Review Session Page
- Glass panel form with:
  - Session name input
  - 1–4 input lines, each with: enable toggle, editable label ("Line 1–4"), SRT address field, optional passphrase field
  - Add/remove input lines dynamically
- "Start Session" button navigates to Session Room
- Clean, spacious form layout matching the restrained aesthetic

## 6. Session Room (Core Workspace)
- **Multiview player grid** with switchable layouts: 1-up, 2-up, 3-up (1 large + 2 small), 4-up (2×2)
- Each stream tile ("Signal Bay"):
  - Mock video placeholder with label overlay
  - Status badge: Connecting / Live / Warning / Error
  - 2px top accent line (cyan for live, amber for warning, red for error)
  - Bitrate/loss overlay (mock data)
  - Fullscreen button per tile (hides nav, ESC exits)
  - Edit input button (swap SRT address mid-session via modal)
- **Layout switcher** toolbar
- **Audio source selector** (which tile provides audio)

## 7. Inspector Panel (Collapsible)
- Side panel or bottom drawer, collapsed by default
- Shows per-stream technical details (all mock): codec, profile, resolution, frame rate, bitrate, packet loss, RTT, audio channels, sample rate
- Thin signal-trace style metric visualizations using Recharts
- Health indicators with subtle color coding

## 8. Shared Notes & QC Markers
- Notes panel within Session Room (collapsible)
- Text area for shared session notes
- "Add Marker" button that captures a timestamped QC note tied to the active stream
- Marker list with timestamps and stream labels

## 9. Invite / Join Flow
- Session Room shows invite controls: copyable join link + session PIN
- Join Session page: enter session ID or PIN to access a session room as a viewer
- Mock flow (no real auth) — just navigates to a viewer version of the session room

## 10. Settings Page
- Minimal settings: display preferences, nav behavior, theme (dark only for now)
- Placeholder sections for future account/auth settings
