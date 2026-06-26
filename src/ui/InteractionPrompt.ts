import Phaser from 'phaser';

/**
 * Floating "[E] Interact" prompt that appears near the player
 * when they're within range of an interactable node.
 * Among Us-style: rounded capsule with subtle glow.
 */
export class InteractionPrompt {
  private bg: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private container: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    // Background capsule (Among Us-style rounded pill)
    this.bg = scene.add.graphics();
    // We'll draw the pill shape in show() since size varies

    // Label text
    this.text = scene.add
      .text(0, 0, '[E] Interact', {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    // Group in a container so we can move both together
    this.container = scene.add
      .container(0, 0, [this.bg, this.text])
      .setDepth(50)
      .setScrollFactor(0)
      .setVisible(false);
  }

  /** Show the prompt centered at the given screen position */
  show(x: number, y: number, message: string = 'Interact'): void {
    this.text.setText(`[E] ${message}`);
    const textWidth = this.text.width + 32;
    const pillH = 34;
    const pillW = textWidth;

    // Redraw the capsule background
    this.bg.clear();

    // Subtle glow behind the pill
    this.bg.fillStyle(0x44aaff, 0.08);
    this.bg.fillRoundedRect(-pillW / 2 - 4, -pillH / 2 - 4, pillW + 8, pillH + 8, 12);

    // Main pill body (dark with slight transparency)
    this.bg.fillStyle(0x0a0a20, 0.85);
    this.bg.fillRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 10);

    // Top highlight (3D shine)
    this.bg.fillStyle(0x4466aa, 0.15);
    this.bg.fillRoundedRect(-pillW / 2 + 2, -pillH / 2 + 2, pillW - 4, pillH / 2 - 2, {
      tl: 9,
      tr: 9,
      bl: 0,
      br: 0,
    });

    // Outline
    this.bg.lineStyle(1.5, 0x44aaff, 0.3);
    this.bg.strokeRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 10);

    this.container.setPosition(x, y);
    this.container.setVisible(true);
  }

  /** Update position to follow a screen coordinate */
  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  /** Hide the prompt */
  hide(): void {
    this.container.setVisible(false);
  }

  /** Clean up */
  destroy(): void {
    this.container.destroy();
  }
}
