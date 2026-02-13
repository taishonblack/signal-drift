import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/ui/sonner";
import { LogOut, Mail } from "lucide-react";

const AccountPage = () => {
  const { user, loading, signUp, signIn, signOut } = useAuth();

  if (loading) {
    return (
      <div className="max-w-lg mx-auto flex items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground">
          {user ? user.email : "Sign in to save sessions and sync across devices"}
        </p>
      </div>

      {user ? (
        <SignedInView email={user.email ?? ""} onSignOut={signOut} />
      ) : (
        <AuthForm onSignIn={signIn} onSignUp={signUp} />
      )}

      {/* Settings section */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Preferences</h2>
        <div className="mako-glass rounded-lg divide-y divide-border/10">
          <SettingRow label="Dark mode" description="MAKO uses dark mode only" disabled checked />
          <SettingRow label="Show metric overlays" description="Display bitrate/loss on stream tiles" checked />
        </div>
      </div>
    </div>
  );
};

/* ── Auth Form ── */

const AuthForm = ({
  onSignIn,
  onSignUp,
}: {
  onSignIn: (e: string, p: string) => Promise<{ error: any }>;
  onSignUp: (e: string, p: string) => Promise<{ error: any }>;
}) => {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } =
      mode === "login"
        ? await onSignIn(email, password)
        : await onSignUp(email, password);
    setBusy(false);

    if (error) {
      toast(error.message);
    } else if (mode === "signup") {
      toast("Check your email for a confirmation link");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mako-glass rounded-lg p-5 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="bg-background/50 border-border/30"
          placeholder="you@example.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-xs text-muted-foreground">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          className="bg-background/50 border-border/30"
          placeholder="••••••••"
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        {mode === "login" ? "No account? " : "Already have an account? "}
        <button
          type="button"
          className="text-primary hover:underline"
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
        >
          {mode === "login" ? "Sign up" : "Sign in"}
        </button>
      </p>
    </form>
  );
};

/* ── Signed-in view ── */

const SignedInView = ({ email, onSignOut }: { email: string; onSignOut: () => Promise<{ error: any }> }) => {
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <div className="mako-glass rounded-lg p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-semibold">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-sm text-foreground truncate">{email}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" /> Verified</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={async () => {
          const { error } = await onSignOut();
          if (error) toast(error.message);
        }}
      >
        <LogOut className="h-4 w-4 mr-1.5" /> Sign out
      </Button>
    </div>
  );
};

/* ── Setting row ── */

const SettingRow = ({ label, description, checked, disabled }: { label: string; description: string; checked?: boolean; disabled?: boolean }) => (
  <div className="flex items-center justify-between px-4 py-3">
    <div>
      <p className="text-sm text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
    <Switch defaultChecked={checked} disabled={disabled} />
  </div>
);

export default AccountPage;
