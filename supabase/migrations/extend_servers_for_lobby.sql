-- Capital Crew — Server-lobby schema extension
--
-- Adds:
--   * visibility (public | private | restricted) on game_servers
--   * lifetime (temporary | persistent) on game_servers
--   * invite_code (unique join code) — required for private/restricted servers
--   * password_hash — bcrypt; required for password-protected servers
--   * allowlist — JSONB array of usernames permitted in restricted servers
--   * expires_at — tick-interval-style expiration for "lobby session" temporary servers
--   * tick_interval_ms — sync cadence per server
--   * max_players — cap concurrent human members
--   * server_members — explicit table tracking human players per server
--
-- All ADD statements are IF NOT EXISTS so this file is idempotent.
-- Safe to re-run.

ALTER TABLE public.game_servers
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'restricted'));

ALTER TABLE public.game_servers
  ADD COLUMN IF NOT EXISTS lifetime text NOT NULL DEFAULT 'temporary'
    CHECK (lifetime IN ('temporary', 'persistent'));

ALTER TABLE public.game_servers
  ADD COLUMN IF NOT EXISTS invite_code text UNIQUE;

ALTER TABLE public.game_servers
  ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE public.game_servers
  ADD COLUMN IF NOT EXISTS allowlist jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.game_servers
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.game_servers
  ADD COLUMN IF NOT EXISTS tick_interval_ms integer NOT NULL DEFAULT 30000;

ALTER TABLE public.game_servers
  ADD COLUMN IF NOT EXISTS max_players integer NOT NULL DEFAULT 8;

CREATE INDEX IF NOT EXISTS game_servers_visibility_idx
  ON public.game_servers (visibility, status);

CREATE INDEX IF NOT EXISTS game_servers_invite_code_idx
  ON public.game_servers (invite_code);

CREATE TABLE IF NOT EXISTS public.server_members (
  server_id  uuid NOT NULL REFERENCES public.game_servers(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (server_id, user_id)
);

CREATE INDEX IF NOT EXISTS server_members_user_idx
  ON public.server_members (user_id);
