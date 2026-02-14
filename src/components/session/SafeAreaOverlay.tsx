/**
 * Broadcast safe-area overlay for QC review.
 * EBU R95 / SMPTE RP 218:
 *   Action-safe  = 93% of frame (3.5% inset each side)
 *   Title-safe   = 90% of frame (5% inset each side)
 * Optional 4:3 center-cut guide.
 */

interface SafeAreaOverlayProps {
  showActionSafe?: boolean;
  showTitleSafe?: boolean;
  showCenterCut?: boolean;
}

const SafeAreaOverlay = ({
  showActionSafe = true,
  showTitleSafe = true,
  showCenterCut = false,
}: SafeAreaOverlayProps) => (
  <div className="absolute inset-0 pointer-events-none z-10">
    {/* Action-safe: 3.5% inset */}
    {showActionSafe && (
      <div
        className="absolute border border-primary/40"
        style={{ inset: "3.5%" }}
      >
        <span className="absolute -top-3.5 left-1 text-[8px] font-mono uppercase tracking-wider text-primary/50">
          Action
        </span>
      </div>
    )}

    {/* Title-safe: 5% inset */}
    {showTitleSafe && (
      <div
        className="absolute border border-warning/40 border-dashed"
        style={{ inset: "5%" }}
      >
        <span className="absolute -top-3.5 left-1 text-[8px] font-mono uppercase tracking-wider text-warning/50">
          Title
        </span>
      </div>
    )}

    {/* 4:3 center-cut */}
    {showCenterCut && (
      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 border-x border-destructive/30 border-dashed" style={{ aspectRatio: "4/3", height: "100%" }} />
    )}

    {/* Center crosshair */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <div className="w-3 h-px bg-primary/30" />
      <div className="w-px h-3 bg-primary/30 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
    </div>
  </div>
);

export default SafeAreaOverlay;
