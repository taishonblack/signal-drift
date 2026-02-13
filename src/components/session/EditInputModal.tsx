import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { StreamInput } from "@/lib/mock-data";

interface EditInputModalProps {
  editInput: StreamInput | null;
  address: string;
  passphrase: string;
  onAddressChange: (val: string) => void;
  onPassphraseChange: (val: string) => void;
  onClose: () => void;
  onApply: () => void;
}

const EditInputModal = ({ editInput, address, passphrase, onAddressChange, onPassphraseChange, onClose, onApply }: EditInputModalProps) => (
  <Dialog open={!!editInput} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="text-foreground text-sm">Edit Input — {editInput?.label}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">SRT Address</label>
          <Input value={address} onChange={(e) => onAddressChange(e.target.value)} placeholder="srt://ip:port?mode=caller" className="bg-muted/20 border-border/20 text-sm text-foreground placeholder:text-muted-foreground/40" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Passphrase</label>
          <Input type="password" value={passphrase} onChange={(e) => onPassphraseChange(e.target.value)} placeholder="Optional" className="bg-muted/20 border-border/20 text-sm text-foreground placeholder:text-muted-foreground/40" />
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={onApply}>Apply & Reconnect</Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);

export default EditInputModal;
