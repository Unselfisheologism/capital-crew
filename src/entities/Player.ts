import Phaser from 'phaser';

/** Player colors for each character */
export const PLAYER_COLORS = [0x00ffff, 0xff4444, 0xffaa00, 0xaa44ff];

/** Generates a 3D Among Us-style capsule texture with depth shading */
export function generateCapsuleTexture(
  scene: Phaser.Scene,
  color: number,
  name: string,
): string {
  const texKey = `player_${name}_${color}`;
  if (scene.textures.exists(texKey)) return texKey;

  const w = 26;
  const h = 34;
  const pad = 4; // extra padding for drop shadow
  const g = scene.add.graphics();

  const r = (color >> 16) & 0xff;
  const gv = (color >> 8) & 0xff;
  const b = color & 0xff;

  // Derived palette
  const highlight = Phaser.Display.Color.GetColor(
    Math.min(255, r + 80),
    Math.min(255, gv + 80),
    Math.min(255, b + 80),
  );
  const midtone = Phaser.Display.Color.GetColor(
    Math.min(255, r + 20),
    Math.min(255, gv + 20),
    Math.min(255, b + 20),
  );
  const shadow = Phaser.Display.Color.GetColor(
    Math.max(0, r - 50),
    Math.max(0, gv - 50),
    Math.max(0, b - 50),
  );
  const deepShadow = Phaser.Display.Color.GetColor(
    Math.max(0, r - 90),
    Math.max(0, gv - 90),
    Math.max(0, b - 90),
  );

  // Drop shadow under character (ground shadow)
  g.fillStyle(0x000000, 0.35);
  g.fillEllipse(w / 2 + pad, h - 2 + pad, w - 6, 8);

  // === BODY (bottom-up layering for 3D feel) ===

  // Main body — slightly rounded rectangle with fill
  g.fillStyle(color, 1);
  g.fillRoundedRect(pad, pad + 2, w, h - 2, { tl: 10, tr: 10, bl: 6, br: 6 });

  // 3D shading: left highlight band
  g.fillStyle(highlight, 0.35);
  g.fillRoundedRect(pad + 1, pad + 4, 5, h - 10, { tl: 8, tr: 0, bl: 4, br: 0 });

  // 3D shading: right shadow band
  g.fillStyle(shadow, 0.4);
  g.fillRoundedRect(pad + w - 6, pad + 4, 5, h - 10, { tl: 0, tr: 8, bl: 0, br: 4 });

  // Bottom edge gradient (floor contact shadow)
  g.fillStyle(deepShadow, 0.5);
  g.fillRoundedRect(pad + 2, pad + h - 8, w - 4, 6, { tl: 0, tr: 0, bl: 4, br: 4 });

  // Subtle body outline
  g.lineStyle(1, 0x000000, 0.3);
  g.strokeRoundedRect(pad, pad + 2, w, h - 2, { tl: 10, tr: 10, bl: 6, br: 6 });

  // === VISOR (the iconic Among Us glass) ===
  const vx = pad + 5;
  const vy = pad + 5;
  const vw = w - 6;
  const vh = 12;

  // Visor base (dark)
  g.fillStyle(0x1a3a5c, 1);
  g.fillRoundedRect(vx, vy, vw, vh, 5);

  // Visor glass gradient (top = brighter)
  g.fillStyle(0x4488bb, 0.7);
  g.fillRoundedRect(vx + 1, vy + 1, vw - 2, vh - 3, 4);

  // Visor reflection highlight (the signature glint)
  g.fillStyle(0xaaddff, 0.6);
  g.fillRoundedRect(vx + 3, vy + 2, vw - 8, 4, 3);

  // Small specular dot
  g.fillStyle(0xffffff, 0.8);
  g.fillCircle(vx + vw - 6, vy + 3, 2);

  // Visor outline
  g.lineStyle(1, 0x000000, 0.4);
  g.strokeRoundedRect(vx, vy, vw, vh, 5);

  // === BACKPACK (bump on the back-left side) ===
  const bpX = pad - 3;
  const bpY = pad + 10;
  const bpW = 5;
  const bpH = 14;

  g.fillStyle(shadow, 0.85);
  g.fillRoundedRect(bpX, bpY, bpW, bpH, { tl: 2, tr: 0, bl: 2, br: 0 });

  // Backpack highlight
  g.fillStyle(midtone, 0.3);
  g.fillRect(bpX + 1, bpY + 2, 2, bpH - 4);

  // Backpack outline
  g.lineStyle(1, 0x000000, 0.25);
  g.strokeRoundedRect(bpX, bpY, bpW, bpH, { tl: 2, tr: 0, bl: 2, br: 0 });

  // === LEGS / FEET ===
  const footY = pad + h - 5;
  // Left foot
  g.fillStyle(deepShadow, 0.9);
  g.fillRoundedRect(pad + 4, footY, 7, 4, 2);
  // Right foot
  g.fillRoundedRect(pad + w - 11, footY, 7, 4, 2);

  // Foot highlight (subtle top edge)
  g.fillStyle(color, 0.4);
  g.fillRect(pad + 5, footY, 5, 1);
  g.fillRect(pad + w - 10, footY, 5, 1);

  g.generateTexture(texKey, w + pad * 2, h + pad * 2 + 4);
  g.destroy();
  return texKey;
}

/** Represents the player character with movement and physics */
export class Player {
  public sprite: Phaser.Physics.Arcade.Sprite;
  public body: Phaser.Physics.Arcade.Body;
  public label: Phaser.GameObjects.Text;
  public name: string;
  public color: number;

  /** Movement speed in pixels/second */
  private baseSpeed: number = 160;
  private scene: Phaser.Scene;
  /** Optional mobile joystick vector. When non-null, overrides key input. */
  public joystickVector: { x: number; y: number } | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    color: number,
    name: string = 'You',
  ) {
    this.scene = scene;
    this.name = name;
    this.color = color;

    // Generate 3D capsule texture and create sprite
    const texKey = generateCapsuleTexture(scene, color, name);
    this.sprite = scene.physics.add.sprite(x, y, texKey);
    this.sprite.setDepth(10);
    this.sprite.setOrigin(0.5, 0.55); // origin slightly below center for natural standing

    // Physics body — circular collision that fits the capsule
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.body.setCircle(11, 3, 6);
    this.body.setCollideWorldBounds(true);
    this.body.setBounce(0, 0);

    // Name label above the sprite
    this.label = scene.add
      .text(x, y - 24, name, {
        fontSize: '11px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(11);
  }

  /** Register keyboard input for this player */
  public setupKeyboard(
    keys: {
      W: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
      UP: Phaser.Input.Keyboard.Key;
      DOWN: Phaser.Input.Keyboard.Key;
      LEFT: Phaser.Input.Keyboard.Key;
      RIGHT: Phaser.Input.Keyboard.Key;
    },
  ): void {
    (this as any).keys = keys;
  }

  /** Update movement and label position each frame */
  public update(speedMultiplier: number = 1.0): void {
    let vx = 0;
    let vy = 0;
    if (this.joystickVector) {
      vx = this.joystickVector.x;
      vy = this.joystickVector.y;
    } else {
      const keys: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
        UP: Phaser.Input.Keyboard.Key;
        DOWN: Phaser.Input.Keyboard.Key;
        LEFT: Phaser.Input.Keyboard.Key;
        RIGHT: Phaser.Input.Keyboard.Key;
      } = (this as any).keys;
      if (!keys) return;
      vx =
        (keys.D.isDown || keys.RIGHT.isDown ? 1 : 0) -
        (keys.A.isDown || keys.LEFT.isDown ? 1 : 0);
      vy =
        (keys.S.isDown || keys.DOWN.isDown ? 1 : 0) -
        (keys.W.isDown || keys.UP.isDown ? 1 : 0);
    }

    if (vx !== 0 || vy !== 0) {
      const len = Math.hypot(vx, vy);
      this.body.setVelocity(
        (vx / len) * this.baseSpeed * speedMultiplier,
        (vy / len) * this.baseSpeed * speedMultiplier,
      );
    } else {
      this.body.setVelocity(0, 0);
    }

    // Update label position to follow sprite
    this.label.setPosition(this.sprite.x, this.sprite.y - 24);
  }

  /** Clean up game objects */
  public destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
