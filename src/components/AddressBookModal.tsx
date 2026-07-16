import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Pencil, Trash2, BookOpen, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseSrtInput } from "@/lib/session-store";
import { toast } from "@/components/ui/sonner";
import { Link } from "react-router-dom";

interface AddressBookEntry {
  id: string;
  tag: string;
  session_name: string | null;
  purpose: string | null;
  address: string;
  port: string | null;
  description: string | null;
  last_used: string;
}

interface Props {
  onSelect: (address: string) => void;
}

const emptyForm = {
  tag: "",
  session_name: "",
  purpose: "",
  address: "",
  port: "",
  description: "",
};

const AddressBookModal = ({ onSelect }: Props) => {
  const { user, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState<AddressBookEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("address_book")
      .select("id, tag, session_name, purpose, address, port, description, last_used")
      .order("last_used", { ascending: false });
    if (error) toast(error.message);
    setEntries((data ?? []) as AddressBookEntry[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open && user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        const q = search.toLowerCase();
        return (
          e.tag.toLowerCase().includes(q) ||
          (e.session_name ?? "").toLowerCase().includes(q) ||
          (e.purpose ?? "").toLowerCase().includes(q) ||
          e.address.toLowerCase().includes(q) ||
          (e.port ?? "").includes(q) ||
          (e.description ?? "").toLowerCase().includes(q)
        );
      }),
    [entries, search]
  );

  const displayAddress = (e: AddressBookEntry) =>
    e.port ? `${e.address}:${e.port}` : e.address;

  const handleSelect = async (e: AddressBookEntry) => {
    onSelect(e.port ? `${e.address}:${e.port}` : e.address);
    setOpen(false);
    // Touch last_used
    await supabase
      .from("address_book")
      .update({ last_used: new Date().toISOString() })
      .eq("id", e.id);
  };

  const startAdd = () => {
    setForm({ ...emptyForm });
    setAddMode(true);
    setEditId(null);
  };

  const startEdit = (e: AddressBookEntry) => {
    const parsed = parseSrtInput(e.address);
    setForm({
      tag: e.tag,
      session_name: e.session_name ?? "",
      purpose: e.purpose ?? "",
      address: e.port ? e.address : parsed.host || e.address,
      port: e.port ?? parsed.port ?? "",
      description: e.description ?? "",
    });
    setEditId(e.id);
    setAddMode(false);
  };

  const cancelEdit = () => {
    setEditId(null);
    setAddMode(false);
    setForm({ ...emptyForm });
  };

  const saveEntry = async () => {
    if (!user) return;
    if (!form.tag.trim() || !form.address.trim()) {
      toast("Name and address are required");
      return;
    }
    setBusy(true);
    const payload = {
      user_id: user.id,
      tag: form.tag.trim(),
      session_name: form.session_name.trim() || null,
      purpose: form.purpose.trim() || null,
      address: form.address.trim(),
      port: form.port.trim() || null,
      description: form.description.trim() || null,
      last_used: new Date().toISOString(),
    };
    let error;
    if (addMode) {
      ({ error } = await supabase.from("address_book").insert(payload));
    } else if (editId) {
      ({ error } = await supabase.from("address_book").update(payload).eq("id", editId));
    }
    setBusy(false);
    if (error) return toast(error.message);
    cancelEdit();
    load();
  };

  const deleteEntry = async (id: string) => {
    const { error } = await supabase.from("address_book").delete().eq("id", id);
    setConfirmDelete(null);
    if (error) return toast(error.message);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  // Not signed in → prompt to sign in
  if (!authLoading && !user) {
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
          <p className="text-xs text-muted-foreground">
            Sign in to save SRT addresses privately to your account. Only you will be able to see them.
          </p>
          <Button asChild size="sm" className="mt-2 w-full" onClick={() => setOpen(false)}>
            <Link to="/account">Sign In</Link>
          </Button>
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
              placeholder="Search name, session, purpose, address…"
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
              value={form.tag}
              onChange={(e) => setForm({ ...form, tag: e.target.value })}
              placeholder="Friendly name (e.g. NBC Program)"
              className="h-7 text-xs bg-muted/20 border-border/20"
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={form.session_name}
                onChange={(e) => setForm({ ...form, session_name: e.target.value })}
                placeholder="Session name (optional)"
                className="h-7 text-xs bg-muted/20 border-border/20"
              />
              <Input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="Purpose (optional)"
                className="h-7 text-xs bg-muted/20 border-border/20"
              />
            </div>
            <div className="grid grid-cols-[1fr_5rem] gap-2">
              <Input
                value={form.address}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/[:/?]/.test(v) || /^srt:\/\//i.test(v)) {
                    const p = parseSrtInput(v);
                    setForm({ ...form, address: p.host, port: p.port || form.port });
                  } else {
                    setForm({ ...form, address: v });
                  }
                }}
                placeholder="host or ip"
                className="h-7 text-xs bg-muted/20 border-border/20 font-mono"
              />
              <Input
                value={form.port}
                onChange={(e) => setForm({ ...form, port: e.target.value.replace(/\D/g, "") })}
                placeholder="port"
                inputMode="numeric"
                className="h-7 text-xs bg-muted/20 border-border/20 font-mono"
              />
            </div>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Description (optional)"
              rows={2}
              className="text-xs bg-muted/20 border-border/20 min-h-0"
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" className="text-xs h-7" onClick={cancelEdit}>Cancel</Button>
              <Button size="sm" className="text-xs h-7" onClick={saveEntry} disabled={busy}>
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>
        )}

        <div className="max-h-72 overflow-y-auto space-y-1">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-4 flex items-center justify-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {entries.length === 0 ? "No saved addresses yet. Add one to get started." : "No entries found"}
            </p>
          ) : (
            filtered.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/15 transition-colors group"
              >
                <button onClick={() => handleSelect(entry)} className="flex-1 text-left min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{entry.tag}</p>
                  <p className="text-[10px] text-muted-foreground truncate font-mono">
                    {displayAddress(entry)}
                  </p>
                  {(entry.session_name || entry.purpose) && (
                    <p className="text-[10px] text-muted-foreground/80 truncate">
                      {[entry.session_name, entry.purpose].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  {entry.description && (
                    <p className="text-[10px] text-muted-foreground/60 truncate">{entry.description}</p>
                  )}
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
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddressBookModal;
