/**
 * Capital Crew — SERVER LOBBY UI
 *
 * Full DOM overlay between auth and game start.
 * Three-phase UX:
 *   1) Browser — list public servers / join by code / create new
 *   2) Lobby   — members list, chat-like status, admin controls
 *   3) Returns the server context so GameScene can use it
 */
import type { AuthUser } from '../auth/AuthClient';
import {
  createServer,
  listServers,
  joinServer,
  leaveServer,
  kickPlayer,
  updateServerSettings,
  deleteServer,
  regenerateInvite,
  listMembers,
  type ServerRecord,
  type MemberRecord,
  type Visibility,
  type Lifetime,
} from './ServerClient';
import { hashPassword } from '../auth/AuthClient';
import { getSupabase } from '../supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

/* ───────────────────── types ───────────────────── */

export interface ServerLobbyResult {
  mode: 'server' | 'solo';
  server?: ServerRecord;
}

interface LobbyState {
  user: AuthUser;
  currentServer: ServerRecord | null;
  members: MemberRecord[];
  pollTimer: ReturnType<typeof setInterval> | null;
  presenceChannel: RealtimeChannel | null;
}

/* ───────────────────── export ───────────────────── */

export async function showServerLobby(
  user: AuthUser,
): Promise<ServerLobbyResult> {
  document.getElementById('cc-srv-overlay')?.remove();

  return new Promise<ServerLobbyResult>((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'cc-srv-overlay';
    overlay.className = 'cc-srv-root';
    document.body.appendChild(overlay);

    const state: LobbyState = {
      user,
      currentServer: null,
      members: [],
      pollTimer: null,
      presenceChannel: null,
    };

    function destroy(): void {
      if (state.pollTimer) clearInterval(state.pollTimer);
      if (state.presenceChannel) {
        void state.presenceChannel.untrack();
        void getSupabase().removeChannel(state.presenceChannel);
        state.presenceChannel = null;
      }
      overlay.remove();
    }

    function render(): void {
      overlay.innerHTML = '';
      if (state.currentServer) {
        renderLobby(overlay, state, resolve, destroy);
      } else {
        renderBrowser(overlay, state, resolve, destroy);
      }
    }

    render();
  });
}

/* ═══════════════════════════════════════════════════════
   PHASE 1: BROWSER
   ═══════════════════════════════════════════════════════ */

function renderBrowser(
  root: HTMLElement,
  state: LobbyState,
  resolve: (r: ServerLobbyResult) => void,
  destroy: () => void,
): void {
  root.innerHTML = `
    <div class="cc-srv-header">
      <div class="cc-srv-title">🌐 GAME SERVERS</div>
      <div class="cc-srv-subtitle">Browse, create, or join a server</div>
      <div class="cc-srv-tabs">
        <button class="cc-srv-tab cc-srv-tab-active" data-tab="browse">Browse</button>
        <button class="cc-srv-tab" data-tab="create">Create</button>
        <button class="cc-srv-tab" data-tab="joincode">Join Code</button>
      </div>
    </div>
    <div class="cc-srv-body" id="cc-srv-body"></div>
    <div class="cc-srv-body" style="padding-top:0">
      <div class="cc-srv-actions-row">
        <button class="cc-srv-btn cc-srv-btn-danger" id="cc-srv-solo-btn">🎮 Play Solo</button>
      </div>
    </div>
  `;

  const body = root.querySelector<HTMLElement>('#cc-srv-body')!;
  const tabs = root.querySelectorAll<HTMLButtonElement>('.cc-srv-tab');

  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.remove('cc-srv-tab-active'));
      t.classList.add('cc-srv-tab-active');
      const tab = t.dataset.tab!;
      if (tab === 'browse') renderBrowseTab(body, state, resolve, destroy);
      else if (tab === 'create') renderCreateTab(body, state, resolve, destroy);
      else if (tab === 'joincode') renderJoinCodeTab(body, state, resolve, destroy);
    });
  });

  root.querySelector('#cc-srv-solo-btn')!.addEventListener('click', () => {
    destroy();
    resolve({ mode: 'solo' });
  });

  renderBrowseTab(body, state, resolve, destroy);
}

/* ── Browse Tab ── */

async function renderBrowseTab(
  body: HTMLElement,
  state: LobbyState,
  resolve: (r: ServerLobbyResult) => void,
  destroy: () => void,
): Promise<void> {
  body.innerHTML = '<div class="cc-srv-empty">Loading servers…</div>';

  const res = await listServers({ filter: 'all', user: state.user });
  if (!res.ok) {
    body.innerHTML = `<div class="cc-srv-error cc-srv-error-show">${esc(res.error)}</div>`;
    return;
  }

  const servers = res.data.servers;
  if (servers.length === 0) {
    body.innerHTML = `
      <div class="cc-srv-empty">
        <div style="font-size:32px;margin-bottom:12px">🌍</div>
        No servers found. Create one or join with a code!
      </div>
    `;
    return;
  }

  body.innerHTML = '';
  for (const srv of servers) {
    const card = document.createElement('div');
    card.className = 'cc-srv-card';

    const visBadge = srv.visibility === 'public' ? 'cc-srv-badge-public'
      : srv.visibility === 'private' ? 'cc-srv-badge-private'
      : 'cc-srv-badge-restricted';

    const lifeBadge = srv.lifetime === 'temporary' ? 'cc-srv-badge-temp' : 'cc-srv-badge-persistent';
    const pwIcon = srv.has_password ? '🔒' : '';
    const isFull = srv.player_count >= srv.max_players;

    let browseDisabled = isFull;
    let browseLabel = 'JOIN';
    browseDisabled ||= !state.user;
    if (!browseDisabled && !srv.is_host) {
      if (srv.visibility === 'private') {
        browseDisabled = true;
        browseLabel = 'Private';
      } else if (srv.visibility === 'restricted' && !srv.allowlist.includes(state.user.username)) {
        browseDisabled = true;
        browseLabel = 'Invite Only';
      }
    }
    const joinBtnHTML = browseDisabled
      ? `<button class="cc-srv-btn" disabled>${browseLabel}${isFull ? ' · Full' : ''}</button>`
      : `<button class="cc-srv-btn cc-srv-btn-success" data-join="${srv.id}">${browseLabel || 'JOIN'}</button>`;

    card.innerHTML = `
      <div class="cc-srv-card-info">
        <div class="cc-srv-card-name">
          ${esc(srv.name)}
          ${srv.is_host ? '<span class="cc-srv-badge cc-srv-badge-host">HOST</span>' : ''}
        </div>
        <div class="cc-srv-card-meta">
          <span class="cc-srv-badge ${visBadge}">${srv.visibility}</span>
          <span class="cc-srv-badge ${lifeBadge}">${srv.lifetime}</span>
          ${pwIcon}
          ${srv.host_username ? `by ${esc(srv.host_username)}` : ''}
          · ${srv.player_count}/${srv.max_players} players
        </div>
      </div>
      <div class="cc-srv-card-actions">
        ${joinBtnHTML}
      </div>
    `;

    const joinBtn = card.querySelector<HTMLButtonElement>('[data-join]');
    if (joinBtn) {
      joinBtn.addEventListener('click', async () => {
        joinBtn.disabled = true;
        joinBtn.textContent = 'JOINING…';
        const jr = await joinServer({
          user: state.user,
          server_id: srv.id,
        });
        if (!jr.ok) {
          if (jr.error.includes('password')) {
            const pw = prompt('This server requires a password:');
            if (pw) {
              const hash = await hashPassword(pw);
              const jr2 = await joinServer({ user: state.user, server_id: srv.id, password_hash: hash });
              if (jr2.ok) {
                state.currentServer = jr2.data.server;
                destroy();
                resolve({ mode: 'server', server: jr2.data.server });
                return;
              }
            }
            joinBtn.disabled = false;
            joinBtn.textContent = 'JOIN';
          } else {
            alert(jr.error);
            joinBtn.disabled = false;
            joinBtn.textContent = 'JOIN';
          }
          return;
        }
        state.currentServer = jr.data.server;
        destroy();
        resolve({ mode: 'server', server: jr.data.server });
      });
    }

    body.appendChild(card);
  }
}

/* ── Create Tab ── */

function renderCreateTab(
  body: HTMLElement,
  state: LobbyState,
  resolve: (r: ServerLobbyResult) => void,
  destroy: () => void,
): void {
  body.innerHTML = `
    <div class="cc-srv-card" style="flex-direction:column;gap:14px">
      <div class="cc-srv-field">
        <label>Server Name</label>
        <input class="cc-srv-input" id="cc-create-name" maxlength="40" placeholder="My Awesome Server" />
      </div>

      <div class="cc-srv-field">
        <label>Visibility</label>
        <div class="cc-srv-radio-group">
          <label class="cc-srv-radio cc-srv-radio-active" data-vis="public">
            <input type="radio" name="visibility" value="public" checked /> 🌍 Public
          </label>
          <label class="cc-srv-radio" data-vis="private">
            <input type="radio" name="visibility" value="private" /> 🔒 Private
          </label>
          <label class="cc-srv-radio" data-vis="restricted">
            <input type="radio" name="visibility" value="restricted" /> 🚫 Restricted
          </label>
        </div>
      </div>

      <div class="cc-srv-field">
        <label>Lifetime</label>
        <div class="cc-srv-radio-group">
          <label class="cc-srv-radio cc-srv-radio-active" data-life="temporary">
            <input type="radio" name="lifetime" value="temporary" checked /> ⏳ Temporary
          </label>
          <label class="cc-srv-radio" data-life="persistent">
            <input type="radio" name="lifetime" value="persistent" /> ♾️ Persistent
          </label>
        </div>
      </div>

      <div class="cc-srv-field" id="cc-create-expiry-row">
        <label>Expires In (hours)</label>
        <input class="cc-srv-input" id="cc-create-expiry" type="number" min="1" max="720" value="24" />
      </div>

      <div class="cc-srv-field">
        <label>Max Players</label>
        <input class="cc-srv-input" id="cc-create-max" type="number" min="2" max="20" value="8" />
      </div>

      <div class="cc-srv-field">
        <label>Server Password (optional)</label>
        <input class="cc-srv-input" id="cc-create-pw" type="password" placeholder="Leave blank for no password" />
      </div>

      <div class="cc-srv-error" id="cc-create-error"></div>

      <div class="cc-srv-actions-row">
        <button class="cc-srv-btn cc-srv-btn-primary" id="cc-create-submit">🚀 Create Server</button>
      </div>
    </div>
  `;

  // Radio styling
  body.querySelectorAll<HTMLElement>('.cc-srv-radio').forEach((r) => {
    r.addEventListener('click', () => {
      const group = r.closest('.cc-srv-radio-group')!;
      group.querySelectorAll('.cc-srv-radio').forEach((x) => x.classList.remove('cc-srv-radio-active'));
      r.classList.add('cc-srv-radio-active');
      r.querySelector<HTMLInputElement>('input')!.checked = true;
    });
  });

  // Toggle expiry row
  const lifeRadios = body.querySelectorAll<HTMLInputElement>('input[name="lifetime"]');
  const expiryRow = body.querySelector<HTMLElement>('#cc-create-expiry-row')!;
  lifeRadios.forEach((r) => {
    r.addEventListener('change', () => {
      expiryRow.style.display = r.value === 'persistent' ? 'none' : '';
    });
  });

  // Submit
  body.querySelector('#cc-create-submit')!.addEventListener('click', async () => {
    const btn = body.querySelector<HTMLButtonElement>('#cc-create-submit')!;
    const errBox = body.querySelector<HTMLElement>('#cc-create-error')!;
    const name = (body.querySelector<HTMLInputElement>('#cc-create-name')!.value || '').trim();
    const vis = (body.querySelector<HTMLInputElement>('input[name="visibility"]:checked')?.value ?? 'public') as Visibility;
    const life = (body.querySelector<HTMLInputElement>('input[name="lifetime"]:checked')?.value ?? 'temporary') as Lifetime;
    const maxP = parseInt(body.querySelector<HTMLInputElement>('#cc-create-max')!.value || '8', 10);
    const pw = body.querySelector<HTMLInputElement>('#cc-create-pw')!.value;
    const expiryH = parseInt(body.querySelector<HTMLInputElement>('#cc-create-expiry')!.value || '24', 10);

    if (!name) { errBox.textContent = 'Enter a server name'; errBox.classList.add('cc-srv-error-show'); return; }
    if (name.length > 40) { errBox.textContent = 'Name too long (max 40 chars)'; errBox.classList.add('cc-srv-error-show'); return; }

    btn.disabled = true;
    btn.textContent = 'CREATING…';
    errBox.classList.remove('cc-srv-error-show');

    let pwHash: string | null = null;
    if (pw && pw.length >= 6) {
      pwHash = await hashPassword(pw);
    }

    const res = await createServer({
      user: state.user,
      name,
      visibility: vis,
      lifetime: life,
      password: pwHash ?? undefined,
      maxPlayers: maxP,
      tickIntervalMs: 30000,
      expiresInHours: life === 'temporary' ? expiryH : undefined,
    });

    if (!res.ok) {
      errBox.textContent = res.error;
      errBox.classList.add('cc-srv-error-show');
      btn.disabled = false;
      btn.textContent = '🚀 Create Server';
      return;
    }

    state.currentServer = res.data.server;
    destroy();
    resolve({ mode: 'server', server: res.data.server });
  });
}

/* ── Join by Code Tab ── */

function renderJoinCodeTab(
  body: HTMLElement,
  state: LobbyState,
  resolve: (r: ServerLobbyResult) => void,
  destroy: () => void,
): void {
  body.innerHTML = `
    <div class="cc-srv-card" style="flex-direction:column;gap:14px">
      <div class="cc-srv-field">
        <label>Invite Code</label>
        <input class="cc-srv-input" id="cc-join-code" maxlength="5" placeholder="5-character code (e.g. A3K9Z)" style="text-transform:uppercase;letter-spacing:4px;font-size:20px;text-align:center" />
      </div>
      <div class="cc-srv-error" id="cc-join-error"></div>
      <div class="cc-srv-actions-row">
        <button class="cc-srv-btn cc-srv-btn-primary" id="cc-join-submit">🔗 Join Server</button>
      </div>
    </div>
  `;

  body.querySelector('#cc-join-submit')!.addEventListener('click', async () => {
    const btn = body.querySelector<HTMLButtonElement>('#cc-join-submit')!;
    const errBox = body.querySelector<HTMLElement>('#cc-join-error')!;
    const code = (body.querySelector<HTMLInputElement>('#cc-join-code')!.value || '').trim().toUpperCase();

    if (!code || code.length < 3) { errBox.textContent = 'Enter a valid invite code'; errBox.classList.add('cc-srv-error-show'); return; }

    btn.disabled = true;
    btn.textContent = 'JOINING…';
    errBox.classList.remove('cc-srv-error-show');

    const res = await joinServer({ user: state.user, invite_code: code });
    if (!res.ok) {
      if (res.error.includes('password')) {
        const pw = prompt('This server requires a password:');
        if (pw) {
          const hash = await hashPassword(pw);
          const res2 = await joinServer({ user: state.user, invite_code: code, password_hash: hash });
          if (res2.ok) {
            state.currentServer = res2.data.server;
            destroy();
            resolve({ mode: 'server', server: res2.data.server });
            return;
          }
          errBox.textContent = res2.error;
          errBox.classList.add('cc-srv-error-show');
        }
        btn.disabled = false;
        btn.textContent = '🔗 Join Server';
        return;
      }
      errBox.textContent = res.error;
      errBox.classList.add('cc-srv-error-show');
      btn.disabled = false;
      btn.textContent = '🔗 Join Server';
      return;
    }

    state.currentServer = res.data.server;
    destroy();
    resolve({ mode: 'server', server: res.data.server });
  });
}

/* ═══════════════════════════════════════════════════════
   PHASE 2: LOBBY (after joining a server)
   ═══════════════════════════════════════════════════════ */

async function renderLobby(
  root: HTMLElement,
  state: LobbyState,
  resolve: (r: ServerLobbyResult) => void,
  destroy: () => void,
): Promise<void> {
  const srv = state.currentServer!;
  const isHost = srv.host_user_id === state.user.id;

  root.innerHTML = `
    <div class="cc-srv-header">
      <div class="cc-srv-title">${esc(srv.name)}</div>
      <div class="cc-srv-subtitle">
        ${srv.visibility.toUpperCase()} · ${srv.lifetime}
        ${srv.has_password ? ' · 🔒 Password' : ''}
        ${srv.invite_code ? ` · Code: <strong style="color:#ffd700">${esc(srv.invite_code)}</strong>` : ''}
        · ${srv.player_count}/${srv.max_players} players
      </div>
      <div class="cc-srv-tabs">
        <button class="cc-srv-tab cc-srv-tab-active" data-tab="lobby">Lobby</button>
        ${isHost ? '<button class="cc-srv-tab" data-tab="admin">Admin</button>' : ''}
      </div>
    </div>
    <div class="cc-srv-body" id="cc-srv-lobby-body"></div>
  `;

  const body = root.querySelector<HTMLElement>('#cc-srv-lobby-body')!;
  const tabs = root.querySelectorAll<HTMLButtonElement>('.cc-srv-tab');

  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.remove('cc-srv-tab-active'));
      t.classList.add('cc-srv-tab-active');
      if (t.dataset.tab === 'lobby') renderLobbyTab(body, state, resolve, destroy);
      else if (t.dataset.tab === 'admin') renderAdminTab(body, state, resolve, destroy);
    });
  });

  if (state.pollTimer) clearInterval(state.pollTimer);
  if (state.pollTimer) clearInterval(state.pollTimer);
  // ── SUPABASE REALTIME — join presence channel for live member updates ──
  const srvId = state.currentServer?.id;
  if (!srvId) {
    // Defensive — should never happen since we render lobby only when joined
    return;
  }

  if (state.presenceChannel) {
    void getSupabase().removeChannel(state.presenceChannel);
    state.presenceChannel = null;
  }
  const channel = getSupabase().channel(`server:${srvId}`, {
    config: { presence: { key: state.user.id } },
  });
  state.presenceChannel = channel;

  const onPresenceRefresh = () => {
    if (root.querySelector('.cc-srv-tab-active')?.getAttribute('data-tab') === 'lobby') {
      renderLobbyTab(body, state, resolve, destroy);
    }
  };

  channel
    .on('presence', { event: 'sync' }, onPresenceRefresh)
    .on('presence', { event: 'join' }, onPresenceRefresh)
    .on('presence', { event: 'leave' }, onPresenceRefresh);

  void channel.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({
        userId: state.user.id,
        username: state.user.username,
        online_at: Date.now(),
      });
      // Best-effort initial fetch (in case presence is slow)
      await refreshMembers(state);
      onPresenceRefresh();
    }
  });

  // Members row changes (Postgres changes) — if backend writes
  // server_members rows on join/leave, that triggers instant updates
  getSupabase()
    .channel(`server-members:${srvId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'server_members' }, async () => {
      await refreshMembers(state);
      onPresenceRefresh();
    })
    .subscribe();
  renderLobbyTab(body, state, resolve, destroy);
}
async function refreshMembers(state: LobbyState): Promise<void> {
  if (!state.currentServer) return;
  const res = await listMembers({ user: state.user, server_id: state.currentServer.id });
  if (res.ok) state.members = res.data.members;
}

function renderLobbyTab(
  body: HTMLElement,
  state: LobbyState,
  resolve: (r: ServerLobbyResult) => void,
  destroy: () => void,
): void {
  const srv = state.currentServer!;
  const isHost = srv.host_user_id === state.user.id;

  let membersHtml = '';
  if (state.members.length === 0) {
    membersHtml = '<div class="cc-srv-empty">No players yet…</div>';
  } else {
    for (const m of state.members) {
      const isMe = m.user_id === state.user.id;
      membersHtml += `
        <div class="cc-srv-card" style="margin-bottom:8px;padding:10px 14px">
          <div class="cc-srv-card-info">
            <div class="cc-srv-card-name">
              ${esc(m.username)}
              ${m.is_host ? '<span class="cc-srv-badge cc-srv-badge-host">HOST</span>' : ''}
              ${isMe ? '<span class="cc-srv-badge" style="background:rgba(0,200,255,0.3);color:#00ccff">YOU</span>' : ''}
            </div>
          </div>
          <div class="cc-srv-card-actions">
            ${isHost && !isMe ? `<button class="cc-srv-btn cc-srv-btn-danger" data-kick="${m.user_id}">KICK</button>` : ''}
          </div>
        </div>
      `;
    }
  }

  body.innerHTML = `
    <div style="margin-bottom:14px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-weight:800;font-size:14px;letter-spacing:1px;color:#aaa">PLAYERS</div>
        <div style="font-size:12px;color:#666">Auto-refreshing…</div>
        <div style="font-size:12px;color:#00cc88">● Live</div>
      </div>
      ${membersHtml}
    </div>

    <div class="cc-srv-actions-row">
      <button class="cc-srv-btn cc-srv-btn-danger" id="cc-lobby-leave">🚪 Leave Server</button>
      ${isHost ? '<button class="cc-srv-btn cc-srv-btn-primary" id="cc-lobby-start">🎮 Start Game</button>' : ''}
      <button class="cc-srv-btn" id="cc-lobby-copy">🔗 Copy Invite</button>
    </div>
  `;

  body.querySelectorAll<HTMLButtonElement>('[data-kick]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Kick this player?')) return;
      btn.disabled = true;
      await kickPlayer({
        host: state.user,
        server_id: srv.id,
        target_user_id: btn.dataset.kick!,
      });
      await refreshMembers(state);
      renderLobbyTab(body, state, resolve, destroy);
    });
  });

  body.querySelector('#cc-lobby-leave')!.addEventListener('click', async () => {
    if (!confirm('Leave this server?')) return;
    await leaveServer({ user: state.user, server_id: srv.id });
    state.currentServer = null;
    state.members = [];
    if (state.pollTimer) clearInterval(state.pollTimer);
    destroy();
    resolve({ mode: 'solo' });
  });

  body.querySelector('#cc-lobby-copy')?.addEventListener('click', async () => {
    const code = srv.invite_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      prompt('Copy this invite code:', code);
    }
  });

  const startBtn = body.querySelector('#cc-lobby-start');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      if (!confirm('Start the game for all players?')) return;
      startBtn.textContent = 'STARTING…';
      (startBtn as HTMLButtonElement).disabled = true;

      await updateServerSettings({
        host: state.user,
        server_id: srv.id,
        settings: { status: 'playing' },
      });

      if (state.pollTimer) clearInterval(state.pollTimer);
      destroy();
      resolve({ mode: 'server', server: { ...srv, status: 'playing' } });
    });
  }
}

/* ── Admin Tab (host only) ── */

function renderAdminTab(
  body: HTMLElement,
  state: LobbyState,
  resolve: (r: ServerLobbyResult) => void,
  destroy: () => void,
): void {
  const srv = state.currentServer!;

  body.innerHTML = `
    <div class="cc-srv-card" style="flex-direction:column;gap:14px">
      <div style="font-weight:800;font-size:14px;letter-spacing:1px;color:#ffd700;margin-bottom:4px">⚙️ SERVER SETTINGS</div>

      <div class="cc-srv-row">
        <div class="cc-srv-field">
          <label>Server Name</label>
          <input class="cc-srv-input" id="cc-admin-name" value="${esc(srv.name)}" maxlength="40" />
        </div>
        <div class="cc-srv-field">
          <label>Max Players</label>
          <input class="cc-srv-input" id="cc-admin-max" type="number" min="2" max="20" value="${srv.max_players}" />
        </div>
      </div>

      <div class="cc-srv-field">
        <label>Visibility</label>
        <div class="cc-srv-radio-group">
          <label class="cc-srv-radio ${srv.visibility === 'public' ? 'cc-srv-radio-active' : ''}" data-vis="public">
            <input type="radio" name="admin-vis" value="public" ${srv.visibility === 'public' ? 'checked' : ''} /> 🌍 Public
          </label>
          <label class="cc-srv-radio ${srv.visibility === 'private' ? 'cc-srv-radio-active' : ''}" data-vis="private">
            <input type="radio" name="admin-vis" value="private" ${srv.visibility === 'private' ? 'checked' : ''} /> 🔒 Private
          </label>
          <label class="cc-srv-radio ${srv.visibility === 'restricted' ? 'cc-srv-radio-active' : ''}" data-vis="restricted">
            <input type="radio" name="admin-vis" value="restricted" ${srv.visibility === 'restricted' ? 'checked' : ''} /> 🚫 Restricted
          </label>
        </div>
      </div>

      <div class="cc-srv-row">
        <div class="cc-srv-field">
          <label>Lifetime</label>
          <div class="cc-srv-radio-group">
            <label class="cc-srv-radio ${srv.lifetime === 'temporary' ? 'cc-srv-radio-active' : ''}">
              <input type="radio" name="admin-life" value="temporary" ${srv.lifetime === 'temporary' ? 'checked' : ''} /> ⏳ Temporary
            </label>
            <label class="cc-srv-radio ${srv.lifetime === 'persistent' ? 'cc-srv-radio-active' : ''}">
              <input type="radio" name="admin-life" value="persistent" ${srv.lifetime === 'persistent' ? 'checked' : ''} /> ♾️ Persistent
            </label>
          </div>
        </div>
      </div>

      <div class="cc-srv-field">
        <label>Invite Code</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="cc-srv-input" id="cc-admin-invite" value="${esc(srv.invite_code ?? '')}" readonly style="flex:1;font-family:monospace;letter-spacing:3px" />
          <button class="cc-srv-btn" id="cc-admin-regen">🔄 Regen</button>
          <button class="cc-srv-btn" id="cc-admin-copy">📋 Copy</button>
        </div>
      </div>

      <div class="cc-srv-field">
        <label>Set Password</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="cc-srv-input" id="cc-admin-pw" type="password" placeholder="Leave blank to remove password" style="flex:1" />
          <button class="cc-srv-btn" id="cc-admin-pw-set">💾 Set</button>
        </div>
      </div>

      <div class="cc-srv-error" id="cc-admin-error"></div>
      <div class="cc-srv-success" id="cc-admin-success" style="display:none"></div>

      <div class="cc-srv-actions-row" style="margin-top:8px">
        <button class="cc-srv-btn cc-srv-btn-primary" id="cc-admin-save">💾 Save Settings</button>
        <button class="cc-srv-btn cc-srv-btn-danger" id="cc-admin-delete">🗑️ Delete Server</button>
      </div>
    </div>
  `;

  // Radio styling
  body.querySelectorAll<HTMLElement>('.cc-srv-radio').forEach((r) => {
    r.addEventListener('click', () => {
      const group = r.closest('.cc-srv-radio-group')!;
      group.querySelectorAll('.cc-srv-radio').forEach((x) => x.classList.remove('cc-srv-radio-active'));
      r.classList.add('cc-srv-radio-active');
      r.querySelector<HTMLInputElement>('input')!.checked = true;
    });
  });

  // Save settings
  body.querySelector('#cc-admin-save')!.addEventListener('click', async () => {
    const errBox = body.querySelector<HTMLElement>('#cc-admin-error')!;
    const okBox = body.querySelector<HTMLElement>('#cc-admin-success')!;
    errBox.classList.remove('cc-srv-error-show');
    okBox.style.display = 'none';

    const name = (body.querySelector<HTMLInputElement>('#cc-admin-name')!.value || '').trim();
    const maxP = parseInt(body.querySelector<HTMLInputElement>('#cc-admin-max')!.value || '8', 10);
    const vis = (body.querySelector<HTMLInputElement>('input[name="admin-vis"]:checked')?.value ?? srv.visibility) as Visibility;
    const life = (body.querySelector<HTMLInputElement>('input[name="admin-life"]:checked')?.value ?? srv.lifetime) as Lifetime;

    const res = await updateServerSettings({
      host: state.user,
      server_id: srv.id,
      settings: { name, max_players: maxP, visibility: vis, lifetime: life },
    });

    if (!res.ok) {
      errBox.textContent = res.error;
      errBox.classList.add('cc-srv-error-show');
      return;
    }

    state.currentServer = res.data.server;
    okBox.textContent = '✅ Settings saved!';
    okBox.style.display = 'block';
    setTimeout(() => { okBox.style.display = 'none'; }, 2000);
  });

  // Regenerate invite
  body.querySelector('#cc-admin-regen')!.addEventListener('click', async () => {
    const res = await regenerateInvite({ host: state.user, server_id: srv.id });
    if (res.ok) {
      state.currentServer = { ...srv, invite_code: res.data.invite_code };
      const input = body.querySelector<HTMLInputElement>('#cc-admin-invite')!;
      input.value = res.data.invite_code;
    }
  });

  // Copy invite
  body.querySelector('#cc-admin-copy')!.addEventListener('click', () => {
    const code = body.querySelector<HTMLInputElement>('#cc-admin-invite')!.value;
    if (code) {
      navigator.clipboard.writeText(code).then(() => {
        const btn = body.querySelector<HTMLButtonElement>('#cc-admin-copy')!;
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy'; }, 1500);
      });
    }
  });

  // Set password
  body.querySelector('#cc-admin-pw-set')!.addEventListener('click', async () => {
    const pw = body.querySelector<HTMLInputElement>('#cc-admin-pw')!.value;
    const errBox = body.querySelector<HTMLElement>('#cc-admin-error')!;
    errBox.classList.remove('cc-srv-error-show');

    let pwHash: string | null = null;
    let hasPw = false;
    if (pw && pw.length >= 6) {
      pwHash = await hashPassword(pw);
      hasPw = true;
    }

    const res = await updateServerSettings({
      host: state.user,
      server_id: srv.id,
      settings: { has_password: hasPw, password_hash: pwHash ?? null },
    });

    if (res.ok) {
      state.currentServer = res.data.server;
      body.querySelector<HTMLInputElement>('#cc-admin-pw')!.value = '';
      const okBox = body.querySelector<HTMLElement>('#cc-admin-success')!;
      okBox.textContent = hasPw ? '✅ Password set!' : '✅ Password removed!';
      okBox.style.display = 'block';
      setTimeout(() => { okBox.style.display = 'none'; }, 2000);
    } else {
      errBox.textContent = res.error;
      errBox.classList.add('cc-srv-error-show');
    }
  });

  // Delete server
  body.querySelector('#cc-admin-delete')!.addEventListener('click', async () => {
    if (!confirm('DELETE this server? This cannot be undone!')) return;
    if (!confirm('Are you ABSOLUTELY sure?')) return;

    const res = await deleteServer({ host: state.user, server_id: srv.id });
    if (res.ok) {
      state.currentServer = null;
      state.members = [];
      if (state.pollTimer) clearInterval(state.pollTimer);
      destroy();
      resolve({ mode: 'solo' });
    } else {
      const errBox = body.querySelector<HTMLElement>('#cc-admin-error')!;
      errBox.textContent = res.error;
      errBox.classList.add('cc-srv-error-show');
    }
  });
}

/* ── Utility ── */

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
