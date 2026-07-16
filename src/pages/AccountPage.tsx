import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/ui/sonner";
import { LogOut, Mail, KeyRound, ShieldCheck, Shield, Loader2 } from "lucide-react";
import { clearGuestIdentity } from "@/lib/identity";
import { supabase } from "@/integrations/supabase/client";
import type { User as SupaUser } from "@supabase/supabase-js";

const AccountPage = () => {
  const { user, loading, signUp, signIn, signOut } = useAuth();
  const [params] = useSearchParams();
  const initialMode = params.get("mode") === "signup" ? "signup" : "login";
  const claim = params.get("claim") === "1";

  // When a signed-in user lands with pending save data, claim it.
  useEffect(() => {
    if (!user) return;
    try {
      const pending = localStorage.getItem("mako_pending_save");
      if (pending) {
        localStorage.removeItem("mako_pending_save");
        clearGuestIdentity();
        toast("Session saved to your account");
      }
    } catch {
      /* noop */
    }
  }, [user]);


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
          {user
            ? user.email
            : claim
              ? "Create an account to save your monitoring session, notes, and diagnostics."
              : "Optional. MAKO works fully without an account — sign in to save history, drafts, and layouts."}
        </p>
      </div>

      {user ? (
        <>
          <SignedInView email={user.email ?? ""} onSignOut={signOut} />
          <PasswordSection user={user} />
          <TwoFactorSection />
        </>
      ) : (
        <AuthForm onSignIn={signIn} onSignUp={signUp} initialMode={claim ? "signup" : initialMode} />
      )}


      {/* Settings section */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Preferences</h2>
        <div className="mako-glass rounded-lg divide-y divide-border/10">
          <SettingRow label="Dark mode" description="MAKO uses dark mode only" disabled checked />
          <SettingRow label="Show metric overlays" description="Display bitrate/loss on stream tiles" checked />
        </div>
      </div>

      {/* Retention (scaffold — team admin only) */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Team Retention</h2>
        <div className="mako-glass rounded-lg p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-foreground">Completed session retention</p>
              <p className="text-xs text-muted-foreground">
                How long completed sessions stay in history before archiving.
              </p>
            </div>
            <select
              disabled
              defaultValue="90"
              className="h-8 rounded-md bg-muted/20 border border-border/20 text-xs px-2 text-muted-foreground cursor-not-allowed"
            >
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
              <option value="0">Indefinite</option>
            </select>
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            Team Admin only — coming soon.
          </p>
        </div>
      </div>
    </div>
  );
};

/* ── Auth Form ── */

const AuthForm = ({
  onSignIn,
  onSignUp,
  initialMode = "login",
}: {
  onSignIn: (e: string, p: string) => Promise<{ error: any }>;
  onSignUp: (e: string, p: string) => Promise<{ error: any }>;
  initialMode?: "login" | "signup";
}) => {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
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

/* ── Password change ── */

const PasswordSection = ({ user }: { user: SupaUser }) => {
  const providers = (user.identities ?? []).map((i) => i.provider);
  const hasPasswordAuth = providers.length === 0 || providers.includes("email");
  const socialOnly = !hasPasswordAuth;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 6) return toast("Password must be at least 6 characters");
    if (next !== confirm) return toast("Passwords do not match");
    setBusy(true);
    // Re-verify current password to prevent session hijack changes.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email ?? "",
      password: current,
    });
    if (signInErr) {
      setBusy(false);
      return toast("Current password is incorrect");
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) return toast(error.message);
    setCurrent(""); setNext(""); setConfirm("");
    toast("Password updated");
  };

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
        <KeyRound className="h-3.5 w-3.5" /> Password
      </h2>
      <div className="mako-glass rounded-lg p-5">
        {socialOnly ? (
          <p className="text-xs text-muted-foreground">
            You signed in with {providers.join(", ")}. Password changes are managed by your identity provider.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="current" className="text-xs text-muted-foreground">Current password</Label>
              <Input id="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required className="bg-background/50 border-border/30" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new" className="text-xs text-muted-foreground">New password</Label>
              <Input id="new" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={6} className="bg-background/50 border-border/30" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm" className="text-xs text-muted-foreground">Confirm new password</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={6} className="bg-background/50 border-border/30" />
            </div>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};

/* ── Two-factor auth (TOTP) ── */

interface Factor { id: string; friendly_name?: string | null; status: string; }

const TwoFactorSection = () => {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollment, setEnrollment] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error && data) {
      setFactors((data.totp ?? []) as Factor[]);
    }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const verified = factors.filter((f) => f.status === "verified");
  const hasMFA = verified.length > 0;

  const startEnroll = async () => {
    setEnrolling(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    if (error || !data) {
      setEnrolling(false);
      return toast(error?.message ?? "Failed to start enrollment");
    }
    setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const cancelEnroll = async () => {
    if (enrollment) await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    setEnrollment(null);
    setCode("");
    setEnrolling(false);
  };

  const verifyEnroll = async () => {
    if (!enrollment) return;
    setBusy(true);
    const { data: c, error: ce } = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
    if (ce || !c) { setBusy(false); return toast(ce?.message ?? "Challenge failed"); }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrollment.factorId,
      challengeId: c.id,
      code: code.trim(),
    });
    setBusy(false);
    if (error) return toast(error.message);
    toast("Two-factor authentication enabled");
    setEnrollment(null); setCode(""); setEnrolling(false);
    refresh();
  };

  const disable = async (factorId: string) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return toast(error.message);
    toast("Two-factor authentication disabled");
    refresh();
  };

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5" /> Two-factor authentication
      </h2>
      <div className="mako-glass rounded-lg p-5 space-y-4">
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : hasMFA ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Shield className="h-4 w-4 text-primary" /> 2FA is enabled
            </div>
            {verified.map((f) => (
              <div key={f.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{f.friendly_name || "Authenticator app"}</span>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => disable(f.id)}>
                  Disable
                </Button>
              </div>
            ))}
          </div>
        ) : enrollment ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Scan this QR code with your authenticator app (1Password, Authy, Google Authenticator), then enter the 6-digit code.
            </p>
            <div className="flex justify-center bg-white rounded-md p-3">
              <img src={enrollment.qr} alt="TOTP QR code" className="h-40 w-40" />
            </div>
            <p className="text-[10px] font-mono text-center text-muted-foreground break-all">
              {enrollment.secret}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="totp" className="text-xs text-muted-foreground">Verification code</Label>
              <Input id="totp" value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" inputMode="numeric" maxLength={6} className="bg-background/50 border-border/30" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={verifyEnroll} disabled={busy || code.length < 6}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & enable"}
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEnroll}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Add an extra layer of security. You'll enter a code from your authenticator app when signing in.
            </p>
            <Button size="sm" onClick={startEnroll} disabled={enrolling}>
              Enable 2FA
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountPage;
