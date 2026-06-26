/**
 * Capital Crew — SERVER LOBBY CLIENT
 *
 * Backend API wrappers for the server-list / create / join / leave / admin
 * edge functions. All calls are authenticated: the caller passes their
 * current `__capcrewUser.id` and the function authorizes it.
 */
import type { AuthUser } from '../auth/AuthClient';

const SUPABASE_URL = 'https://xqhnjbbewoldwtndxfrm.supabase.co';
const SUPABASE_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxaG5qYmJld29sZHd0bmR4ZnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTY4NDMsImV4cCI6MjA5NjY3Mjg0M30.9WHMU3utNiMGVyHrwYZs5ivGDT29SN8XFtQ5oSU76Lw';

export type Visibility = 'public' | 'private' | 'restricted';
export type Lifetime = 'temporary' | 'persistent';

export interface ServerRecord {
  id: string;
  name: string;
  host_user_id: string;
  host_username: string;
  status: 'lobby' | 'playing' | 'finished';
  visibility: Visibility;
  lifetime: Lifetime;
  invite_code: string | null;
  has_password: boolean;
  allowlist: string[];
  max_players: number;
  tick_interval_ms: number;
  expires_at: string | null;
  created_at: string;
  player_count: number;
  is_host: boolean;
}

export interface MemberRecord {
  user_id: string;
  username: string;
  joined_at: string;
  is_host: boolean;
  is_online: boolean;
}

type EdgeResult<T> = { ok: true; data: T } | { ok: false; error: string }

async function call<T>(
  functionName: string,
  body: unknown,
  accessToken: string | null,
): Promise<EdgeResult<T>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON,
    Authorization: 'Bearer ' + (accessToken ?? SUPABASE_ANON),
  };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    if (!res.ok) {
      const err =
        json && typeof json === 'object' && 'error' in json
          ? String((json as { error: unknown }).error)
          : `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    if (json && typeof json === 'object' && 'data' in json) {
      return { ok: true, data: (json as { data: T }).data };
    }
    return { ok: true, data: json as T };
  } catch (e) {
    return { ok: false, error: (e as Error).message ?? 'Network error' };
  }
}

/** Generate a short unique invite code (5 chars A-Z0-9). */
export function randomInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}

export async function createServer(opts: {
  user: AuthUser;
  name: string;
  visibility: Visibility;
  lifetime: Lifetime;
  password?: string;          // bcrypt hash on the wire
  allowlistUsernames?: string[];
  maxPlayers: number;
  tickIntervalMs: number;
  expiresInHours?: number;    // temporary server expiry
}): Promise<EdgeResult<{ server: ServerRecord; invite_code: string }>> {
  return call<{ server: ServerRecord; invite_code: string }>(
    'create-server',
    {
      user_id: opts.user.id,
      username: opts.user.username,
      name: opts.name,
      visibility: opts.visibility,
      lifetime: opts.lifetime,
      password_hash: opts.password ?? null,
      allowlist: opts.allowlistUsernames ?? [],
      max_players: opts.maxPlayers,
      tick_interval_ms: opts.tickIntervalMs,
      expires_in_hours:
        opts.lifetime === 'temporary'
          ? Math.max(1, opts.expiresInHours ?? 24)
          : null,
    },
    null,
  );
}

export async function listServers(opts: {
  filter?: 'all' | 'public' | 'mine';
  user?: AuthUser;
}): Promise<EdgeResult<{ servers: ServerRecord[] }>> {
  return call<{ servers: ServerRecord[] }>(
    'list-servers',
    {
      filter: opts.filter ?? 'all',
      user_id: opts.user?.id ?? null,
    },
    null,
  );
}

export async function joinServer(opts: {
  user: AuthUser;
  server_id?: string;
  invite_code?: string;
  password_hash?: string;
}): Promise<EdgeResult<{ server: ServerRecord; member: MemberRecord }>> {
  return call<{ server: ServerRecord; member: MemberRecord }>(
    'join-server',
    {
      user_id: opts.user.id,
      username: opts.user.username,
      server_id: opts.server_id ?? null,
      invite_code: opts.invite_code ?? null,
      password_hash: opts.password_hash ?? null,
    },
    null,
  );
}

export async function leaveServer(opts: {
  user: AuthUser;
  server_id: string;
}): Promise<EdgeResult<{ ok: true }>> {
  return call<{ ok: true }>(
    'leave-server',
    {
      user_id: opts.user.id,
      server_id: opts.server_id,
    },
    null,
  );
}

export async function kickPlayer(opts: {
  host: AuthUser;
  server_id: string;
  target_user_id: string;
}): Promise<EdgeResult<{ ok: true }>> {
  return call<{ ok: true }>(
    'kick-player',
    {
      host_user_id: opts.host.id,
      server_id: opts.server_id,
      target_user_id: opts.target_user_id,
    },
    null,
  );
}

export async function updateServerSettings(opts: {
  host: AuthUser;
  server_id: string;
  settings: Partial<{
    name: string;
    visibility: Visibility;
    lifetime: Lifetime;
    max_players: number;
    tick_interval_ms: number;
    allowlist: string[];
    status: 'lobby' | 'playing' | 'finished';
    has_password: boolean;
    password_hash: string | null;
  }>;
}): Promise<EdgeResult<{ server: ServerRecord }>> {
  return call<{ server: ServerRecord }>(
    'update-server',
    {
      host_user_id: opts.host.id,
      server_id: opts.server_id,
      settings: opts.settings,
    },
    null,
  );
}

export async function deleteServer(opts: {
  host: AuthUser;
  server_id: string;
}): Promise<EdgeResult<{ ok: true }>> {
  return call<{ ok: true }>(
    'delete-server',
    {
      host_user_id: opts.host.id,
      server_id: opts.server_id,
    },
    null,
  );
}

export async function regenerateInvite(opts: {
  host: AuthUser;
  server_id: string;
}): Promise<EdgeResult<{ invite_code: string }>> {
  return call<{ invite_code: string }>(
    'regenerate-invite',
    {
      host_user_id: opts.host.id,
      server_id: opts.server_id,
    },
    null,
  );
}

export async function listMembers(opts: {
  user: AuthUser;
  server_id: string;
}): Promise<EdgeResult<{ members: MemberRecord[] }>> {
  return call<{ members: MemberRecord[] }>('list-members', {
    user_id: opts.user.id,
    server_id: opts.server_id,
  }, null);
}
