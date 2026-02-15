import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import SignalTile from "@/components/SignalTile";
import type { StreamInput } from "@/lib/mock-data";
import type { LiveMetrics } from "@/hooks/use-live-metrics";
import type { TimeDisplayPrefs } from "@/lib/time-utils";

interface DraggableSignalTileProps {
  slotId: string;
  input: StreamInput;
  liveMetrics?: LiveMetrics;
  isFocused?: boolean;
  isAudioSource?: boolean;
  onFocusClick?: () => void;
  onFullscreen?: () => void;
  onEdit?: () => void;
  onSelectAudio?: () => void;
  timePrefs?: TimeDisplayPrefs;
  tileOriginTZ?: string;
  focusedOriginTZ?: string;
  sessionStartedAt?: string;
  showSafeArea?: boolean;
  canDrag: boolean;
}

const DraggableSignalTile = ({
  slotId,
  canDrag,
  ...tileProps
}: DraggableSignalTileProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: slotId,
    disabled: !canDrag,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`h-full min-h-0 ${isOver && !isDragging ? "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg" : ""}`}
    >
      {/* Drag grip handle - only shown when draggable */}
      {canDrag && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-2 right-10 z-30 p-1 rounded bg-background/60 hover:bg-background/80 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
      )}
      <SignalTile {...tileProps} />
    </div>
  );
};

export default DraggableSignalTile;
