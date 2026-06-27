/**
 * Capital Crew — MOBILE TOUCH CONTROLS
 *
 * Renders a virtual joystick (bottom-left) and a 7-button action pad
 * (bottom-right) on top of the Phaser canvas. Sends synthetic keyboard
 * events (WASD, E, H, T, V, Y, G) so the rest of the game doesn't need
 * any mobile-specific code.
 *
 * Also handles touch-to-interact: tapping the action button near a sign
 * triggers the same path as pressing E when standing on an interactable.
 *
 * The overlay uses absolute positioning (pointer-events: none on the
 * container; pointer-events: auto on the actual interactive elements)
 * so it never blocks Phaser's input handling underneath.
 */
import Phaser from 'phaser';

interface JoystickState {
  active: boolean;
  /** Direction in {dx, dy} normalized to [-1..1], or zero. */
  dx: number;
  dy: number;
}

/** Public controls payload that the Player reads each frame. */
export interface MobileControls {
  /** Forward (W) pressed. */
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  /** Was E pressed this frame edge — true only on the rising edge. */
  eEdge: boolean;
  /** True while E held. */
  eHeld: boolean;
  /** Optional: tap-on-zone requests (sent when joystick tap-zone hit). */
}

/**
 * Lock-orientation helper that runs BEFORE the auth UI shows.
 * This makes sure the user sees the rotate-device card on the auth screen too.
 */
export function setupOrientationLockEarly(): void {
  if (typeof window === 'undefined') return;
  if (document.getElementById('cc-orient-lock')) {
    // Already injected by MobileControlsOverlay — just refresh state.
    updateOrientationLockEarly();
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'cc-orient-lock';
  overlay.id = 'cc-orient-lock';
  overlay.innerHTML = `
    <div class="cc-orient-icon">📱</div>
    <div class="cc-orient-title">ROTATE YOUR DEVICE</div>
    <div class="cc-orient-msg">
      Capital Crew is designed for landscape mode on mobile.
      Please tilt your phone sideways to continue.
    </div>
  `;
  overlay.style.display = 'none';
  document.body.appendChild(overlay);
  updateOrientationLockEarly();
  window.addEventListener('resize', updateOrientationLockEarly);
  window.addEventListener('orientationchange', updateOrientationLockEarly);
  setTimeout(updateOrientationLockEarly, 100);
  setTimeout(updateOrientationLockEarly, 600);
}

function updateOrientationLockEarly(): void {
  const lockEl = document.getElementById('cc-orient-lock');
  if (!lockEl) return;
  const isPortrait = window.innerHeight > window.innerWidth * 1.05;
  const smallEnough = Math.min(window.innerWidth, window.innerHeight) < 920;
  const shouldLock = isPortrait && smallEnough;
  document.body.classList.toggle('is-portrait', shouldLock);
  document.body.classList.toggle('is-landscape', !shouldLock);
  lockEl.style.display = shouldLock ? 'flex' : 'none';
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  // Require actual touch support — not just a small window.
  const hasTouch = navigator.maxTouchPoints > 0;
  const hasCoarse = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  // A real mobile device has touch AND coarse pointer (no mouse cursor).
  // A desktop with a touchscreen but a mouse will have pointer: fine.
  return hasTouch && hasCoarse;
}

export class MobileControlsOverlay {
  /** Up-to-date input state captured by the joystick + action buttons. */
  readonly state = {
    up: false,
    down: false,
    left: false,
    right: false,
    eEdge: false,
    eHeld: false,
  };

  private rootEl!: HTMLDivElement;
  private joystickBase!: HTMLDivElement;
  private joystickKnob!: HTMLDivElement;
  private actionPad!: HTMLDivElement;

  private joystick: JoystickState = { active: false, dx: 0, dy: 0 };
  private joystickTouchId: number | null = null;
  private joystickRect: DOMRect | null = null;
  private eReleaseTimeout: ReturnType<typeof setTimeout> | null = null;

  /** Last frame's eHeld state — used to detect rising edge. */
  private prevEHeld = false;

  /** Constructor sets up the DOM. Pass the document body for append. */
  constructor() {
    this.installOrientationLock();
    this.installResizeListener();
    this.buildDom();
    this.bindEvents();
    // Idempotent orientation-check on startup; installRotationLock also calls this.
    this.updateOrientationLock();
  }

  /** Build the rotating-smartphone overlay; only injected into the DOM. */
  private installOrientationLock(): void {
    // Show lock overlay only on portrait phones. We also gate it inside
    // updateOrientationLock() based on viewport metrics.
    const overlay = document.createElement('div');
    overlay.className = 'cc-orient-lock';
    overlay.id = 'cc-orient-lock';
    overlay.innerHTML = `
      <div class="cc-orient-icon">📱</div>
      <div class="cc-orient-title">ROTATE YOUR DEVICE</div>
      <div class="cc-orient-msg">
        Capital Crew is designed for landscape mode on mobile.
        Please tilt your phone sideways to continue.
      </div>
    `;
    // Hidden by default — JS toggles based on orientation.
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
    void overlay;
  }

  /** Per-frame or per-resize: hide/show the lock overlay. */
  private updateOrientationLock(): void {
    const lockEl = document.getElementById('cc-orient-lock');
    if (!lockEl) return;
    const isPortrait = window.innerHeight > window.innerWidth * 1.05;
    const smallEnough =
      Math.min(window.innerWidth, window.innerHeight) < 920;
    // Only block play if the viewport is portrait AND it's a phone-like size.
    // Desktop portrait browsers (rare) still get to play.
    const shouldLock = isPortrait && smallEnough;
    document.body.classList.toggle('is-portrait', shouldLock);
    document.body.classList.toggle('is-landscape', !shouldLock);
    lockEl.style.display = shouldLock ? 'flex' : 'none';
  }

  /** Listen for orientation / viewport changes. */
  private installResizeListener(): void {
    const update = () => this.updateOrientationLock();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    // Some browsers fire neither explicitly; poll briefly.
    setTimeout(update, 100);
    setTimeout(update, 600);
  }

  private buildDom(): void {
    const root = document.getElementById('cc-mobile-controls');
    if (!root) return;
    this.rootEl = root as HTMLDivElement;
    this.rootEl.innerHTML = '';
    this.rootEl.style.display = 'block';

    // ── Joystick (small, single-finger) ──
    const joystickWrap = document.createElement('div');
    joystickWrap.className = 'cc-joystick';
    const base = document.createElement('div');
    base.className = 'cc-joystick-base';
    const knob = document.createElement('div');
    knob.className = 'cc-joystick-knob';
    joystickWrap.appendChild(base);
    joystickWrap.appendChild(knob);
    this.joystickBase = base;
    this.joystickKnob = knob;
    this.rootEl.appendChild(joystickWrap);

    // ── Action strip — right-edge vertical grid (thumb-reachable in landscape) ──
    // 10 buttons → 4 cols × 3 rows at 44px each fits comfortably on phones
    // held sideways. JS may switch to 3 cols on very narrow-aspect devices.
    const pad = document.createElement('div');
    pad.className = 'cc-action-strip';
    const layout: Array<{ key: string; label: string; color: string }> = [
      // ROW 0 — primary interaction / utility
      { key: '?',        label: '?',   color: 'rgba(80,80,80,0.7)' },
      { key: 'h',        label: 'H',   color: 'rgba(140,180,140,0.7)' },
      { key: 't',        label: 'T',   color: 'rgba(180,80,80,0.7)' },
      { key: 'e',        label: 'E',   color: 'rgba(255,215,0,0.95)' },
      // ROW 1 — role-gated + zoom + menu
      { key: 'v',        label: 'V',   color: 'rgba(255,165,0,0.7)' },
      { key: 'y',        label: 'Y',   color: 'rgba(80,180,255,0.7)' },
      { key: 'g',        label: 'G',   color: 'rgba(180,140,255,0.7)' },
      { key: 'm',        label: 'M',   color: 'rgba(255,140,255,0.8)' },
      // ROW 2 — zoom controls
      { key: 'zoom_out', label: '−',   color: 'rgba(60,90,140,0.85)' },
      { key: 'zoom_in',  label: '＋',  color: 'rgba(60,90,140,0.85)' },
    ];
    for (const b of layout) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cc-action-btn';
      btn.style.background = b.color;
      btn.textContent = b.label;
      btn.dataset.key = b.key;
      btn.setAttribute('aria-label', b.key);
      pad.appendChild(btn);
    }
    this.actionPad = pad;
    this.rootEl.appendChild(pad);

    // ── Responsive layout: pick column count so the strip never clips or
    // crowds the Phaser canvas. We re-evaluate on resize and on orientation
    // change. CSS env() handles safe areas automatically.
    this.installResponsiveSizing();
  }

  /**
   * Adjust the action strip grid columns based on the current viewport
   * dimensions. We aim to:
   *   1. never let the strip exceed ~38% of viewport width
   *   2. never let it exceed ~70% of viewport height
   *   3. prefer 4 cols × 3 rows (44px) on tall-landscape; fall back to 3 cols
   *      when the canvas width is constrained (low aspect ratio phones).
   */
  private installResponsiveSizing(): void {
    const fit = () => {
      if (!this.actionPad) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const isShortVh = vh <= 400;
      const gap = isShortVh ? 4 : 6;
      const padX = 7;
      const baseCols = vw <= 0 ? 4 : (vw / vh >= 1.6 ? 4 : 5);
      const desiredCell = isShortVh ? 34 : 39;
      const cellW = (vw * 0.36 - padX * 2 - gap * (baseCols - 1)) / baseCols;
      const cols = Math.max(3, Math.min(5, Math.floor(cellW)));
      let finalCell = Math.max(32, Math.min(desiredCell, Math.floor((vw * 0.36 - padX * 2 - gap * (cols - 1)) / cols)));
      const stripHeight = finalCell * 3 + gap * (3 - 1) + padX * 2;
      const bottomSafe = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--cc-safe-bottom') || '0') || 0;
      const vhSpace = vh - bottomSafe - 24;
      if (stripHeight > vhSpace && finalCell > 32) {
        finalCell = Math.max(32, finalCell - 3);
      }
      const maxCols = Math.max(3, Math.min(5, Math.floor((vw * 0.38 - padX * 2 - gap * 2) / finalCell)));
      const finalCols = Math.min(baseCols, maxCols);
      this.actionPad.style.gridTemplateColumns = `repeat(${finalCols}, ${finalCell}px)`;
      this.actionPad.style.gridAutoRows = `${finalCell}px`;
      this.actionPad.style.gap = `${gap}px`;
      this.actionPad.style.padding = `${padX + (isShortVh ? 1 : 0)}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('orientationchange', fit);
  }

  private bindEvents(): void {
    // Joystick touch handling
    const onJoyStart = (e: TouchEvent) => {
      if (this.joystickTouchId !== null) return;
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joystickTouchId = t.identifier;
      this.joystickRect = this.joystickBase.getBoundingClientRect();
      this.joystick.active = true;
      this.updateJoystick(t.clientX, t.clientY);
    };
    const onJoyMove = (e: TouchEvent) => {
      if (this.joystickTouchId === null) return;
      const t = Array.from(e.changedTouches).find((x) => x.identifier === this.joystickTouchId);
      if (!t) return;
      e.preventDefault();
      this.updateJoystick(t.clientX, t.clientY);
    };
    const onJoyEnd = (e: TouchEvent) => {
      const t = Array.from(e.changedTouches).find((x) => x.identifier === this.joystickTouchId);
      if (!t) return;
      this.joystickTouchId = null;
      this.joystick.active = false;
      this.joystick.dx = 0;
      this.joystick.dy = 0;
      this.joystickKnob.style.transform = 'translate(-50%, -50%)';
      this.applyDirection(0, 0);
    };
    this.joystickBase.addEventListener('touchstart', onJoyStart as EventListener, { passive: false });
    this.joystickBase.addEventListener('touchmove', onJoyMove as EventListener, { passive: false });
    this.joystickBase.addEventListener('touchend', onJoyEnd as EventListener, { passive: false });
    this.joystickBase.addEventListener('touchcancel', onJoyEnd as EventListener, { passive: false });

    // Action button handling — both press and release
    this.actionPad.addEventListener('touchstart', (e: Event) => {
      const te = e as TouchEvent;
      e.preventDefault();
      const target = te.target as HTMLElement;
      const key = target.dataset.key;
      if (key) this.pressKey(key);
    }, { passive: false });
    this.actionPad.addEventListener('touchend', (e: Event) => {
      const te = e as TouchEvent;
      const target = te.target as HTMLElement;
      const key = target.dataset.key;
      if (key) this.releaseKey(key);
    });
    this.actionPad.addEventListener('touchcancel', (e: Event) => {
      const te = e as TouchEvent;
      const target = te.target as HTMLElement;
      const key = target.dataset.key;
      if (key) this.releaseKey(key);
    });

    // Mouse fallback for emulator/desktop debugging
    this.joystickBase.addEventListener('mousedown', (e: MouseEvent) => {
      this.joystickTouchId = -1;
      this.joystickRect = this.joystickBase.getBoundingClientRect();
      this.joystick.active = true;
      this.updateJoystick(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (this.joystickTouchId !== -1) return;
      if (!this.joystick.active) return;
      this.updateJoystick(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
      if (this.joystickTouchId !== -1) return;
      if (!this.joystick.active) return;
      this.joystickTouchId = null;
      this.joystick.active = false;
      this.joystick.dx = 0;
      this.joystick.dy = 0;
      this.joystickKnob.style.transform = 'translate(-50%, -50%)';
      this.applyDirection(0, 0);
    });

    // ── Pinch-to-zoom (anywhere outside the joystick / pad) ──
    // Track when the user has TWO simultaneous finger touches. Compute the
    // distance delta and translate into a zoom request.
    let pinchStartDist = 0;
    let pinchLastDist = 0;
    const onPinchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) {
        pinchStartDist = 0;
        pinchLastDist = 0;
        return;
      }
      const [a, b] = Array.from(e.touches);
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      pinchStartDist = d;
      pinchLastDist = d;
    };
    const onPinchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchLastDist) return;
      // Ignore events that originate inside the joystick/pad UI so they
      // don't fight with the touch joystick polling.
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt === this.joystickBase || (this.actionPad.contains(tgt)))) return;
      const [a, b] = Array.from(e.touches);
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const delta = d - pinchLastDist;
      pinchLastDist = d;
      // Map finger movement (~ px) into a zoom delta (~ 0..0.04).
      window.dispatchEvent(
        new CustomEvent('cc:zoom-request', { detail: { delta: delta * 0.005 } }),
      );
      e.preventDefault();
    };
    const onPinchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartDist = 0;
        pinchLastDist = 0;
      }
    };
    window.addEventListener('touchstart', onPinchStart as EventListener, { passive: true });
    window.addEventListener('touchmove', onPinchMove as EventListener, { passive: false });
    window.addEventListener('touchend', onPinchEnd as EventListener, { passive: true });
    window.addEventListener('touchcancel', onPinchEnd as EventListener, { passive: true });
  }

  /** Translate a screen point into joystick dx/dy and visual knob position. */
  private updateJoystick(cx: number, cy: number): void {
    if (!this.joystickRect) return;
    const bx = this.joystickRect.left + this.joystickRect.width / 2;
    const by = this.joystickRect.top + this.joystickRect.height / 2;
    const r = this.joystickRect.width / 2;
    let dx = (cx - bx) / r;
    let dy = (cy - by) / r;
    const mag = Math.hypot(dx, dy);
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    this.joystick.dx = dx;
    this.joystick.dy = dy;
    // Move knob visually
    const knobX = dx * (r * 0.5);
    const knobY = dy * (r * 0.5);
    this.joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
    this.applyDirection(dx, dy);
  }

  /** Convert joystick (dx, dy) into WASD-like up/down/left/right state. */
  private applyDirection(dx: number, dy: number): void {
    // Use a small dead-zone so the player doesn't jitter when finger is centered.
    const dead = 0.22;
    let up = false, down = false, left = false, right = false;
    if (dy < -dead) up = true;
    if (dy > dead) down = true;
    if (dx < -dead) left = true;
    if (dx > dead) right = true;
    // If straight diagonal, only honour the dominant axis for cleaner movement.
    if (up && (Math.abs(dx) > Math.abs(dy) * 1.4)) {
      up = false;
      dx < 0 ? (left = true) : (right = true);
    }
    if (down && (Math.abs(dx) > Math.abs(dy) * 1.4)) {
      down = false;
      dx < 0 ? (left = true) : (right = true);
    }
    this.state.up = up;
    this.state.down = down;
    this.state.left = left;
    this.state.right = right;
  }

  /** Map an on-screen button to a key. */
  private pressKey(buttonKey: string): void {
    if (buttonKey === '?') {
      this.showHelp();
      return;
    }
    if (buttonKey === 'm') {
      // M: dispatch a synthetic 'm' keydown — GameScene handles pause/menu logic.
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'm', bubbles: true }));
      return;
    }
    if (buttonKey === 'zoom_in' || buttonKey === 'zoom_out') {
      const dir = buttonKey === 'zoom_in' ? +1 : -1;
      window.dispatchEvent(
        new CustomEvent('cc:zoom-request', { detail: { delta: dir * 0.15 } }),
      );
      return;
    }
    // Mark a synthetic key event in DOM so Phaser keydown listeners see it.
    const keyChar =
      buttonKey === 'e' ? 'E' :
      buttonKey === 'h' ? 'H' :
      buttonKey === 't' ? 'T' :
      buttonKey === 'v' ? 'V' :
      buttonKey === 'y' ? 'Y' :
      buttonKey === 'g' ? 'G' : buttonKey.toUpperCase();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: keyChar, bubbles: true }));
    if (buttonKey === 'e') {
      // Hold-E: state.eHeld stays true until releaseKey() is called by touchend.
      this.state.eHeld = true;
    }
  }

  private releaseKey(buttonKey: string): void {
    if (buttonKey === 'e') {
      document.dispatchEvent(new KeyboardEvent('keyup', { key: 'E', bubbles: true }));
      this.state.eHeld = false;
    }
  }

  private showHelp(): void {
    // Quick inline help overlay
    let el = document.getElementById('cc-mobile-help');
    if (el) {
      el.remove();
      return;
    }
    el = document.createElement('div');
    el.id = 'cc-mobile-help';
    el.className = 'cc-help-card';
    el.innerHTML = `
      <div style="font-size: 22px; font-weight: 800; letter-spacing: 2px; color: #ffd700; margin-bottom: 8px;">CAPITAL CREW HELP</div>
      <div style="font-size: 14px; color: #aac;">Touch controls:</div>
      <ul style="margin: 8px 0 18px 18px; font-size: 13.5px; color: #dde;">
        <li><b>Joystick</b> (bottom-left) — move your character</li>
        <li><b>E</b> — interact / hold to fix emergency</li>
        <li><b>H</b> — toggle heat map</li>
        <li><b>T</b> — sabotage menu</li>
        <li><b>V</b> — engineer vent (role-gated)</li>
        <li><b>Y</b> — tracker pin (role-gated)</li>
        <li><b>G</b> — property trade</li>
        <li><b>M</b> — pause / menu</li>
        <li><b>＋ / −</b> — zoom</li>
        <li><b>?</b> — toggle this help</li>
      </ul>
      <div style="font-size: 13px; color: #88a; margin-top: 16px;">Tap anywhere to dismiss.</div>
    `;
    const dismiss = () => el?.remove();
    el.addEventListener('touchstart', dismiss, { once: true });
    el.addEventListener('mousedown', dismiss, { once: true });
    document.body.appendChild(el);
  }

  /** Per-frame: produce rising-edge press detection for E. */
  public tick(): void {
    // eHeld -> state mapping already done by pressKey/releaseKey,
    // but capture eEdge from the prev frame.
    if (this.state.eHeld && !this.prevEHeld) {
      this.state.eEdge = true;
    } else {
      this.state.eEdge = false;
    }
    this.prevEHeld = this.state.eHeld;
  }

  /** Show or hide the overlay (call after game-state changes). */
  public setVisible(visible: boolean): void {
    this.rootEl.style.display = visible ? 'block' : 'none';
  }
}
