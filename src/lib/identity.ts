// Identity layer — Monitor first, identify later.
//
// Three states:
//   • anon    — visitor has done nothing; no session participation yet.
//   • guest   — Temporary Operator; auto-generated on first session touch.
//   • member  — signed-in user.
//
// Everything client-side; persisted in localStorage so identity survives reloads.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type IdentityKind = "anon" | "guest" | "member";

export interface Identity {
  kind: IdentityKind;
  id: string;
  name: string;
}

const GUEST_KEY = "mako_guest_identity";
const MEMBER_KEY = "mako_member_identity";
const AUTH_LISTENERS: Array<() => void> = [];

function randomSuffix(len = 4): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON<T>(key: string, val: T) {
  localStorage.setItem(key, JSON.stringify(val));
}

function readMember(): Identity | null {
  const m = readJSON<Identity>(MEMBER_KEY);
  return m && m.kind === "member" ? m : null;
}

function readGuest(): Identity | null {
  const g = readJSON<Identity>(GUEST_KEY);
  return g && g.kind === "guest" ? g : null;
}

/** Return current identity WITHOUT creating one. Used for reads. */
export function getIdentity(): Identity {
  const member = readMember();
  if (member) return member;
  const guest = readGuest();
  if (guest) return guest;
  return { kind: "anon", id: "anon", name: "Guest" };
}

/**
 * Ensure a persistent identity exists (guest, if not member).
 * Call this before creating or joining a session — that's the promotion moment
 * from Anonymous Visitor → Temporary Operator.
 */
export function ensureIdentity(): Identity {
  const existing = getIdentity();
  if (existing.kind !== "anon") return existing;
  const id = `guest-${randomSuffix()}`;
  const guest: Identity = {
    kind: "guest",
    id,
    name: `Operator-${id.slice(-4)}`,
  };
  writeJSON(GUEST_KEY, guest);
  notify();
  return guest;
}

/** Set the member identity (called after sign-in). */
export function setMemberIdentity(user: { id: string; email?: string | null; name?: string | null }) {
  const displayName =
    user.name?.trim() ||
    (user.email ? user.email.split("@")[0] : `User-${user.id.slice(0, 4)}`);
  const member: Identity = { kind: "member", id: user.id, name: displayName };
  writeJSON(MEMBER_KEY, member);
  notify();
}

/** Clear member identity (called after sign-out). Keeps guest identity intact. */
export function clearMemberIdentity() {
  localStorage.removeItem(MEMBER_KEY);
  notify();
}

/** Clear guest identity (e.g. after a successful claim/rebind). */
export function clearGuestIdentity() {
  localStorage.removeItem(GUEST_KEY);
  notify();
}

function notify() {
  for (const fn of AUTH_LISTENERS) fn();
}

function subscribe(fn: () => void): () => void {
  AUTH_LISTENERS.push(fn);
  return () => {
    const idx = AUTH_LISTENERS.indexOf(fn);
    if (idx !== -1) AUTH_LISTENERS.splice(idx, 1);
  };
}

/** Hook: reactive identity state. */
export function useIdentity(): Identity {
  const [identity, setIdentity] = useState<Identity>(() => getIdentity());

  useEffect(() => {
    const refresh = () => setIdentity(getIdentity());
    const unsub = subscribe(refresh);
    const onStorage = (e: StorageEvent) => {
      if (e.key === GUEST_KEY || e.key === MEMBER_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsub();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return identity;
}

/**
 * One-time bootstrap — mount this once at the app root so Supabase auth state
 * is mirrored into the identity store.
 */
export function useIdentityBootstrap() {
  useEffect(() => {
    // Initial hydration.
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      if (u) setMemberIdentity({ id: u.id, email: u.email, name: (u.user_metadata as any)?.name });
      else clearMemberIdentity();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user;
      if (u) setMemberIdentity({ id: u.id, email: u.email, name: (u.user_metadata as any)?.name });
      else clearMemberIdentity();
    });
    return () => sub.subscription.unsubscribe();
  }, []);
}
