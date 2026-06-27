import Phaser from 'phaser';

/** A single option in a menu */
export interface MenuOption {
  label: string;
  description?: string;
  onSelect: () => void;
}

/** Configuration for opening a menu */
export interface MenuConfig {
  title: string;
  options: MenuOption[];
}

/**
 * Keyboard-navigable overlay menu panel.
 *
 * Controls:
 *   W / ArrowUp   — navigate up
 *   S / ArrowDown — navigate down
 *   Enter         — select option
 *   Esc           — close menu
 */
export class MenuPanel {
  private scene: Phaser.Scene;

  // Background elements
  private dimBg: Phaser.GameObjects.Graphics;
  private panelBg: Phaser.GameObjects.Graphics;
  private titleText: Phaser.GameObjects.Text;
  private optionTexts: Phaser.GameObjects.Text[] = [];
  private optionRects: Phaser.GameObjects.Rectangle[] = [];

  private config: MenuConfig | null = null;
  private selectedIndex: number = 0;
  private active: boolean = false;

  // Keyboard handlers
  private keyHandler!: (e: KeyboardEvent) => void;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Full-screen dim background
    this.dimBg = scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(200)
      .setVisible(false);

    // Panel background (centered box)
    this.panelBg = scene.add
      .graphics()
      .setScrollFactor(0)
      .setDepth(201)
      .setVisible(false);

    // Title text
    this.titleText = scene.add
      .text(0, 0, '', {
        fontSize: '22px',
        color: '#ffd700',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(202)
      .setVisible(false);
  }

  /** Open a menu with the given config */
  open(config: MenuConfig): void {
    this.config = config;
    this.selectedIndex = 0;
    this.active = true;

    this.dimBg.clear();
    this.dimBg.fillStyle(0x000000, 0.55);
    this.dimBg.fillRect(0, 0, this.scene.cameras.main.width, this.scene.cameras.main.height);
    this.dimBg.setVisible(true);

    const panelW = Math.min(420, this.scene.cameras.main.width - 40);
    const rowH = 44;
    const pad = 20;
    const titleH = 36;
    const optCount = config.options.length;
    const panelH = Math.min(
      500,
      pad * 2 + titleH + optCount * rowH + 24
    );
    const cx = this.scene.cameras.main.width / 2;
    const cy = this.scene.cameras.main.height / 2;
    const px = cx - panelW / 2;
    const py = cy - panelH / 2;

    this.panelBg.clear();
    this.panelBg.fillStyle(0x0d1b2a, 0.94);
    this.panelBg.fillRoundedRect(px, py, panelW, panelH, 12);
    this.panelBg.lineStyle(2, 0x1b4965, 0.7);
    this.panelBg.strokeRoundedRect(px, py, panelW, panelH, 12);

    this.panelBg.fillStyle(0x44aaff, 0.06);
    this.panelBg.fillRoundedRect(px + 4, py + 2, panelW - 8, 4, 2);
    this.panelBg.setVisible(true);

    this.titleText
      .setText(config.title)
      .setPosition(cx, py + pad)
      .setFontSize('22px')
      .setColor('#ffd700')
      .setVisible(true);

    this.clearOptions();
    for (let i = 0; i < optCount; i++) {
      const opt = config.options[i];
      const oy = py + pad + titleH + 8 + i * rowH;
      const ry = oy - 6;
      const rh = rowH - 6;
      const isActive = i === this.selectedIndex;

      const rect = this.scene.add
        .rectangle(cx, ry + rh / 2, panelW - 20, rh, 0x1b4965, isActive ? 0.45 : 0.15)
        .setScrollFactor(0)
        .setStrokeStyle(1, 0x44aaff, isActive ? 0.6 : 0.2)
        .setInteractive(new Phaser.Geom.Rectangle(cx, ry, panelW - 20, rh), Phaser.Geom.Rectangle.Contains)
        .setDepth(202);
      rect.on('pointerdown', () => {
        this.selectedIndex = i;
        this.highlightOption();
        if (this.config?.options[i]) {
          this.config.options[i].onSelect();
        }
      });
      this.optionRects.push(rect);

      const txt = this.scene.add
        .text(cx, ry + rh / 2, opt.label, {
          fontSize: '15px',
          color: isActive ? '#ffff88' : '#eeeeee',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          align: 'center',
        })
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(203)
        .setVisible(true);

      this.optionTexts.push(txt);
    }

    // Bottom close bar
    const closeY = py + panelH - 24;
    const closeBtn = this.scene.add
      .text(cx, closeY, 'Tap background to close', {
        fontSize: '13px',
        color: '#aac',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(203)
      .setVisible(true);
    this.optionTexts.push(closeBtn);

    this.registerKeys();
  }

  /** Close the menu */
  close(): void {
    this.active = false;
    this.dimBg.setVisible(false);
    this.panelBg.setVisible(false);
    this.titleText.setVisible(false);
    this.clearOptions();
    this.unregisterKeys();
  }

  get isActive(): boolean {
    return this.active;
  }

  // ── Private helpers ──

  private clearOptions(): void {
    for (const t of this.optionTexts) t.destroy();
    this.optionTexts = [];
  }

  private registerKeys(): void {
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.active || !this.config) return;

      switch (e.key) {
        case 'w':
        case 'W':
        case 'ArrowUp':
          e.preventDefault();
          this.selectedIndex = Math.max(0, this.selectedIndex - 1);
          this.highlightOption();
          break;

        case 's':
        case 'S':
        case 'ArrowDown':
          e.preventDefault();
          this.selectedIndex = Math.min(
            this.config.options.length - 1,
            this.selectedIndex + 1
          );
          this.highlightOption();
          break;

        case 'Enter':
          e.preventDefault();
          if (this.config.options[this.selectedIndex]) {
            this.config.options[this.selectedIndex].onSelect();
          }
          break;

        case 'Escape':
          e.preventDefault();
          this.close();
          break;
      }
    };

    document.addEventListener('keydown', this.keyHandler);
  }

  private unregisterKeys(): void {
    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler);
    }
  }

  private highlightOption(): void {
    for (let i = 0; i < this.optionTexts.length; i++) {
      this.optionTexts[i].setColor(
        i === this.selectedIndex ? '#ffff88' : '#cccccc'
      );
    }
  }

  /** Clean up on scene shutdown */
  destroy(): void {
    this.unregisterKeys();
    this.clearOptions();
    this.dimBg.destroy();
    this.panelBg.destroy();
    this.titleText.destroy();
  }
}
