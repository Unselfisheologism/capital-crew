import Phaser from 'phaser';

/** Player colors for each character */
export const PLAYER_COLORS = [0x00ffff, 0xff4444, 0xffaa00, 0xaa44ff];

/** Character-specific visual variant derived from name or color */
interface CharVariant {
  hatStyle: 'tophat' | 'crown' | 'newsboy' | 'beret';
  eyeShape: 'round' | 'narrow' | 'wide' | 'sleepy';
  tieColor: number;
  accessory: 'briefcase' | 'monocle' | 'newspaper' | 'book';
  suitAccent: number; // lapel / pocket-square accent
}

function resolveVariant(name: string, color: number): CharVariant {
  // Match by name first (AI personalities have fixed names)
  const n = name.toLowerCase();
  if (n.includes('tycoon')) return { hatStyle: 'crown', eyeShape: 'narrow', tieColor: 0xdd2222, accessory: 'monocle', suitAccent: 0xddaa00 };
  if (n.includes('hustler')) return { hatStyle: 'newsboy', eyeShape: 'wide', tieColor: 0xdd7700, accessory: 'newspaper', suitAccent: 0x55aa33 };
  if (n.includes('scholar')) return { hatStyle: 'beret', eyeShape: 'sleepy', tieColor: 0x7744bb, accessory: 'book', suitAccent: 0x88aadd };
  // Player ("You") or fallback — top hat, classic capitalist
  return { hatStyle: 'tophat', eyeShape: 'round', tieColor: 0x2266cc, accessory: 'briefcase', suitAccent: 0xd4a030 };
}

/**
 * Generates a 3D character texture — Capital Crew style.
 * Each character has a unique hat, eyes, and accessory.
 * No visor / goggles — expressive eyes instead.
 */
export function generateCapsuleTexture(
  scene: Phaser.Scene,
  color: number,
  name: string,
): string {
  const texKey = `player_${name}_${color}`;
  if (scene.textures.exists(texKey)) return texKey;

  const variant = resolveVariant(name, color);

  // Canvas dimensions
  const w = 30;
  const pad = 6;
  const totalH = 44;
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
  const bodyTop = pad + 21;
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

  // ── Pocket square (personality accent) ──
  g.fillStyle(variant.suitAccent, 0.7);
  g.fillTriangle(bodyX + bodyW - 5, bodyTop + 2, bodyX + bodyW - 2, bodyTop + 2, bodyX + bodyW - 3, bodyTop + 5);

  // ── Tie (varies by character) ──
  g.fillStyle(variant.tieColor, 0.85);
  g.fillTriangle(cx - 1, bodyTop + 1, cx + 1, bodyTop + 1, cx, bodyTop + 10);
  // Tie knot
  g.fillStyle(variant.tieColor, 1);
  g.fillRect(cx - 1, bodyTop, 3, 3);

  // ══════════════════════════════════════════
  // HEAD (round coin/sphere — not Among Us pill)
  // ══════════════════════════════════════════
  const headR = 11;
  const headCY = pad + 13;

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
  // EYES (expressive, NOT a visor/goggle band)
  // ══════════════════════════════════════════
  const eyeY = headCY - 1;
  const eyeGap = 4; // distance between eye centers

  // White sclera
  g.fillStyle(0xffffff, 0.95);
  g.fillCircle(cx - eyeGap, eyeY, 3);
  g.fillCircle(cx + eyeGap, eyeY, 3);

  // Pupils — shape varies by personality
  g.fillStyle(0x111111, 0.95);
  switch (variant.eyeShape) {
    case 'narrow': // Tycoon — sly, half-lidded
      g.fillEllipse(cx - eyeGap, eyeY + 0.5, 3, 1.5);
      g.fillEllipse(cx + eyeGap, eyeY + 0.5, 3, 1.5);
      // Half-lid shadow
      g.fillStyle(color, 0.5);
      g.fillRect(cx - eyeGap - 2, eyeY - 2, 5, 2);
      g.fillRect(cx + eyeGap - 2, eyeY - 2, 5, 2);
      break;
    case 'wide': // Hustler — alert, energetic
      g.fillCircle(cx - eyeGap, eyeY, 2);
      g.fillCircle(cx + eyeGap, eyeY, 2);
      // Tiny white sparkle
      g.fillStyle(0xffffff, 0.7);
      g.fillCircle(cx - eyeGap + 0.5, eyeY - 0.5, 0.8);
      g.fillCircle(cx + eyeGap + 0.5, eyeY - 0.5, 0.8);
      break;
    case 'sleepy': // Scholar — half-closed, thoughtful
      g.fillEllipse(cx - eyeGap, eyeY + 1, 2.5, 1.2);
      g.fillEllipse(cx + eyeGap, eyeY + 1, 2.5, 1.2);
      // Heavy eyelids
      g.fillStyle(color, 0.6);
      g.fillRect(cx - eyeGap - 2, eyeY - 2.5, 5, 2.5);
      g.fillRect(cx + eyeGap - 2, eyeY - 2.5, 5, 2.5);
      break;
    default: // round (player) — neutral, friendly
      g.fillCircle(cx - eyeGap, eyeY, 1.8);
      g.fillCircle(cx + eyeGap, eyeY, 1.8);
      // White sparkle
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(cx - eyeGap + 0.5, eyeY - 0.5, 0.7);
      g.fillCircle(cx + eyeGap + 0.5, eyeY - 0.5, 0.7);
      break;
  }

  // ══════════════════════════════════════════
  // MOUTH (subtle smile / expression)
  // ══════════════════════════════════════════
  g.lineStyle(1, 0x000000, 0.35);
  g.beginPath();
  g.arc(cx, headCY + 4, 3, 0.2, Math.PI - 0.2, false);
  g.strokePath();

  // ══════════════════════════════════════════
  // HAT (unique per character — the silhouette differentiator)
  // ══════════════════════════════════════════
  const hatBase = headCY - headR + 1;

  switch (variant.hatStyle) {
    case 'tophat': {
      // Tall cylinder + flat brim — classic capitalist
      const brimW = 16;
      const crownW = 10;
      const crownH = 10;
      // Brim
      g.fillStyle(0x1a1a2a, 0.9);
      g.fillEllipse(cx, hatBase + 2, brimW, 4);
      g.lineStyle(0.8, 0x000000, 0.2);
      g.strokeEllipse(cx, hatBase + 2, brimW, 4);
      // Crown
      g.fillStyle(0x1a1a2a, 1);
      g.fillRoundedRect(cx - crownW / 2, hatBase - crownH + 3, crownW, crownH, 2);
      // Crown highlight
      g.fillStyle(0x333355, 0.3);
      g.fillRect(cx - crownW / 2 + 1, hatBase - crownH + 4, 3, crownH - 5);
      // Hat band (gold)
      g.fillStyle(0xd4a030, 0.8);
      g.fillRect(cx - crownW / 2 + 1, hatBase - 1, crownW - 2, 2);
      break;
    }
    case 'crown': {
      // Pointed crown — tycoon = king of business
      const cw = 14;
      const ch = 8;
      // Crown base
      g.fillStyle(0xd4a030, 0.9);
      g.fillRoundedRect(cx - cw / 2, hatBase - ch + 3, cw, ch, 1);
      // Crown points (triangles)
      g.fillStyle(0xd4a030, 1);
      g.fillTriangle(cx - 5, hatBase - ch + 3, cx - 3, hatBase - ch + 3, cx - 4, hatBase - ch - 2);
      g.fillTriangle(cx - 1, hatBase - ch + 3, cx + 1, hatBase - ch + 3, cx, hatBase - ch - 3);
      g.fillTriangle(cx + 3, hatBase - ch + 3, cx + 5, hatBase - ch + 3, cx + 4, hatBase - ch - 2);
      // Jewels on tips
      g.fillStyle(0xff2222, 0.9);
      g.fillCircle(cx - 4, hatBase - ch - 1, 1);
      g.fillStyle(0x2266ff, 0.9);
      g.fillCircle(cx, hatBase - ch - 2, 1);
      g.fillStyle(0x22cc44, 0.9);
      g.fillCircle(cx + 4, hatBase - ch - 1, 1);
      // Band
      g.fillStyle(0xffffff, 0.3);
      g.fillRect(cx - cw / 2 + 1, hatBase - 1, cw - 2, 2);
      break;
    }
    case 'newsboy': {
      // Flat cap tilted forward — street-smart hustler
      const capW = 16;
      const capH = 5;
      // Cap brim (extends forward)
      g.fillStyle(0x3a5a2a, 0.9);
      g.fillRoundedRect(cx - capW / 2 - 1, hatBase, capW + 3, 3, { tl: 2, tr: 1, bl: 1, br: 1 });
      // Cap body (puffy top)
      g.fillStyle(0x3a5a2a, 1);
      g.fillEllipse(cx, hatBase - 1, capW - 2, capH);
      // Cap highlight
      g.fillStyle(0x5a8a4a, 0.3);
      g.fillEllipse(cx - 2, hatBase - 2, capW - 6, capH - 2);
      // Button on top
      g.fillStyle(0x2a3a1a, 0.8);
      g.fillCircle(cx, hatBase - 3, 1.2);
      break;
    }
    case 'beret': {
      // Flat round beret — intellectual scholar
      const beretW = 14;
      const beretH = 4;
      // Beret body
      g.fillStyle(0x442266, 0.9);
      g.fillEllipse(cx + 1, hatBase, beretW, beretH);
      // Beret slouch (asymmetric, heavier on one side)
      g.fillStyle(0x442266, 1);
      g.fillEllipse(cx + 3, hatBase - 1, beretW - 4, beretH + 1);
      // Beret highlight
      g.fillStyle(0x7744aa, 0.3);
      g.fillEllipse(cx, hatBase - 1, beretW - 6, beretH - 1);
      // Stem/nub on top
      g.fillStyle(0x331155, 0.8);
      g.fillCircle(cx + 1, hatBase - 3, 1);
      break;
    }
  }

  // ══════════════════════════════════════════
  // FEET (dress shoes, distinct from Among Us stubs)
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
  // ACCESSORY (unique per character — replaces the one-size-fits-all briefcase)
  // ══════════════════════════════════════════
  const accX = cx + bodyW / 2 - 1;
  const accY = bodyTop + 6;

  switch (variant.accessory) {
    case 'briefcase': {
      const bcW = 6;
      const bcH = 8;
      g.fillStyle(0x000000, 0.2);
      g.fillRoundedRect(accX + 1, accY + 1, bcW, bcH, 2);
      g.fillStyle(0x5c3a1e, 0.85);
      g.fillRoundedRect(accX, accY, bcW, bcH, 2);
      g.fillStyle(0x8b6238, 0.3);
      g.fillRect(accX + 1, accY + 1, 2, bcH - 2);
      g.fillStyle(0xd4a030, 0.7);
      g.fillRect(accX + bcW / 2 - 1, accY + bcH / 2 - 1, 2, 2);
      g.lineStyle(1, 0x5c3a1e, 0.7);
      g.strokeRoundedRect(accX - 1, accY - 2, 4, 3, 1);
      break;
    }
    case 'monocle': {
      // Monocle hanging on a chain from the eye
      const monocleX = cx + eyeGap + 3;
      const monocleY = eyeY + 4;
      // Chain (thin gold line from eye to chest)
      g.lineStyle(0.8, 0xd4a030, 0.5);
      g.beginPath();
      g.moveTo(cx + eyeGap + 1, eyeY + 2);
      g.lineTo(accX, accY - 2);
      g.strokePath();
      // Monocle ring
      g.lineStyle(1.2, 0xd4a030, 0.8);
      g.strokeCircle(monocleX, monocleY, 2.5);
      // Glass fill
      g.fillStyle(0xaaccff, 0.2);
      g.fillCircle(monocleX, monocleY, 2);
      break;
    }
    case 'newspaper': {
      // Rolled-up newspaper
      const nw = 5;
      const nh = 9;
      g.fillStyle(0xe8e0d0, 0.85);
      g.fillRoundedRect(accX, accY, nw, nh, 1);
      // Print lines
      g.fillStyle(0x333333, 0.2);
      for (let i = 0; i < 4; i++) {
        g.fillRect(accX + 1, accY + 1 + i * 2, nw - 2, 0.5);
      }
      // Fold shadow
      g.fillStyle(0x000000, 0.1);
      g.fillRect(accX + nw / 2, accY, 0.5, nh);
      break;
    }
    case 'book': {
      // Leather-bound book
      const bkW = 5;
      const bkH = 7;
      g.fillStyle(0x000000, 0.2);
      g.fillRoundedRect(accX + 1, accY + 1, bkW, bkH, 1);
      g.fillStyle(0x3a2a1a, 0.9);
      g.fillRoundedRect(accX, accY, bkW, bkH, 1);
      // Pages (cream edge)
      g.fillStyle(0xf5edd8, 0.7);
      g.fillRect(accX + bkW - 1, accY + 1, 1, bkH - 2);
      // Title emboss
      g.fillStyle(0xd4a030, 0.4);
      g.fillRect(accX + 1, accY + 2, bkW - 3, 1);
      g.fillRect(accX + 1, accY + 4, bkW - 3, 1);
      break;
    }
  }

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
