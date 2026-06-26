import Phaser from 'phaser';
import './auth/AuthUI.css';
import './auth/RoleUI.css';
import './ui/MobileControls.css';
import { ensureAuth, logoutAndReauth } from './auth/AuthUI';
import { showRolePicker, PRACTICE_MODE_ID } from './auth/RoleUI';
import {
  setupOrientationLockEarly,
} from './ui/MobileControls';
import { GameScene } from './scenes/GameScene';

// Install the orientation lock BEFORE the auth UI shows so the
// user sees the rotate-device card at first sight in portrait.
setupOrientationLockEarly();

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
  };
  win.__capcrewUser = user;

  // Sub-role picker (always shown post-auth; cached role applies when revisiting)
  const role = await showRolePicker();
  win.__capcrewRole = role === PRACTICE_MODE_ID ? '__PRACTICE__' : role;

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
