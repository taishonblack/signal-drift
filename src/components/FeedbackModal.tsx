import { useState } from "react";
import { Pencil, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface FeedbackModalProps {
  collapsed: boolean;
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function FeedbackModal({ collapsed }: FeedbackModalProps) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const location = useLocation();

  const valid =
    firstName.trim() !== "" &&
    lastName.trim() !== "" &&
    emailRegex.test(email.trim()) &&
    message.trim() !== "";

  const reset = () => {
    setFirstName("");
    setLastName("");
    setEmail("");
    setMessage("");
    setSending(false);
    setSent(false);
  };

  const handleSubmit = async () => {
    if (!valid) return;
    setSending(true);
    await supabase.from("feedback").insert({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      message: message.trim(),
      page_url: location.pathname,
      user_agent: navigator.userAgent,
    });
    setSending(false);
    setSent(true);
    setTimeout(() => {
      setOpen(false);
      reset();
    }, 2000);
  };

  const trigger = collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center justify-center w-8 h-8 mx-auto rounded-md text-muted-foreground transition-colors hover:text-primary hover:shadow-[0_0_8px_hsl(var(--primary)/0.4)]"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">Send Feedback</TooltipContent>
    </Tooltip>
  ) : (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 px-3 py-2 w-full rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-muted/30"
    >
      <Pencil className="h-4 w-4 shrink-0" />
      <span>Feedback</span>
    </button>
  );

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-[420px] rounded-xl border-primary/20 bg-[hsl(var(--mako-deep))] backdrop-blur-xl shadow-[0_0_40px_hsl(var(--primary)/0.08)]">
          {sent ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <CheckCircle2 className="h-10 w-10 text-primary animate-in zoom-in-50" />
              <p className="text-sm text-foreground">Thanks for your feedback.</p>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-foreground">Send Feedback</DialogTitle>
                <DialogDescription>Help us improve Mako</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fb-fn">First Name</Label>
                    <Input id="fb-fn" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jane" className="bg-mako-layer border-border/40" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fb-ln">Last Name</Label>
                    <Input id="fb-ln" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" className="bg-mako-layer border-border/40" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fb-email">Email</Label>
                  <Input id="fb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" className="bg-mako-layer border-border/40" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fb-msg">Feedback</Label>
                  <Textarea id="fb-msg" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what you think…" className="bg-mako-layer border-border/40 resize-none" />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button disabled={!valid || sending} onClick={handleSubmit}>
                    {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Send Feedback
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
