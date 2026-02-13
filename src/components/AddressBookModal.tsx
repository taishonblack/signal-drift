import { useState, useMemo } from "react";
import { Search, Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getAddressBook, saveAddressBook, isLoggedIn,
  type AddressBookEntry,
} from "@/lib/session-store";

interface Props {
  onSelect: (address: string) => void;
}

const AddressBookModal = ({ onSelect }: Props) => {
  const loggedIn = isLoggedIn();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<AddressBookEntry[]>(getAddressBook);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTag, setEditTag] = useState("");
  const [editAddr, setEditAddr] = useState("");
  const [addMode, setAddMode] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          e.tag.toLowerCase().includes(search.toLowerCase()) ||
          e.address.toLowerCase().includes(search.toLowerCase())
      ),
    [entries, search]
  );

  const persist = (next: AddressBookEntry[]) => {
    setEntries(next);
    saveAddressBook(next);
  };

  const handleSelect = (addr: string) => {
    onSelect(addr);
    setOpen(false);
  };

  const startAdd = () => {
    setAddMode(true);
    setEditTag("");
    setEditAddr("");
    setEditId(null);
  };

  const startEdit = (e: AddressBookEntry) => {
    setEditId(e.id);
    setEditTag(e.tag);
    setEditAddr(e.address);
    setAddMode(false);
  };

  const saveEntry = () => {
    if (!editTag.trim() || !editAddr.trim()) return;
    if (addMode) {
      const newEntry: AddressBookEntry = {
        id: `ab-${Date.now()}`,
        tag: editTag.trim(),
        address: editAddr.trim(),
        lastUsed: new Date().toISOString(),
      };
      persist([newEntry, ...entries]);
    } else if (editId) {
      persist(
        entries.map((e) =>
          e.id === editId ? { ...e, tag: editTag.trim(), address: editAddr.trim() } : e
        )
      );
    }
    setEditId(null);
    setAddMode(false);
  };

  const deleteEntry = (id: string) => {
    persist(entries.filter((e) => e.id !== id));
    setConfirmDelete(null);
  };

  // Not logged in → show sign-in prompt
  if (!loggedIn) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <BookOpen className="h-3.5 w-3.5" /> Address Book
          </Button>
        </DialogTrigger>
        <DialogContent className="mako-glass-solid border-border/20 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground text-sm">Sign in required</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Sign in to use the Address Book and save SRT addresses.</p>
          <Button size="sm" className="mt-2 w-full">Sign In</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <BookOpen className="h-3.5 w-3.5" /> Address Book
        </Button>
      </DialogTrigger>
      <DialogContent className="mako-glass-solid border-border/20 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-sm">Address Book</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-8 h-8 text-xs bg-muted/20 border-border/20"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={startAdd} className="gap-1 text-xs text-primary">
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>

        {(addMode || editId) && (
          <div className="space-y-2 p-3 rounded-md bg-muted/10 border border-border/20">
            <Input
              value={editTag}
              onChange={(e) => setEditTag(e.target.value)}
              placeholder="Tag name"
              className="h-7 text-xs bg-muted/20 border-border/20"
            />
            <Input
              value={editAddr}
              onChange={(e) => setEditAddr(e.target.value)}
              placeholder="srt://ip:port"
              className="h-7 text-xs bg-muted/20 border-border/20"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setEditId(null); setAddMode(false); }}>Cancel</Button>
              <Button size="sm" className="text-xs h-7" onClick={saveEntry}>Save</Button>
            </div>
          </div>
        )}

        <div className="max-h-60 overflow-y-auto space-y-1">
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No entries found</p>
          )}
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/15 transition-colors group"
            >
              <button
                onClick={() => handleSelect(entry.address)}
                className="flex-1 text-left min-w-0"
              >
                <p className="text-xs font-medium text-foreground truncate">{entry.tag}</p>
                <p className="text-[10px] text-muted-foreground truncate">{entry.address}</p>
              </button>
              {confirmDelete === entry.id ? (
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setConfirmDelete(null)}>No</Button>
                  <Button variant="destructive" size="sm" className="h-6 text-[10px]" onClick={() => deleteEntry(entry.id)}>Yes</Button>
                </div>
              ) : (
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(entry)}>
                    <Pencil className="h-3 w-3 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setConfirmDelete(entry.id)}>
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddressBookModal;
