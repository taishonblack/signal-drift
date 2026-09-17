import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import {
  captureAnonymousToken,
  claimAnonymousIdentity,
  guestSessionIdsFor,
  transferGuestSessions,
} from "@/lib/guest-transfer";

const isAnon = (u: User | null | undefined) =>
  !!u && (u as { is_anonymous?: boolean }).is_anonymous === true;

/**
 * Auth state for the UI.
 *
 * An anonymous backend user (a Temporary Operator) is intentionally NOT exposed
 * as `user`: it grants real monitoring infrastructure, not account features. It
 * is reported through `anonymousUserId` so conversion flows can act on it.
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [anonymousUserId, setAnonymousUserId] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apply = (s: Session | null) => {
      setSession(s);
      const u = s?.user ?? null;
      setUser(isAnon(u) ? null : u);
      setAnonymousUserId(isAnon(u) ? (u as User).id : null);
      setLoading(false);
    };

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => apply(s));

    // Then check existing session
    supabase.auth.getSession().then(({ data: { session } }) => apply(session));

    return () => subscription.unsubscribe();
  }, []);

  /**
   * Sign up. While monitoring as a Temporary Operator this becomes a claim in
   * place: credentials are added to the existing anonymous user, so the auth id
   * — and therefore every session, runtime route, playback path and running
   * caller — is untouched. Provisioning is never invoked here.
   */
  const signUp = async (email: string, password: string) => {
    const anonymous = await captureAnonymousToken();
    if (anonymous) {
      const claimed = await claimAnonymousIdentity(email, password);
      return { error: claimed.ok ? null : ({ message: claimed.error } as { message: string }) };
    }
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error };
  };

  /**
   * Sign in to an existing account. When a temporary session is running, the
   * anonymous proof is captured first and its sessions are transferred server
   * side afterwards — the caller keeps running throughout, and a failed
   * transfer never ends a session.
   */
  const signIn = async (email: string, password: string) => {
    const anonymous = await captureAnonymousToken();
    const pending = anonymous ? guestSessionIdsFor(anonymous.userId) : [];
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && anonymous && pending.length > 0) {
      await transferGuestSessions(anonymous, pending);
    }
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return { user, anonymousUserId, session, loading, signUp, signIn, signOut };
}
