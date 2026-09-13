# Persistent per-source audio control

## What will change
- Move the existing speaker control in `SignalTile` out of the hover-only controls layer so it remains visible on every configured source pane.
- Keep the other pane actions hover-revealed and preserve the current MAKO styling.
- Show `VolumeX` with **“Listen to this source”** when inactive, and `Volume2` with **“Stop listening”** plus the existing cyan active treatment when active.
- Render the control only when the pane receives the existing `onSelectAudio` callback, avoiding controls on drag previews or placeholders.

## Existing behavior retained
- The single-source pane and fullscreen view already receive `activeAudioSourceId` state and `toggleAudioSource(inputId)` through `isAudioSource` and `onSelectAudio`; those connections will remain unchanged.
- Pane focus remains independent from audio selection.
- The session-wide Mute All action continues to clear the centralized audio selection.
- WHEP playback, PeerConnection lifecycle, stream mapping, SRT configuration, and video behavior will not change.

## Root cause
The speaker button is currently inside a controls layer that starts at `opacity-0` and relies on that same overlay’s hover state. The focused and fullscreen panes are wired correctly, but the source audio action is therefore not persistently visible.

## Verification
- Check multiview, focused one-source, and fullscreen views for the persistent per-source speaker button.
- Confirm inactive/active icons, exact tooltips, and active styling.
- Confirm clicking the control toggles or switches the one centralized audio source without focusing the pane or disturbing video playback.
