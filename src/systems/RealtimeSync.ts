/**
 * Capital Crew — REALTIME SYNC
 *
 * Manages Supabase Realtime channels for in-game multiplayer synchronization.
 *
 * Architecture:
 *   1. POSITION BROADCAST — fire-and-forget, ~10x/sec per player.
 *      Each client broadcasts their x/y; others interpolate.
 *   2. GAME EVENTS — broadcast for immediate delivery (emergency, sabotage, trade, chat).
 *   3. TICK SYNC — broadcast after each tick with the player's economic state.
 *   4. PRESENCE — lobby online status, player join/leave tracking.
 *
 * All channels are scoped to a server_id (the game_servers UUID).
 */
import { getSupabase } from '../supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

/* ───────────────────── types ───────────────────── */

export interface PositionPayload {
  userId: string;
  x: number;
  y: number;
  ts: number;
}

export interface GameEventPayload {
  type:
    | 'emergency_start'
    | 'emergency_fixed'
    | 'emergency_expired'
    | 'sabotage_activate'
    | 'sabotage_expire'
    | 'trade_offer'
    | 'trade_accept'
    | 'trade_reject'
    | 'chat'
    | 'player_kick'
    | 'player_bankrupt'
    | 'player_win'
    | 'game_start'
    | 'game_end';
  from: string;
  data: Record<string, unknown>;
  ts: number;
}

export interface TickSyncPayload {
  userId: string;
  cash: number;
  debt: number;
  netWorth: number;
  propertyIds: string[];
  skillIds: string[];
  tickCount: number;
  alive: boolean;
  bankrupt: boolean;
  won: boolean;
  ts: number;
}

export interface PresenceMeta {
  userId: string;
  username: string;
  colorIndex: number;
  isHost: boolean;
  online_at: number;
}

/* Loose shape for raw presence entries (always has userId + presence_ref) */
interface RawPresence extends Record<string, unknown> {
  presence_ref?: string;
}

/* ───────────────────── event bus ───────────────────── */

type Listener<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private listeners = new Map<string, Set<Listener<any>>>();

  on<K extends keyof Events & string>(event: K, fn: Listener<Events[K]>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  emit<K extends keyof Events & string>(event: K, payload: Events[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }
}

export interface RealtimeEvents extends Record<string, unknown> {
  position: PositionPayload;
  tick_sync: TickSyncPayload;
  game_event: GameEventPayload;
  presence_diff: { joined: PresenceMeta[]; left: PresenceMeta[] };
  presence_sync: PresenceMeta[];
  error: { message: string };
}

/* ───────────────────── main class ───────────────────── */

export class RealtimeSync {
  private channel: RealtimeChannel | null = null;
  private serverId: string = '';
  private userId: string = '';
  private positionThrottleMs = 100; // 10 positions/sec max
  private lastPositionSent = 0;
  private presenceInterval: ReturnType<typeof setInterval> | null = null;

  readonly events = new EventBus<RealtimeEvents>();

  get connected(): boolean {
    return this.channel !== null;
  }

  /**
   * Join a server's realtime channel.
   * Call this when entering a game server lobby or game scene.
   */
  async join(opts: {
    serverId: string;
    userId: string;
    username: string;
    colorIndex: number;
    isHost: boolean;
  }): Promise<void> {
    await this.leave();

    this.serverId = opts.serverId;
    this.userId = opts.userId;

    const supabase = getSupabase();
    const channelName = `server:${opts.serverId}`;

    this.channel = supabase.channel(channelName, {
      config: { presence: { key: opts.userId } },
    });

    // POSITION BROADCAST
    this.channel.on('broadcast', { event: 'position' }, ({ payload }) => {
      const p = payload as unknown as PositionPayload;
      if (p.userId !== this.userId) {
        this.events.emit('position', p);
      }
    });

    // GAME EVENTS BROADCAST
    this.channel.on('broadcast', { event: 'game_event' }, ({ payload }) => {
      const p = payload as unknown as GameEventPayload;
      if (p.from !== this.userId) {
        this.events.emit('game_event', p);
      }
    });

    // TICK SYNC BROADCAST
    this.channel.on('broadcast', { event: 'tick_sync' }, ({ payload }) => {
      const p = payload as unknown as TickSyncPayload;
      if (p.userId !== this.userId) {
        this.events.emit('tick_sync', p);
      }
    });

    // PRESENCE
    this.channel.on('presence', { event: 'sync' }, () => {
      const ch = this.channel;
      if (!ch) return;
      const metas = this.extractPresenceMetas(ch.presenceState());
      this.events.emit('presence_sync', metas);
    });
    this.channel.on('presence', { event: 'join' }, ({ newPresences }) => {
      const metas = this.extractPresenceMetasFromList(
        newPresences as unknown as RawPresence[],
      );
      this.events.emit('presence_diff', { joined: metas, left: [] });
    });
    this.channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      const metas = this.extractPresenceMetasFromList(
        leftPresences as unknown as RawPresence[],
      );
      this.events.emit('presence_diff', { joined: [], left: metas });
    });

    // SUBSCRIBE
    void this.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && this.channel) {
        const presenceData: PresenceMeta = {
          userId: opts.userId,
          username: opts.username,
          colorIndex: opts.colorIndex,
          isHost: opts.isHost,
          online_at: Date.now(),
        };
        await this.channel.track(presenceData);

        const metas = this.extractPresenceMetas(this.channel.presenceState());
        this.events.emit('presence_sync', metas);
      }
    });

    // Periodic heartbeat for UI updates
    this.presenceInterval = setInterval(() => {
      if (!this.channel) return;
      const metas = this.extractPresenceMetas(this.channel.presenceState());
      this.events.emit('presence_sync', metas);
    }, 5000);
  }

  /** Leave the current channel and clean up. */
  async leave(): Promise<void> {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }
    if (this.channel) {
      try {
        await this.channel.untrack();
      } catch {
        /* ignore */
      }
      await getSupabase().removeChannel(this.channel);
      this.channel = null;
    }
    this.serverId = '';
    this.userId = '';
  }

  /* ── SENDERS ── */

  sendPosition(x: number, y: number): void {
    if (!this.channel) return;
    const now = Date.now();
    if (now - this.lastPositionSent < this.positionThrottleMs) return;
    this.lastPositionSent = now;

    this.channel.send({
      type: 'broadcast',
      event: 'position',
      payload: {
        userId: this.userId,
        x,
        y,
        ts: now,
      },
    });
  }

  sendGameEvent(
    type: GameEventPayload['type'],
    data: Record<string, unknown> = {},
  ): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'game_event',
      payload: {
        type,
        from: this.userId,
        data,
        ts: Date.now(),
      },
    });
  }

  sendTickSync(payload: Omit<TickSyncPayload, 'userId' | 'ts'>): void {
    if (!this.channel) return;
    this.channel.send({
      type: 'broadcast',
      event: 'tick_sync',
      payload: {
        ...payload,
        userId: this.userId,
        ts: Date.now(),
      },
    });
  }

  /* ── HELPERS ── */

  getPresentUserIds(): string[] {
    if (!this.channel) return [];
    return this.extractPresenceMetas(this.channel.presenceState()).map(
      (m) => m.userId,
    );
  }

  getPresence(userId: string): PresenceMeta | null {
    if (!this.channel) return null;
    const metas = this.extractPresenceMetas(this.channel.presenceState());
    return metas.find((m) => m.userId === userId) ?? null;
  }

  /* ── PRIVATE ── */

  private extractPresenceMetas(state: Record<string, RawPresence[]>): PresenceMeta[] {
    const metas: PresenceMeta[] = [];
    for (const key of Object.keys(state)) {
      const presences = state[key];
      if (!presences || !Array.isArray(presences)) continue;
      for (const p of presences) {
        if (p && typeof p === 'object' && 'userId' in p) {
          metas.push({
            userId: String(p.userId),
            username: String((p as any).username ?? ''),
            colorIndex: Number((p as any).colorIndex ?? 0),
            isHost: Boolean((p as any).isHost),
            online_at: Number((p as any).online_at ?? 0),
          });
        }
      }
    }
    return metas;
  }

  private extractPresenceMetasFromList(
    presences: RawPresence[],
  ): PresenceMeta[] {
    return presences
      .filter((p) => p && typeof p === 'object' && 'userId' in p)
      .map(
        (p) =>
          ({
            userId: String(p.userId),
            username: String((p as any).username ?? ''),
            colorIndex: Number((p as any).colorIndex ?? 0),
            isHost: Boolean((p as any).isHost),
            online_at: Number((p as any).online_at ?? 0),
          }) satisfies PresenceMeta,
      );
  }
}
