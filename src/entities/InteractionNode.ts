import Phaser from 'phaser';
import { InteractionType } from './InteractionType';

/**
 * An interactable point-of-interest on the map.
 * Contains a zone (position reference, no physics body), an icon sprite,
 * a floating label, and a sublabel.
 * Among Us-style: rounded capsule icon with subtle 3D glow.
 */
export class InteractionNode {
  public zone: Phaser.GameObjects.Zone;
  public icon: Phaser.GameObjects.Graphics;
  public iconText: Phaser.GameObjects.Text;
  public label: Phaser.GameObjects.Text;
  public sublabel: Phaser.GameObjects.Text;
  public type: InteractionType;
  public title: string;
  public data: Record<string, any>;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    type: InteractionType,
    title: string,
    iconChar: string,
    iconColor: number,
    data: Record<string, any> = {},
  ) {
    this.type = type;
    this.title = title;
    this.data = data;

    // Zone — position reference only, no physics body
    this.zone = scene.add.zone(x, y, 52, 52).setDepth(0);

    // Icon background — rounded capsule with 3D shading (Among Us style)
    this.icon = scene.add.graphics().setDepth(5);

    // Draw the capsule icon
    const iw = 38;
    const ih = 38;
    const ix = x - iw / 2;
    const iy = y - 12 - ih / 2;

    const r = (iconColor >> 16) & 0xff;
    const gv = (iconColor >> 8) & 0xff;
    const b = iconColor & 0xff;
    const bright = Phaser.Display.Color.GetColor(
      Math.min(255, r + 50),
      Math.min(255, gv + 50),
      Math.min(255, b + 50),
    );
    const dark = Phaser.Display.Color.GetColor(
      Math.max(0, r - 40),
      Math.max(0, gv - 40),
      Math.max(0, b - 40),
    );

    // Subtle glow underneath
    this.icon.fillStyle(iconColor, 0.12);
    this.icon.fillEllipse(x, y - 12, iw + 12, ih + 12);

    // Main capsule body
    this.icon.fillStyle(iconColor, 0.9);
    this.icon.fillRoundedRect(ix, iy, iw, ih, 10);

    // 3D highlight (top-left)
    this.icon.fillStyle(bright, 0.35);
    this.icon.fillRoundedRect(ix + 2, iy + 2, iw / 2 - 2, ih - 4, {
      tl: 8,
      tr: 0,
      bl: 4,
      br: 0,
    });

    // 3D shadow (bottom-right)
    this.icon.fillStyle(dark, 0.4);
    this.icon.fillRoundedRect(ix + iw / 2, iy + 2, iw / 2 - 2, ih - 4, {
      tl: 0,
      tr: 8,
      bl: 0,
      br: 4,
    });

    // Outline
    this.icon.lineStyle(1.5, 0xffffff, 0.2);
    this.icon.strokeRoundedRect(ix, iy, iw, ih, 10);

    // Icon character (emoji or letter)
    this.iconText = scene.add
      .text(x, y - 14, iconChar, {
        fontSize: '18px',
      })
      .setOrigin(0.5)
      .setDepth(6);

    // Floating name label
    this.label = scene.add
      .text(x, y - 40, title, {
        fontSize: '11px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(6);

    // Sublabel (price/description)
    this.sublabel = scene.add
      .text(x, y + 20, '', {
        fontSize: '9px',
        color: '#aabbcc',
        fontFamily: 'Arial, sans-serif',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(6);
  }

  /** Update sublabel text */
  setSublabel(text: string): void {
    this.sublabel.setText(text);
  }

  /** Clean up all game objects */
  destroy(): void {
    this.zone.destroy();
    this.icon.destroy();
    this.iconText.destroy();
    this.label.destroy();
    this.sublabel.destroy();
  }
}
