/**
 * Capital Crew Auth — username/password login + signup via Supabase edge functions.
 *
 * Uses bcryptjs for password hashing (browser-compatible, pure JS).
 * The Supabase anon key is safe to expose; password bcrypts are sent over HTTPS
 * to the edge function which verifies them server-side.
 */
import bcrypt from 'bcryptjs';

const SUPABASE_URL = 'https://xqhnjbbewoldwtndxfrm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxaG5qYmJld29sZHd0bmR4ZnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTY4NDMsImV4cCI6MjA5NjY3Mjg0M30.9WHMU3utNiMGVyHrwYZs5ivGDT29SN8XFtQ5oSU76Lw';

const TOKEN_KEY='capital_crew_auth_token';
const USER_KEY = 'capital_crew_auth_user';

export interface AuthUser {
  id: string;
  username: string;
  created_at: string;
}

export interface AuthResult {
  ok: boolean;
  user?: AuthUser;
  token?: string;
  error?: string;
}

async function callEdge<T>(
  functionName: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });
    const json = (await res.json()) as unknown;
    if (!res.ok) {
      const err =
        typeof json === 'object' && json !== null && 'error' in json
          ? String((json as { error: unknown }).error)
          : `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    const data = (typeof json === 'object' && json !== null && 'data' in json
      ? (json as { data: T }).data
      : (json as T));
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? 'Network error' };
  }
}

export function validateUsername(u: string): string | null {
  const s = u.trim();
  if (s.length < 3) return 'Username must be at least 3 characters';
  if (s.length > 20) return 'Username must be 20 characters or less';
  if (!/^[a-zA-Z0-9_]+$/.test(s))
    return 'Username may only contain letters, numbers, and underscores';
  return null;
}

export function validatePassword(p: string): string | null {
  if (p.length < 6) return 'Password must be at least 6 characters';
  if (p.length > 72) return 'Password must be 72 characters or less (bcrypt limit)';
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function signUp(
  username: string,
  password: string,
): Promise<AuthResult> {
  const u = validateUsername(username);
  if (u) return { ok: false, error: u };
  const p = validatePassword(password);
  if (p) return { ok: false, error: p };

  const passwordHash = await hashPassword(password);
  const res = await callEdge<{ user: AuthUser; token: string }>('signup', {
    username: username.trim(),
    password_hash: passwordHash,
  });
  if (!res.ok) return { ok: false, error: res.error };
  persistSession(res.data.user, res.data.token);
  return { ok: true, user: res.data.user, token: res.data.token };
}

export async function signIn(
  username: string,
  password: string,
): Promise<AuthResult> {
  const u = validateUsername(username);
  if (u) return { ok: false, error: u };
  const p = validatePassword(password);
  if (p) return { ok: false, error: p };

  const passwordHash = await hashPassword(password);
  const res = await callEdge<{ user: AuthUser; token: string }>('signin', {
    username: username.trim(),
    password_hash: passwordHash,
  });
  if (!res.ok) return { ok: false, error: res.error };
  persistSession(res.data.user, res.data.token);
  return { ok: true, user: res.data.user, token: res.data.token };
}

export function currentUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function currentToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function signOut(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function persistSession(user: AuthUser, token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
