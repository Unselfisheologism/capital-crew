import Phaser from 'phaser';
import './auth/AuthUI.css';
import './auth/RoleUI.css';
import './servers/ServerUI.css';
import './ui/MobileControls.css';
import { ensureAuth, logoutAndReauth } from './auth/AuthUI';
import { showRolePicker, PRACTICE_MODE_ID } from './auth/RoleUI';
import { showServerLobby, type ServerLobbyResult } from './servers/ServerUI';
import {
  setupOrientationLockEarly,
} from './ui/MobileControls';
import { GameScene } from './scenes/GameScene';

// Install the orientation lock BEFORE the auth UI shows so the
// user sees the rotate-device card at first sight in portrait.
setupOrientationLockEarly();

// ── Error boundary: catch uncaught errors and show crash recovery UI ──
window.onerror = (msg, source, lineno, colno, error) => {
  showCrashOverlay(`JS Error: ${msg}`);
  console.error('[ErrorBoundary]', msg, source, lineno, colno, error);
  return true; // prevent default browser error dialog
};
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const msg = reason instanceof Error ? reason.message : String(reason);
  showCrashOverlay(`Unhandled Promise: ${msg}`);
  console.error('[ErrorBoundary] unhandled rejection:', reason);
});

function showCrashOverlay(message: string): void {
  if (document.getElementById('cc-crash-overlay')) return; // already shown
  const overlay = document.createElement('div');
  overlay.id = 'cc-crash-overlay';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:99999;
    background:rgba(8,8,24,0.95);
    display:flex;align-items:center;justify-content:center;
    font-family:Inter,system-ui,sans-serif;color:#e8e8f0;
    padding:24px;text-align:center;
  `;
  overlay.innerHTML = `
    <div style="max-width:400px">
      <div style="font-size:48px;margin-bottom:16px">💥</div>
      <div style="font-size:18px;font-weight:800;color:#ff6666;margin-bottom:12px">GAME CRASHED</div>
      <div style="font-size:13px;color:#999;margin-bottom:20px;line-height:1.5">${message.replace(/</g, '&lt;')}</div>
      <button id="cc-crash-reload" style="
        background:rgba(255,100,100,0.2);border:1px solid rgba(255,100,100,0.4);
        color:#ff8888;padding:10px 28px;border-radius:8px;font-size:14px;
        font-weight:700;cursor:pointer;letter-spacing:1px
      ">🔄 RELOAD</button>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#cc-crash-reload')!.addEventListener('click', () => {
    window.location.reload();
  });
}

async function bootstrap() {
  const user = await ensureAuth();
  if (!user) {
    restartAuthLoop();
    return;
  }
  const win = window as unknown as {
    __capcrewUser: unknown;
    __capcrewRole: string;
    __capcrewGame?: Phaser.Game;
    __capcrewServer?: unknown;
  };
  win.__capcrewUser = user;

  // ── Server Lobby ──
  const lobbyResult: ServerLobbyResult = await showServerLobby(user);

  if (lobbyResult.mode === 'server' && lobbyResult.server) {
    // Server mode — store server context, skip role picker
    win.__capcrewServer = lobbyResult.server;
    win.__capcrewRole = '__PRACTICE__'; // server mode uses multiplayer logic
  } else {
    // Solo mode — show role picker as before
    const role = await showRolePicker();
    win.__capcrewRole = role === PRACTICE_MODE_ID ? '__PRACTICE__' : role;
  }

  // ── Viewport config ──
  // Always landscape (1024×768), even on phones — Phaser Scale RESIZE fits it
  // to the actual viewport. The orientation lock prevents this on portrait phones.
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-container',
    width: 1024,
    height: 768,
    backgroundColor: '#080818',
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };
  const game = new Phaser.Game(config);
  win.__capcrewGame = game;

  // Relayout on rotation / resize
  window.addEventListener('resize', () => onResize(game));
  window.addEventListener('orientationchange', () => onResize(game));
}

function restartAuthLoop(): void {
  setTimeout(() => {
    void logoutAndReauth().then((u) => {
      if (u) window.location.reload();
      else restartAuthLoop();
    });
  }, 200);
}

function onResize(game: Phaser.Game): void {
  game.scale.refresh();
}

void bootstrap();
