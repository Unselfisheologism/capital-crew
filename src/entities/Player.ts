import Phaser from 'phaser';

/** Player colors for each character */
export const PLAYER_COLORS = [0x00ffff, 0xff4444, 0xffaa00, 0xaa44ff];

/**
 * Generates a 3D character texture — Capital Crew style.
 * Round-headed business tycoon with sunglasses and suit.
 * Distinct silhouette: big round head, slim torso, tiny hat.
 */
export function generateCapsuleTexture(
  scene: Phaser.Scene,
  color: number,
  name: string,
): string {
  const texKey = `player_${name}_${color}`;
  if (scene.textures.exists(texKey)) return texKey;

  // Canvas dimensions
  const w = 30;
  const pad = 5;
  const totalH = 42;
  const g = scene.add.graphics();

  const r = (color >> 16) & 0xff;
  const gv = (color >> 8) & 0xff;
  const b = color & 0xff;

  // Derived palette
  const highlight = Phaser.Display.Color.GetColor(
    Math.min(255, r + 70),
    Math.min(255, gv + 70),
    Math.min(255, b + 70),
  );
  const shadow = Phaser.Display.Color.GetColor(
    Math.max(0, r - 60),
    Math.max(0, gv - 60),
    Math.max(0, b - 60),
  );
  const deepShadow = Phaser.Display.Color.GetColor(
    Math.max(0, r - 100),
    Math.max(0, gv - 100),
    Math.max(0, b - 100),
  );
  // Suit color (darker desaturated version)
  const suitColor = Phaser.Display.Color.GetColor(
    Math.max(0, Math.floor(r * 0.4)),
    Math.max(0, Math.floor(gv * 0.4)),
    Math.max(0, Math.floor(b * 0.4)),
  );
  const suitLight = Phaser.Display.Color.GetColor(
    Math.min(255, Math.floor(r * 0.5) + 20),
    Math.min(255, Math.floor(gv * 0.5) + 20),
    Math.min(255, Math.floor(b * 0.5) + 20),
  );

  const cx = w / 2 + pad; // center X

  // ── Ground shadow ──
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(cx, totalH - 1 + pad, w - 4, 6);

  // ══════════════════════════════════════════
  // BODY (slim torso, suit jacket)
  // ══════════════════════════════════════════
  const bodyTop = pad + 20;
  const bodyW = 16;
  const bodyH = 16;
  const bodyX = cx - bodyW / 2;

  // Torso shadow
  g.fillStyle(0x000000, 0.15);
  g.fillRoundedRect(bodyX + 2, bodyTop + 2, bodyW, bodyH, 3);

  // Torso base
  g.fillStyle(suitColor, 1);
  g.fillRoundedRect(bodyX, bodyTop, bodyW, bodyH, 3);

  // Suit lapel highlights
  g.fillStyle(suitLight, 0.3);
  g.fillRoundedRect(bodyX + 1, bodyTop + 1, 6, bodyH - 3, { tl: 2, tr: 0, bl: 2, br: 0 });

  // Suit shadow side
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(bodyX + bodyW - 4, bodyTop + 2, 3, bodyH - 4, { tl: 0, tr: 2, bl: 0, br: 2 });

  // ── Tie (small V-shape below the head) ──
  g.fillStyle(0xcc2222, 0.8);
  g.fillTriangle(cx - 1, bodyTop + 1, cx + 1, bodyTop + 1, cx, bodyTop + 10);
  // Tie knot
  g.fillStyle(0xaa1111, 0.9);
  g.fillRect(cx - 1, bodyTop, 3, 3);

  // ══════════════════════════════════════════
  // HEAD (round coin/sphere — not Among Us pill)
  // ══════════════════════════════════════════
  const headR = 11;
  const headCY = pad + 12;

  // Head shadow (behind)
  g.fillStyle(0x000000, 0.2);
  g.fillCircle(cx + 2, headCY + 2, headR);

  // Head base
  g.fillStyle(color, 1);
  g.fillCircle(cx, headCY, headR);

  // 3D highlight (upper-left arc)
  g.fillStyle(highlight, 0.4);
  g.fillCircle(cx - 3, headCY - 3, headR - 3);

  // 3D shadow (lower-right crescent)
  g.fillStyle(shadow, 0.4);
  g.fillCircle(cx + 2, headCY + 2, headR - 2);

  // Bottom contact shadow on head
  g.fillStyle(deepShadow, 0.35);
  g.fillEllipse(cx, headCY + headR - 3, headR * 1.4, 6);

  // Head outline
  g.lineStyle(1, 0x000000, 0.3);
  g.strokeCircle(cx, headCY, headR);

  // ══════════════════════════════════════════
  // SUNGLASSES (cool business look, not Among Us visor)
  // ══════════════════════════════════════════
  const glassY = headCY - 2;
  const glassW = 7;
  const glassH = 5;
  const glassGap = 2;

  // Left lens
  g.fillStyle(0x111122, 0.9);
  g.fillRoundedRect(cx - glassW - glassGap / 2, glassY, glassW, glassH, 2);
  // Right lens
  g.fillRoundedRect(cx + glassGap / 2, glassY, glassW, glassH, 2);

  // Lens tint (slight color reflection)
  g.fillStyle(0x334466, 0.3);
  g.fillRoundedRect(cx - glassW - glassGap / 2 + 1, glassY + 1, glassW - 2, 2, 1);
  g.fillRoundedRect(cx + glassGap / 2 + 1, glassY + 1, glassW - 2, 2, 1);

  // Lens glare
  g.fillStyle(0xffffff, 0.25);
  g.fillRoundedRect(cx - glassW - glassGap / 2 + 1, glassY + 1, 3, 2, 1);
  g.fillRoundedRect(cx + glassGap / 2 + 1, glassY + 1, 3, 2, 1);

  // Bridge between lenses
  g.fillStyle(0x222233, 0.8);
  g.fillRect(cx - 1, glassY + 1, 2, 2);

  // Temple arms (going to the sides of the head)
  g.fillStyle(0x222233, 0.5);
  g.fillRect(cx - glassW - glassGap / 2 - 3, glassY + 1, 3, 1);
  g.fillRect(cx + glassW + glassGap / 2, glassY + 1, 3, 1);

  // ══════════════════════════════════════════
  // FEDORA / HAT (tiny, sitting on top of head)
  // ══════════════════════════════════════════
  const hatCY = headCY - headR + 1;
  const hatW = 14;
  const hatH = 5;

  // Hat brim (wider, flat)
  g.fillStyle(suitColor, 0.9);
  g.fillEllipse(cx, hatCY + 2, hatW + 4, 4);
  g.lineStyle(0.8, 0x000000, 0.25);
  g.strokeEllipse(cx, hatCY + 2, hatW + 4, 4);

  // Hat crown
  g.fillStyle(suitColor, 1);
  g.fillRoundedRect(cx - hatW / 2 + 2, hatCY - hatH + 3, hatW - 4, hatH, 2);

  // Hat band (gold accent)
  g.fillStyle(0xd4a030, 0.7);
  g.fillRect(cx - hatW / 2 + 3, hatCY - 1, hatW - 6, 2);

  // Hat highlight
  g.fillStyle(highlight, 0.15);
  g.fillRect(cx - hatW / 2 + 3, hatCY - hatH + 4, hatW - 8, 1);

  // ══════════════════════════════════════════
  // FEET (shoe-like, distinct from Among Us stubs)
  // ══════════════════════════════════════════
  const footY = pad + totalH - 8;

  // Left shoe
  g.fillStyle(0x1a1a2a, 0.9);
  g.fillRoundedRect(cx - 8, footY, 7, 5, { tl: 1, tr: 1, bl: 3, br: 2 });
  // Shoe shine
  g.fillStyle(0x444466, 0.3);
  g.fillRect(cx - 7, footY + 1, 3, 1);

  // Right shoe
  g.fillStyle(0x1a1a2a, 0.9);
  g.fillRoundedRect(cx + 1, footY, 7, 5, { tl: 1, tr: 1, bl: 2, br: 3 });
  g.fillStyle(0x444466, 0.3);
  g.fillRect(cx + 2, footY + 1, 3, 1);

  // ══════════════════════════════════════════
  // BRIEFCASE (side detail instead of backpack)
  // ══════════════════════════════════════════
  const bcX = cx + bodyW / 2 - 1;
  const bcY = bodyTop + 6;
  const bcW = 6;
  const bcH = 8;

  // Case shadow
  g.fillStyle(0x000000, 0.2);
  g.fillRoundedRect(bcX + 1, bcY + 1, bcW, bcH, 2);

  // Case body
  g.fillStyle(0x5c3a1e, 0.85);
  g.fillRoundedRect(bcX, bcY, bcW, bcH, 2);

  // Case highlight
  g.fillStyle(0x8b6238, 0.3);
  g.fillRect(bcX + 1, bcY + 1, 2, bcH - 2);

  // Case clasp
  g.fillStyle(0xd4a030, 0.7);
  g.fillRect(bcX + bcW / 2 - 1, bcY + bcH / 2 - 1, 2, 2);

  // Case handle
  g.lineStyle(1, 0x5c3a1e, 0.7);
  g.strokeRoundedRect(cx + bodyW / 2 - 2, bcY - 2, 4, 3, 1);

  g.generateTexture(texKey, w + pad * 2, totalH + pad * 2);
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

    // Generate 3D character texture and create sprite
    const texKey = generateCapsuleTexture(scene, color, name);
    this.sprite = scene.physics.add.sprite(x, y, texKey);
    this.sprite.setDepth(10);
    this.sprite.setOrigin(0.5, 0.52);

    // Physics body — circular collision
    this.body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.body.setCircle(10, 4, 8);
    this.body.setCollideWorldBounds(true);
    this.body.setBounce(0, 0);

    // Name label above the sprite
    this.label = scene.add
      .text(x, y - 26, name, {
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
    this.label.setPosition(this.sprite.x, this.sprite.y - 26);
  }

  /** Clean up game objects */
  public destroy(): void {
    this.sprite.destroy();
    this.label.destroy();
  }
}
