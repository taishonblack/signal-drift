import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { QCMarker } from "@/lib/mock-data";

interface QCNotesPanelProps {
  notes: string;
  onNotesChange: (val: string) => void;
  markerNote: string;
  onMarkerNoteChange: (val: string) => void;
  markers: QCMarker[];
  onAddMarker: () => void;
}

const QCNotesPanel = ({ notes, onNotesChange, markerNote, onMarkerNoteChange, markers, onAddMarker }: QCNotesPanelProps) => (
  <div className="mako-glass rounded-lg p-4 space-y-3 max-h-60 overflow-auto">
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">QC Notes</span>
    </div>
    <Textarea value={notes} onChange={(e) => onNotesChange(e.target.value)} placeholder="Shared session notes..." className="bg-muted/20 border-border/20 text-sm min-h-[60px] text-foreground placeholder:text-muted-foreground/40" />
    <div className="flex gap-2">
      <Input value={markerNote} onChange={(e) => onMarkerNoteChange(e.target.value)} placeholder="Add QC marker..." className="bg-muted/20 border-border/20 text-sm text-foreground placeholder:text-muted-foreground/40" onKeyDown={(e) => e.key === "Enter" && onAddMarker()} />
      <Button size="sm" onClick={onAddMarker} className="shrink-0">Mark</Button>
    </div>
    <div className="space-y-1">
      {markers.map((m) => (
        <div key={m.id} className="flex items-start gap-2 text-xs py-1 border-t border-border/10">
          <span className="text-primary font-mono shrink-0">{m.timestamp}</span>
          <span className="text-muted-foreground shrink-0">{m.streamLabel}</span>
          <span className="text-foreground">{m.note}</span>
        </div>
      ))}
    </div>
  </div>
);

export default QCNotesPanel;
