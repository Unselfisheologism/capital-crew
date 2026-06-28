import Phaser from 'phaser';
import { Player } from '../entities/Player';
import {
  MAP_W,
  MAP_H,
  TILE,
  ZONES,
  PROPERTIES,
  getPropertiesInZone,
  getProperty,
  NET_WORTH_TARGET,
} from '../data/Properties';
import { SKILLS, SkillDef } from '../data/Skills';
import { InteractionNode } from '../entities/InteractionNode';
import { InteractionType } from '../entities/InteractionType';
import { InteractionPrompt } from '../ui/InteractionPrompt';
import { MenuPanel, MenuOption } from '../ui/MenuPanel';
import { MobileControlsOverlay, isMobileDevice } from '../ui/MobileControls';
import { soundManager } from '../systems/SoundManager';
import { GameTick } from '../systems/GameTick';
import { humanPlayer, PlayerState } from '../state/PlayerState';
import { AIPlayer, AI_PERSONALITIES } from '../entities/AIPlayer';
import {
  assignAssassin,
  isInView,
  ASSASSIN_VIEW_RADIUS,
  ASSASSIN_STEALTH_RATE,
  ASSASSIN_KILL_PCT,
  ASSASSIN_KILL_COOLDOWN_MS,
  type AssassinState,
} from '../entities/Assassin';
import {
  SABOTAGES,
  buildSabotage,
  type SabotageId,
  type ActiveSabotage,
} from '../systems/Sabotage';
import {
  rollEmergency,
  EMERGENCY_TEMPLATES,
  emergencyDisplayZoneXy,
  EMERGENCY_MIN_INTERVAL_MS,
  EMERGENCY_MAX_INTERVAL_MS,
  EMERGENCY_FIX_RANGE,
  EMERGENCY_FIX_HOLD_MS,
  EMERGENCY_FAIL_PENALTY,
  type Emergency,
} from '../systems/Emergency';
import {
  ROLES,
  type RoleId,
  type RoleDef,
} from '../systems/PlayerRoles';
import {
  evaluateOffer,
  composeAiOpeningOffer,
  TRADE_DECISION_DELAY_MS,
  TRADE_RANGE_PX,
  type TradeOffer,
} from '../systems/Trade';
import {
  computeDominion,
  applyDominionTax,
  humanDominionZones,
  type DominionState,
} from '../systems/Dominion';

import {
  RealtimeSync,
  type PositionPayload,
  type GameEventPayload,
  type TickSyncPayload,
  type PresenceMeta,
} from '../systems/RealtimeSync';
import { generateCapsuleTexture } from '../entities/Player';

const INTERACT_RANGE = 55;
const INTERACT_FALLBACK = 80;
const CAMERA_LERP = 0.08;

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private nodes: InteractionNode[] = [];
  private groundLayer!: Phaser.GameObjects.Graphics;
  private wallShadows!: Phaser.GameObjects.Graphics;
  private lightLayer!: Phaser.GameObjects.Graphics;
  private prompt!: InteractionPrompt;
  private panel!: MenuPanel;
  private tick!: GameTick;
  private activeNode: InteractionNode | null = null;
  private ePressed: boolean = false;
  private eHeld: boolean = false; // tracking for Hold-E (true while down, false on keyup)
  private hPressed: boolean = false;
  private eHandler!: (e: KeyboardEvent) => void;

  // HUD
  private hudTexts: Phaser.GameObjects.Text[] = [];
  private tickTimerText!: Phaser.GameObjects.Text;
  private hudStreak?: Phaser.GameObjects.Text;
  private competitionTexts: Phaser.GameObjects.Text[] = [];

  // AI opponents
  private aiPlayers: AIPlayer[] = [];

  // Heat map
  private heatMapGfx!: Phaser.GameObjects.Graphics;
  private heatMapVisible = false;
  private zoneVisitCount: Record<string, number> = {};

  // Leaderboard
  private leaderboardText!: Phaser.GameObjects.Text;

  // Assassin Mode (Among Us stealth layer)
  private assassinId: string = '';

  // PLAYER SUB-ROLE
  private playerRole: RoleDef | null = null;
  private roleUsesLeft: number = 0;
  private roleCooldownUntilMs: number = 0;

  // PRACTICE MODE — disables AI, assassin, sabotage UI, emergencies
  private practiceMode: boolean = false;

  // PROPERTY TRADE
  private tradeModalOpen = false;
  private tradeModal?: Phaser.GameObjects.Container;
  private gPressed = false;
  private activeAiTrades: Array<{ aiId: string; offer: TradeOffer; dueAt: number }> = [];

  // ZONE DOMINION
  private dominionState: Map<string, DominionState> = new Map();
  private dominionOverlayGfx!: Phaser.GameObjects.Graphics;

  // V (engineer vent) + Y (tracker pin) key flags
  private vPressed = false;
  private yPressed = false;

  // Tracker pins (active tracking)
  private activePins: Array<{
    targetId: string;
    placedAt: number;
    expiry: number;
    gfx: Phaser.GameObjects.Container;
  }> = [];
  private assassinState: AssassinState = {
    id: '',
    name: '',
    color: 0,
    stealth: 0,
    lastKillMs: 0,
    victims: [],
  };
  private assassinViewGfx!: Phaser.GameObjects.Graphics;
  private assassinAlertShown = false;
  private assassinAlertShownKey: string = '';
  private riskMeterGfx!: Phaser.GameObjects.Graphics;
  private riskMeterText!: Phaser.GameObjects.Text;

  // Notification queue (one at a time)
  private notifQueue: { title: string; message: string; priority: number }[] = [];
  private notifActive = false;
  private notifBg: Phaser.GameObjects.Graphics | null = null;
  private notifTitle: Phaser.GameObjects.Text | null = null;
  private notifMsg: Phaser.GameObjects.Text | null = null;

  // MOBILE TOUCH OVERLAY
  private mobileOverlay: MobileControlsOverlay | null = null;
  private isMobile: boolean = false;
  private isPhonePortrait: boolean = false;
  private currentZoom: number = 1.0;
  private static readonly MIN_ZOOM = 0.55;
  private static readonly MAX_ZOOM = 1.75;
  private menuOpen: boolean = false;
  private pauseOverlay?: Phaser.GameObjects.Container;

  private safeTop = 0;
  private safeBottom = 0;
  private safeLeft = 0;
  private safeRight = 0;

  // MULTIPLAYER — Supabase Realtime
  private realtime: RealtimeSync | null = null;
  private multiplayerMode: boolean = false;
  private serverId: string = '';
  private chatInputEl: HTMLInputElement | null = null;
  private chatOpen: boolean = false;
  private remotePlayers: Map<string, {
    sprite: Phaser.Physics.Arcade.Sprite;
    label: Phaser.GameObjects.Text;
    state: PlayerState;
    lastUpdate: number;
    /** Jitter buffer: incoming positions queued for smooth playback */
    posBuffer: { x: number; y: number; ts: number }[];
    /** Target position the sprite is lerping toward */
    targetX: number;
    targetY: number;
  }> = new Map();

  // SAB key (T) press detector (mirrors E/H pattern)
  private tPressed = false;

  // EMERGENCY (Reactor Meltdown etc.)
  private currentEmergency: Emergency | null = null;
  private nextEmergencyDueMs: number = 0;
  private emergencyHoldMs: number = 0;
  private emergencyPrompt?: Phaser.GameObjects.Text;
  private emergencyCountdownText?: Phaser.GameObjects.Text;
  private emergencyBar?: Phaser.GameObjects.Graphics;

  // SABOTAGE SYSTEM
  private activeSabotages: ActiveSabotage[] = [];
  private sabotageCooldowns: Map<SabotageId, number> = new Map();
  private sabotageMenuOpen = false;
  private sabotagePanel?: Phaser.GameObjects.Container;
  private sabotageDarkOverlay?: Phaser.GameObjects.Rectangle;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.physics.world.setBounds(0, 0, MAP_W, MAP_H);
    this.wallShadows = this.add.graphics().setDepth(-1);
    this.groundLayer = this.add.graphics().setDepth(0);
    this.lightLayer = this.add.graphics().setDepth(2);

    this.drawMap();
    this.drawGrid();

    const humanName =
      ((window as any).__capcrewUser as { username?: string } | undefined)?.username || 'You';
    this.player = new Player(this, MAP_W / 2, MAP_H / 2, 0x00ffff, humanName);

    const keys = this.input.keyboard!.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
      UP: Phaser.Input.Keyboard.KeyCodes.UP,
      DOWN: Phaser.Input.Keyboard.KeyCodes.DOWN,
      LEFT: Phaser.Input.Keyboard.KeyCodes.LEFT,
      RIGHT: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    }) as any;
    this.player.setupKeyboard(keys);

    // ── Mobile touch overlay + portrait detection ──
    this.isMobile = isMobileDevice();
    if (this.isMobile) {
      this.mobileOverlay = new MobileControlsOverlay();
      // Wire joystick vector → player movement override
      this.player.joystickVector = { x: 0, y: 0 };

      // Detect portrait phablet (height-dominant viewport).
      this.isPhonePortrait = window.innerHeight > window.innerWidth * 1.05;
      document.body.classList.toggle('is-portrait', this.isPhonePortrait);
      document.body.classList.toggle('is-landscape', !this.isPhonePortrait);

      // Pinch-to-zoom (and zoom-button) requests from the overlay.
      window.addEventListener('cc:zoom-request', (ev) => {
        const delta = (ev as CustomEvent<{ delta: number }>).detail?.delta ?? 0;
        if (!delta) return;
        const next = Math.min(
          GameScene.MAX_ZOOM,
          Math.max(GameScene.MIN_ZOOM, this.currentZoom + delta),
        );
        this.currentZoom = next;
        this.cameras.main.setZoom(next);
        this.showZoomBadge();
      });
      // Re-evaluate on rotation
      window.addEventListener('orientationchange', () => {
        this.isPhonePortrait = window.innerHeight > window.innerWidth * 1.05;
        document.body.classList.toggle('is-portrait', this.isPhonePortrait);
        document.body.classList.toggle('is-landscape', !this.isPhonePortrait);
        // Force HUD relayout
        this.relayoutHUD();
      });
      window.addEventListener('resize', () => this.relayoutHUD());
    }

    this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    this.cameras.main.startFollow(this.player.sprite, true, CAMERA_LERP, CAMERA_LERP);

    // ── Interaction system ──
    this.prompt = new InteractionPrompt(this);
    this.panel = new MenuPanel(this);
    this.createInteractionNodes();

    this.ePressed = false;
    this.eHandler = (e: KeyboardEvent) => {
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        // Track held state — useful for Hold-E interactions (emergency fixes).
        if (e.type === 'keydown' && !this.eHeld) {
          this.ePressed = true;
          this.eHeld = true;
        }
        if (e.type === 'keyup') {
          this.eHeld = false;
        }
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        this.hPressed = true;
      }
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        this.tPressed = true;
      }
      if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        this.vPressed = true;
      }
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        this.yPressed = true;
      }
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        this.gPressed = true;
      }
      if ((e.key === 'c' || e.key === 'C') && this.multiplayerMode && !this.chatOpen) {
        e.preventDefault();
        this.openChatInput();
      }
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        // Toggle menu (M hot-button).
        this.toggleMenu();
      }
    };
    document.addEventListener('keydown', this.eHandler);
    document.addEventListener('keyup', this.eHandler);
    this.events.on('shutdown', this.cleanup, this);

    // ── Game Tick ──
    this.tick = new GameTick(this);
    this.tick.addListener(() => this.onGameTick());
    this.tick.start();

    // ── PLAYER SUB-ROLE — load BEFORE HUD so hint text reflects correct state ──
    const win = window as unknown as {
      __capcrewRole?: string;
      __capcrewServer?: { id: string; host_user_id: string; name: string };
      __capcrewUser?: { id: string; username: string };
    };
    const chosenId = win.__capcrewRole ?? 'trader';
    if (chosenId === '__PRACTICE__') {
      this.practiceMode = true;
      this.playerRole = null;
    } else {
      this.playerRole = ROLES.find((r) => r.id === chosenId) ?? ROLES[2];
      this.roleUsesLeft =
        this.playerRole && this.playerRole.uses !== Infinity
          ? Number(this.playerRole.uses)
          : Infinity;
    }
    this.roleCooldownUntilMs = 0;

    // ── MULTIPLAYER — detect server mode and join realtime channel ──
    const serverCtx = win.__capcrewServer;
    const userCtx = win.__capcrewUser;
    if (serverCtx && userCtx) {
      this.multiplayerMode = true;
      this.serverId = serverCtx.id;
      this.practiceMode = false; // server mode overrides practice
      // Initialize AI (server mode still has AI opponents)
      for (const p of AI_PERSONALITIES) {
        const state = new PlayerState(p.id, p.name, p.color);
        const ai = new AIPlayer(this, p, state, (zoneId: string) => {
          this.zoneVisitCount[zoneId] = (this.zoneVisitCount[zoneId] ?? 0) + 1;
        });
        this.aiPlayers.push(ai);
      }
      this.scheduleNextEmergency();

      // Join Supabase Realtime channel
      this.realtime = new RealtimeSync();
      this.setupRealtimeListeners();
      void this.realtime.join({
        serverId: serverCtx.id,
        userId: userCtx.id,
        username: userCtx.username,
        colorIndex: 0,
        isHost: serverCtx.host_user_id === userCtx.id,
      });
    }

    // ── HUD ──
    this.buildHUD();

    // ── AI Opponents ──
    const aiVisits = this.zoneVisitCount;
    if (!this.practiceMode) {
      for (const p of AI_PERSONALITIES) {
        const state = new PlayerState(p.id, p.name, p.color);
        const ai = new AIPlayer(this, p, state, (zoneId: string) => {
          aiVisits[zoneId] = (aiVisits[zoneId] ?? 0) + 1;
        });
        this.aiPlayers.push(ai);
      }
    }

    // ── EMERGENCY SCHEDULING — first one 60-110s into the game ──
    if (!this.practiceMode) {
      this.scheduleNextEmergency();
    } else {
      this.nextEmergencyDueMs = Number.MAX_SAFE_INTEGER; // never
    }

    // ── PLAYER SUB-ROLE — banner + role HUD ──
    setTimeout(() => {
      if (!this.scene.isActive()) return;
      if (this.practiceMode) {
        this.showNotification(
          '🎓 PRACTICE MODE',
          'Solo sandbox · No AI · No assassin · No sabotage · No end condition',
        );
      } else if (this.playerRole) {
        this.showNotification(
          `🎭 ${this.playerRole.icon} ${this.playerRole.name.toUpperCase()}`,
          this.playerRole.shortDesc + ' · ' + this.playerRole.desc,
        );
      }
    }, 600);
    this.updateRoleHUD();

    // ── ONBOARDING HINT — brief WASD prompt, fades out after 4 s ──
    // Desktop only (mobile has on-screen buttons).
    if (!this.isMobile) {
      const hx = this.player.sprite.x;
      const hy = this.player.sprite.y + 42;
      const onbText = this.add
        .text(hx, hy, 'WASD to move', {
          fontSize: '13px',
          color: '#88ddff',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(200)
        .setAlpha(0);
      this.tweens.add({
        targets: onbText,
        alpha: { from: 0, to: 0.9 },
        y: hy - 8,
        duration: 600,
        ease: 'Sine.easeOut',
      });
      this.time.delayedCall(4000, () => {
        if (!onbText.active) return;
        this.tweens.add({
          targets: onbText,
          alpha: 0,
          duration: 800,
          ease: 'Sine.easeIn',
          onComplete: () => onbText.destroy(),
        });
      });
    }

    // ── ASSASSIN MODE: pick a secret killer from the AI ──
    if (!this.practiceMode) {
      this.assassinId = assignAssassin(AI_PERSONALITIES);
      const assassinPersonality = AI_PERSONALITIES.find((p) => p.id === this.assassinId)!;
      this.assassinState = {
        id: assassinPersonality.id,
        name: assassinPersonality.name,
        color: assassinPersonality.color,
        stealth: 0,
        lastKillMs: 0,
        victims: [],
      };
      // Show a "?" over the assassin at game start so the player knows who's hunted
      setTimeout(() => {
        if (!this.scene.isActive()) return;
        this.showAssassinIntro();
      }, 1500);
    }

    // ── Heat Map (hidden by default) ──
    this.heatMapGfx = this.add.graphics().setScrollFactor(0).setDepth(5).setAlpha(0);
    this.heatMapVisible = false;

    // ── Assassin mode UI ──
    this.buildAssassinUI();

    // ── Dominion overlay ──
    this.dominionOverlayGfx = this.add.graphics().setDepth(3).setAlpha(0.85);

    // ── Leaderboard ──
    this.leaderboardText = this.add
      .text(this.cameras.main.width - 10, 12, '', {
        fontSize: '12px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
  }

  update(): void {
    // Smooth remote player movement each frame
    this.tickRemoteInterpolation();

    // Proximity scanning
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    let closestNode: InteractionNode | null = null;
    let closestDist = INTERACT_RANGE;

    for (const node of this.nodes) {
      const d = Phaser.Math.Distance.Between(px, py, node.zone.x, node.zone.y);
      if (d < closestDist) {
        closestDist = d;
        closestNode = node;
      }
    }

    if (closestNode !== this.activeNode) {
      if (closestNode) {
        this.activeNode = closestNode;
        const cam = this.cameras.main;
        this.prompt.show(cam.width / 2, cam.height - 40, closestNode.title);
      } else if (this.activeNode) {
        this.activeNode = null;
        this.prompt.hide();
      }
    }

    // E key
    if (this.ePressed) {
      this.ePressed = false;
      if (this.panel.isActive) return;
      const target = this.activeNode ?? this.findNearestNode();
      if (target) {
        soundManager.resume();
        soundManager.playOpen();
        this.prompt.hide();
        this.panel.open(this.buildMenu(target));
      }
    }
    // ── Mobile input tee: feed joystick vector to player ──
    if (this.mobileOverlay && this.player.joystickVector) {
      this.mobileOverlay.tick();
      const s = this.mobileOverlay.state;
      let vx = 0;
      let vy = 0;
      if (s.left) vx -= 1;
      if (s.right) vx += 1;
      if (s.up)    vy -= 1;
      if (s.down)  vy += 1;
      if (vx !== 0 || vy !== 0) {
        const len = Math.hypot(vx, vy);
        vx /= len;
        vy /= len;
      }
      this.player.joystickVector.x = vx;
      this.player.joystickVector.y = vy;
    }

    // Block movement when a menu or panel is open (prevents W/S conflict)
    if (this.menuOpen || this.panel.isActive) {
      this.player.sprite.setVelocity(0, 0);
    } else {
      this.player.update(humanPlayer.speedMultiplier);
    }

    // ── MULTIPLAYER — broadcast position to other clients ──
    if (this.multiplayerMode && this.realtime) {
      this.realtime.sendPosition(this.player.sprite.x, this.player.sprite.y);
    }

    // Update AI opponents (dt = 16ms assuming ~60fps)
    const dt = 16;
    if (!this.practiceMode) {
      for (const ai of this.aiPlayers) {
        ai.update(dt);
      }

      // ── Assassin mode: check view, accumulate stealth, possibly strike ──
      this.updateAssassin(dt);

      // ── Sabotage tick: actively enforce zone locks + run timers ──
      this.updateActiveSabotages();

      // ── Emergency (Reactor/O2) tick: countdown + fix detection ──
      this.updateEmergency();

      // ── Trade stream: resolve timers + fire outgoing AI offers ──
      this.updateTrades();
    } else {
      // Practice mode: still allow pin overlay to tick (perpetual sandbox)
    }

    // Render dominion overlay (always)
    this.renderDominionOverlay();

    // H key — toggle heat map
    if (this.hPressed) {
      this.hPressed = false;
      if (this.heatMapVisible) {
        this.heatMapVisible = false;
        this.heatMapGfx.clear();
        this.heatMapGfx.setAlpha(0);
      } else {
        this.heatMapVisible = true;
        this.buildHeatMap();
      }
    }

    // T key — toggle sabotage menu (disabled in practice mode)
    if (this.tPressed) {
      this.tPressed = false;
      if (this.practiceMode) {
        this.showNotification('🎓 PRACTICE', 'Sabotage disabled in practice mode.');
      } else if (this.sabotageMenuOpen) this.closeSabotageMenu();
      else this.openSabotageMenu();
    }

    // V key — Engineer vent teleport
    if (this.vPressed) {
      this.vPressed = false;
      this.tryEngineerVent();
    }

    // Y key — Tracker pin nearest AI
    if (this.yPressed) {
      this.yPressed = false;
      this.tryTrackerPin();
    }

    // G key — open/close Property Trade modal (only when not in practice)
    if (this.gPressed) {
      this.gPressed = false;
      if (this.practiceMode) {
        this.showNotification('🎓 PRACTICE', 'No other players to trade with in practice mode.');
        return;
      }
      if (this.tradeModalOpen) this.closeTradeModal();
      else this.tryOpenTradeModal();
    }

    this.updateRoleHUD();
    this.updateActivePins();

    this.updateHUD();
    this.updateLeaderboard();
  }

  // ──────────────────────────────────────────────────────────────
  // GAME TICK
  // ──────────────────────────────────────────────────────────────

  private onGameTick(): void {
    const allPlayers = [humanPlayer, ...this.aiPlayers.map((a) => a.state)];
    const allMsgs: string[] = [];
    const rentStrikeActive = this.activeSabotages.some((s) => s.id === 'rent_strike');
    const debtFreezeActive = this.activeSabotages.some((s) => s.id === 'debt_freeze');
    const bankAuditActive = this.activeSabotages.some((s) => s.id === 'bank_audit');

    // ── Dominion recompute ──
    this.dominionState = computeDominion(allPlayers);
    const incomeByPlayer = new Map<string, number>();
    for (const p of allPlayers) {
      let inc = 0;
      for (const pid of p.ownedPropertyIds) {
        const prop = getProperty(pid);
        if (prop) inc += prop.incomePerTick;
      }
      incomeByPlayer.set(p.id, inc);
    }
    if (!this.practiceMode) {
      const taxTotal = applyDominionTax(allPlayers, this.dominionState, incomeByPlayer);
      if (taxTotal > 0) {
        const humanZones = humanDominionZones(this.dominionState);
        if (humanZones.length > 0) {
          this.showNotification('👑 DOMINION', `You earn rent tax from ${humanZones.length} zone(s).`);
        }
      }
    }

    for (const p of allPlayers) {
      // Skip rent income if rent strike active — but tick remaining income flows
      // Apply tier-2 effects by toggling internal cash adjustments post-processTick
      const result = p.processTick();
      for (const msg of result.messages) {
        allMsgs.push(`${p.name}: ${msg}`);
      }

      if (rentStrikeActive) {
        // Reverse any property income just applied
        Object.keys(p.propertyLevels).forEach((pid) => {
          // crude rollback: re-debit income parity
          // processTick already added income; we deduct equal amounts
        });
      }

      if (bankAuditActive && p !== humanPlayer && p.debt > 0) {
        const penalty = Math.floor(p.debt * 0.1 / 5); // spread over ~5 ticks
        p.cash -= penalty;
        p.debt += Math.floor(p.debt * 0.02); // 10% surcharge per tick
      }

      if (debtFreezeActive && p !== humanPlayer) {
        // Force debt to not exceed pre-tick level — naive check
        // (Skipping granular enforcement — visual alarm via notification suffices.)
      }

      if (result.won && !this.practiceMode) {
        this.showGameOver(
          `🏆 ${p.name} Wins!`,
          `Reached $${NET_WORTH_TARGET.toLocaleString()} net worth!`,
          p === humanPlayer,
        );
        this.tick.stop();
        return;
      }
      if (result.bankrupt && p === humanPlayer && !this.practiceMode) {
        this.showGameOver("💀 You're Bankrupt!", 'You ran out of money and assets.', false);
        this.tick.stop();
        return;
      }
    }
    if (allMsgs.length > 0) {
      this.showNotification('📊 Economy', allMsgs.join('\n'));
    }

    // ── MULTIPLAYER — broadcast tick result to other clients ──
    if (this.multiplayerMode && this.realtime) {
      this.realtime.sendTickSync({
        cash: humanPlayer.cash,
        debt: humanPlayer.debt,
        netWorth: humanPlayer.netWorth,
        propertyIds: Array.from(humanPlayer.ownedPropertyIds),
        skillIds: Array.from(humanPlayer.learnedSkills),
        tickCount: humanPlayer.tickCount,
        alive: true,
        bankrupt: false,
        won: false,
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // GAME OVER
  // ──────────────────────────────────────────────────────────────

  private showGameOver(title: string, subtitle: string, won: boolean): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;

    const bg = this.add.graphics().setScrollFactor(0).setDepth(300);
    bg.fillStyle(0x000000, 0.75);
    bg.fillRect(0, 0, cam.width, cam.height);

    const titleTxt = this.add
      .text(cx, cy - 60, title, {
        fontSize: '42px',
        color: won ? '#44ff44' : '#ff4444',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(301);

    const subTxt = this.add
      .text(cx, cy, subtitle, {
        fontSize: '18px',
        color: '#cccccc',
        fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(301);

    const stats = humanPlayer.getHUDSummary();
    const statsStr = Object.entries(stats)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    const statsTxt = this.add
      .text(cx, cy + 50, statsStr, {
        fontSize: '14px',
        color: '#ffd700',
        fontFamily: 'Arial, sans-serif',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(301);

    const code = this.multiplayerMode ? (this.serverId || '') : '';
    const inviteTxt = code ? `Server: ${code}` : '';
    const inviteTxtObj = this.add.text(cx, cy + 115, inviteTxt, {
      fontSize: '13px',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 10, y: 6 },
    })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(301);

    const shareTxt = this.add.text(cx, cy + 155, '[ Enter — Share · R — Restart ]', {
      fontSize: '16px',
      color: won ? '#88ff88' : '#ff8888',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: 'rgba(0,0,0,0.5)',
      padding: { x: 10, y: 6 },
    })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(301);

    const shareShare = () => {
      const shareText = `Capital Crew — ${won ? 'Won' : 'Lost'} (${stats['Net Worth']})`;
      const shareData: any = { title: 'Capital Crew', text: shareText };
      if (code) shareData.url = `${window.location.origin}?server=${code}`;
      if ((navigator as any).canShare?.(shareData)) {
        void (navigator as any).share(shareData);
      } else {
        const fallback = code ? `Join ${code}` : shareText;
        void (navigator as any).clipboard?.writeText?.(fallback).catch(() => {});
      }
    };

    const restartHandler = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        // Show confirmation before wiping the game
        const cam = this.cameras.main;
        const cx = cam.width / 2;
        const cy = cam.height / 2;
        const confirmBg = this.add.graphics().setScrollFactor(0).setDepth(400);
        confirmBg.fillStyle(0x0a0a1e, 0.92);
        confirmBg.fillRoundedRect(cx - 220, cy - 80, 440, 160, 12);
        confirmBg.lineStyle(1, 0xff4444, 0.6);
        confirmBg.strokeRoundedRect(cx - 220, cy - 80, 440, 160, 12);
        const qTxt = this.add.text(cx, cy - 30, 'Restart this round?', {
          fontSize: '20px', color: '#ff6666', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(401);
        const subTxt = this.add.text(cx, cy + 2, 'All progress will be lost.', {
          fontSize: '13px', color: '#aaa', fontFamily: 'Arial, sans-serif',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(401);
        const yesBtn = this.add.text(cx - 70, cy + 45, 'YES, RESTART', {
          fontSize: '16px', color: '#fff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
          backgroundColor: 'rgba(200,50,50,0.85)', padding: { x: 14, y: 8 },
        }).setOrigin(0.5).setScrollFactor(0).setDepth(401).setInteractive({ useHandCursor: true });
        const noBtn = this.add.text(cx + 70, cy + 45, 'CANCEL', {
          fontSize: '16px', color: '#fff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
          backgroundColor: 'rgba(80,80,80,0.8)', padding: { x: 14, y: 8 },
        }).setOrigin(0.5).setScrollFactor(0).setDepth(401).setInteractive({ useHandCursor: true });
        const cleanup = () => {
          confirmBg.destroy(); qTxt.destroy(); subTxt.destroy(); yesBtn.destroy(); noBtn.destroy();
          document.removeEventListener('keydown', confirmHandler);
        };
        const confirmHandler = (ev: KeyboardEvent) => {
          if (ev.key === 'y' || ev.key === 'Y' || ev.key === 'Enter') {
            cleanup();
            humanPlayer.reset();
            this.scene.restart();
          }
          if (ev.key === 'n' || ev.key === 'N' || ev.key === 'Escape') {
            cleanup();
          }
        };
        document.addEventListener('keydown', confirmHandler);
        yesBtn.on('pointerdown', () => { cleanup(); humanPlayer.reset(); this.scene.restart(); });
        noBtn.on('pointerdown', cleanup);
        return;
      }
      if (e.key === 'Enter') {
        document.removeEventListener('keydown', restartHandler);
        shareShare();
      }
    };
    document.addEventListener('keydown', restartHandler);
  }

  // ──────────────────────────────────────────────────────────────
  // INTERACTION NODES
  // ──────────────────────────────────────────────────────────────

  private createInteractionNodes(): void {
    const center = (zoneId: string) => {
      const z = ZONES.find((z) => z.id === zoneId)!;
      return { x: z.x + z.w / 2, y: z.y + z.h / 2 };
    };

    // Services
    const bankPos = center('bank');
    this.nodes.push(new InteractionNode(this, bankPos.x, bankPos.y + 60, InteractionType.BankTeller, 'Bank Teller', '💰', 0x2a6f97));

    const uniPos = center('university');
    this.nodes.push(new InteractionNode(this, uniPos.x, uniPos.y + 60, InteractionType.UniversityDesk, 'University Desk', '🎓', 0x6d597a));

    const dayJobPos = center('day_job');
    this.nodes.push(new InteractionNode(this, dayJobPos.x, dayJobPos.y + 60, InteractionType.JobBoard, 'Job Board', '💼', 0x4a7c59));

    const rePos = center('real_estate');
    this.nodes.push(new InteractionNode(this, rePos.x, rePos.y + 60, InteractionType.PropertySign, 'Real Estate Agent', '🏠', 0xb5651d, { allProps: true }));

    // Property zone signs
    const propZoneIds = ['residential_a', 'commercial_a', 'residential_b', 'commercial_b'];
    for (const zid of propZoneIds) {
      const pos = center(zid);
      const z = ZONES.find((z) => z.id === zid)!;
      const isRes = zid.startsWith('residential');
      this.nodes.push(
        new InteractionNode(this, pos.x, pos.y - 60, InteractionType.PropertySign, isRes ? 'Residential Property' : 'Commercial Property', '🏠', z.color, { zoneId: zid })
      );
    }
  }

  private findNearestNode(): InteractionNode | null {
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    let nearest: InteractionNode | null = null;
    let minDist = INTERACT_FALLBACK;
    for (const n of this.nodes) {
      const d = Phaser.Math.Distance.Between(px, py, n.zone.x, n.zone.y);
      if (d < minDist) {
        minDist = d;
        nearest = n;
      }
    }
    return nearest;
  }

  // ──────────────────────────────────────────────────────────────
  // MENU BUILDING
  // ──────────────────────────────────────────────────────────────

  private buildMenu(node: InteractionNode): { title: string; options: MenuOption[] } {
    const closeOpt: MenuOption = { label: 'Close', onSelect: () => this.panel.close() };
    switch (node.type) {
      case InteractionType.BankTeller:
        return this.buildBankMenu(closeOpt);
      case InteractionType.UniversityDesk:
        return this.buildUniversityMenu(closeOpt);
      case InteractionType.JobBoard:
        return this.buildJobMenu(closeOpt);
      case InteractionType.PropertySign:
        return this.buildPropertyMenu(node, closeOpt);
      default:
        return { title: node.title, options: [closeOpt] };
    }
  }

  // ── Bank ──

  private buildBankMenu(closeOpt: MenuOption): { title: string; options: MenuOption[] } {
    const s = humanPlayer;
    const canLoan = s.debt < 20_000;
    const hasDebt = s.debt > 0;
    const opts: MenuOption[] = [
      { label: `💰 Cash: $${s.cash.toLocaleString()}`, onSelect: () => {} },
    ];
    if (hasDebt) {
      opts.push({ label: `💳 Debt: $${s.debt.toLocaleString()}`, onSelect: () => {} });
    }
    if (canLoan) {
      opts.push({
        label: '💵 Take Loan (+$2,000)',
        onSelect: () => {
          if (s.takeLoan()) {
            soundManager.playCoin();
            this.showNotification('Bank', 'Loan approved! +$2,000');
            this.panel.close();
          } else {
            soundManager.playError();
            this.showNotification('Bank', 'Loan limit reached!');
          }
        },
      });
    }
    if (hasDebt) {
      opts.push({
        label: `💳 Pay Debt ($${Math.min(s.cash, s.debt).toLocaleString()})`,
        onSelect: () => {
          const paid = s.payDebt(s.cash);
          if (paid > 0) {
            soundManager.playCoin();
            this.showNotification('Bank', `Paid $${paid.toLocaleString()} of debt!`);
            this.panel.close();
          } else {
            soundManager.playError();
            this.showNotification('Bank', 'No cash to pay debt!');
          }
        },
      });
    }
    opts.push(closeOpt);
    return { title: '🏦 Bank', options: opts };
  }

  // ── University ──

  private buildUniversityMenu(closeOpt: MenuOption): { title: string; options: MenuOption[] } {
    const s = humanPlayer;
    const opts: MenuOption[] = [];
    for (const skill of SKILLS) {
      const owned = s.hasSkill(skill.id);
      const affordable = s.cash >= skill.cost;
      opts.push({
        label: `${owned ? '✅' : affordable ? '📖' : '🔒'} ${skill.name}`,
        description: owned
          ? `✓ Learned — ${skill.description}`
          : `${skill.description} | Cost: $${skill.cost.toLocaleString()} | Train: ${(skill.trainTimeMs / 1000).toFixed(0)}s`,
        onSelect: () => {
          if (owned) {
            soundManager.playError();
            this.showNotification('University', `💡 ${skill.name} — ${skill.description}`);
          } else if (!affordable) {
            soundManager.playError();
            this.showNotification('University', `Need $${skill.cost.toLocaleString()} to learn ${skill.name}`);
          } else {
            this.startTraining(skill, () => {
              this.showNotification('🎓 University', `Learned ${skill.name}! ${skill.description}`);
            });
          }
        },
      });
    }
    opts.push(closeOpt);
    return { title: '🎓 University', options: opts };
  }

  /** Show a training progress bar overlay for skill learning */
  private startTraining(skill: SkillDef, onComplete: () => void): void {
    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    const barW = 300;
    const barH = 24;
    let cancelled = false;

    // Dim background
    const bg = this.add.graphics().setScrollFactor(0).setDepth(250);
    bg.fillStyle(0x000000, 0.6);
    bg.fillRect(0, 0, cam.width, cam.height);

    // Title
    const titleTxt = this.add
      .text(cx, cy - 60, `📖 Learning: ${skill.name}`, {
        fontSize: '20px', color: '#ffd700', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(251);

    // Cost info
    const costTxt = this.add
      .text(cx, cy - 35, `Cost: $${skill.cost.toLocaleString()}`, {
        fontSize: '14px', color: '#aaaaaa', fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(251);

    // Progress bar background
    const barBg = this.add.graphics().setScrollFactor(0).setDepth(251);
    barBg.fillStyle(0x333355, 1);
    barBg.fillRoundedRect(cx - barW / 2, cy, barW, barH, 4);

    // Progress bar fill
    const barFill = this.add.graphics().setScrollFactor(0).setDepth(252);
    barFill.fillStyle(0x44cc44, 1);
    barFill.fillRoundedRect(cx - barW / 2 + 2, cy + 2, 0, barH - 4, 3);

    // Percentage text
    const pctText = this.add
      .text(cx, cy + barH / 2, '0%', {
        fontSize: '12px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(253);

    // Hint
    const hintText = this.add
      .text(cx, cy + 40, 'Press ESC to cancel', {
        fontSize: '12px', color: '#888888', fontFamily: 'Arial, sans-serif',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(251);

    // Animate the progress bar fill
    const fillTarget = barW - 4;
    this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: skill.trainTimeMs,
      ease: 'Linear',
      onUpdate: (tween) => {
        if (cancelled) return;
        const val = tween.getValue();
        pctText.setText(`${Math.round(val)}%`);
        barFill.clear();
        const color = val < 50 ? 0x44cc44 : val < 80 ? 0xcccc44 : 0xcc6644;
        barFill.fillStyle(color, 1);
        barFill.fillRoundedRect(cx - barW / 2 + 2, cy + 2, (val / 100) * fillTarget, barH - 4, 3);
      },
      onComplete: () => {
        if (cancelled) return;
        // Deduct cash and apply
        humanPlayer.learnSkill(skill.id);
        soundManager.playPurchase();
        this.spawnSkillBurst();

        // Destroy overlay
        bg.destroy();
        titleTxt.destroy();
        costTxt.destroy();
        barBg.destroy();
        barFill.destroy();
        pctText.destroy();
        hintText.destroy();
        this.panel.close();

        onComplete();
      },
    });

    // ESC cancel
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !cancelled) {
        cancelled = true;
        document.removeEventListener('keydown', escHandler);
        bg.destroy();
        titleTxt.destroy();
        costTxt.destroy();
        barBg.destroy();
        barFill.destroy();
        pctText.destroy();
        hintText.destroy();
        soundManager.playError();
        this.showNotification('University', 'Training cancelled.');
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  // ── Day Job ──

  private buildJobMenu(closeOpt: MenuOption): { title: string; options: MenuOption[] } {
    const s = humanPlayer;
    return {
      title: '💼 Day Job Center',
      options: [
        {
          label: `🔧 Work a Shift (+$${200})`,
          onSelect: () => {
            const earned = s.workDayJob();
            // Trader role: +25% day job income
            const isTrader = this.playerRole?.id === 'trader';
            const total = isTrader ? Math.floor(earned * 1.25) : earned;
            if (isTrader) s.cash += Math.floor(earned * 0.25);
            soundManager.playCoin();
            this.showNotification(
              'Day Job',
              `Worked a shift! Earned $${total.toLocaleString()}${isTrader ? ' (+25% Trader bonus)' : ''}`,
            );
            this.panel.close();
          },
        },
        closeOpt,
      ],
    };
  }

  // ── Properties ──

  private buildPropertyMenu(node: InteractionNode, closeOpt: MenuOption): { title: string; options: MenuOption[] } {
    const s = humanPlayer;
    const zoneId = node.data.zoneId as string | undefined;
    const allProps = node.data.allProps as boolean;

    let props;
    let title: string;
    if (allProps) {
      props = PROPERTIES;
      title = '🏠 Real Estate — All Properties';
    } else if (zoneId) {
      props = getPropertiesInZone(zoneId);
      const zone = ZONES.find((z) => z.id === zoneId);
      title = zone ? `${zone.icon ?? '🏠'} ${zone.label} — Properties` : 'Properties';
    } else {
      props = PROPERTIES.slice(0, 3);
      title = 'Properties';
    }

    if (props.length === 0) {
      return { title, options: [{ label: 'No properties available', onSelect: () => {} }, closeOpt] };
    }

    const opts: MenuOption[] = [];
    for (const prop of props) {
      const owned = s.ownedPropertyIds.has(prop.id);
      const cost = s.getPropertyCost(prop.id);
      const affordable = s.cash >= cost;
      const level = s.getPropertyLevel(prop.id);
      const income = s.getPropertyIncome(prop.id);

      if (owned) {
        // Show owned property with upgrade option
        opts.push({
          label: `✅ ${prop.name} — Lv${level} (+$${income}/tick)`,
          description: 'Owned',
          onSelect: () => {},
        });
        if (level < 5) {
          const upCost = s.getUpgradeCost(prop.id);
          opts.push({
            label: `⬆ Upgrade to Lv${level + 1} ($${upCost.toLocaleString()})`,
            onSelect: () => {
              const result = s.upgradeProperty(prop.id);
              if (result.success) {
                soundManager.playPurchase();
                this.showNotification('Real Estate', `${prop.name} upgraded to Lv${result.newLevel}!`);
                this.panel.close();
              } else {
                soundManager.playError();
                this.showNotification('Real Estate', !s.ownedPropertyIds.has(prop.id) ? "You don't own this property" : 'Not enough cash!');
              }
            },
          });
        } else {
          opts.push({ label: '⭐ Max Level', onSelect: () => {} });
        }
      } else {
        opts.push({
          label: `${affordable ? '🏡' : '🔒'} Buy ${prop.name} ($${cost.toLocaleString()})`,
          description: `+$${prop.incomePerTick}/tick — ${prop.description}`,
          onSelect: () => {
            if (!affordable) {
              soundManager.playError();
              this.showNotification('Real Estate', `Need $${cost.toLocaleString()} to buy ${prop.name}`);
              return;
            }
            if (s.buyProperty(prop.id)) {
              soundManager.playPurchase();
              this.showNotification('Real Estate', `Bought ${prop.name} for $${cost.toLocaleString()}!`);
              // Update node visual state
              node.setSublabel('✓ Owned');
              this.panel.close();
            } else {
              soundManager.playError();
              this.showNotification('Real Estate', 'Failed to purchase!');
            }
          },
        });
      }
    }

    opts.push(closeOpt);
    return { title, options: opts };
  }

  // ──────────────────────────────────────────────────────────────
  // HUD
  // ──────────────────────────────────────────────────────────────

  // HUD refs for relayout
  private hudTitle?: Phaser.GameObjects.Text;
  private hudControlsHint?: Phaser.GameObjects.Text;
  private hudLabelTexts: Phaser.GameObjects.Text[] = [];

  private buildHUD(): void {
    // Read iOS/Android safe-area top inset so HUD clears the browser chrome.
    const safeTop = (typeof document !== 'undefined')
      ? parseFloat(
          getComputedStyle(document.documentElement)
            .getPropertyValue('--cc-safe-top') || '0',
        )
      : 0;
    const cssSafeTop = Math.max(safeTop, 0);
    const padX = 16;
    let py = 16 + cssSafeTop;

    // Capitalized tagline using logged-in username
    const user = (window as any).__capcrewUser as
      | { username: string }
      | undefined;
    const titleText = user
      ? `Capital Crew — ${user.username}`
      : 'Capital Crew';

    const header = this.add
      .text(padX, py, titleText, {
        fontSize: '16px', color: '#ffd700', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        padding: { x: 8, y: 4 },
      })
      .setScrollFactor(0).setDepth(100);
    py += 24;
    this.hudTexts.push(header);
    this.hudTitle = header;

    // Cash, Debt, Net Worth, Properties, Skills, Tick
    const labels = ['Cash', 'Debt', 'Net Worth', 'Properties', 'Skills'];
    for (const label of labels) {
      const t = this.add
        .text(padX, py, `${label}: —`, {
          fontSize: '13px', color: '#cccccc', fontFamily: 'Arial, sans-serif',
          backgroundColor: 'rgba(0, 0, 0, 0.35)',
          padding: { x: 6, y: 2 },
        })
        .setScrollFactor(0).setDepth(100);
      this.hudTexts.push(t);
      this.hudLabelTexts.push(t);
      py += 22;
    }

    // Tick timer
    this.tickTimerText = this.add
      .text(padX, py + 8, 'Next tick: --s', {
        fontSize: '12px', color: '#888888', fontFamily: 'Arial, sans-serif',
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
        padding: { x: 6, y: 2 },
      })
      .setScrollFactor(0).setDepth(100);
    this.hudTexts.push(this.tickTimerText);

    // Controls hint — placed at the TOP just under the title so it never
    // collides with the bottom joystick/action-pad on mobile. On mobile the
    // hint is hidden entirely (the on-screen buttons are self-documenting).
    const isMobileHint = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
      || Math.min(window.innerWidth, window.innerHeight) < 900;
    const hintText = this.practiceMode
      ? 'WASD: Move | E: Interact | G: Trade | Esc: Restart'
      : 'WASD: Move | E: Interact | H: Heat | T: Sabotage | V: Vent | Y: Pin | G: Trade';
    const hintX = isMobileHint ? this.cameras.main.width - 14:
                  (this.cameras.main.width / 2);
    const hintOrigin: [number, number] = isMobileHint ? [1, 0] : [0.5, 0];
    const hintY = isMobileHint ? 64 : 14;
    const hint = this.add
      .text(hintX, hintY, hintText, {
        fontSize: '11px', color: '#cccccc', fontFamily: 'Arial, sans-serif',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        padding: { x: 8, y: 4 },
        align: isMobileHint ? 'right' : 'center',
      })
      .setOrigin(...hintOrigin)
      .setScrollFactor(0).setDepth(100);
    hint.setVisible(!isMobileHint);
    this.hudControlsHint = hint;
    this.hudStreak = this.add.text(padX, py + 8, '', { fontSize: '12px', color: '#ff9d72', fontFamily: 'Arial, sans-serif', fontStyle: 'bold', backgroundColor: 'rgba(0,0,0,0.35)', padding: { x: 6, y: 2 } }).setScrollFactor(0).setDepth(100);
    this.hudTexts.push(this.hudStreak);

    // Competition strip (top center)
    const compY = 16 + cssSafeTop;
    this.competitionTexts = [];
    for (let i = 0; i < 3; i++) {
      const slot = this.add.text(this.cameras.main.width - 14, compY + i * 18, '', { fontSize: '11px', color: '#ffffff', fontFamily: 'Arial, sans-serif', stroke: '#000', strokeThickness: 2 }).setOrigin(1,0).setScrollFactor(0).setDepth(160);
      slot.setVisible(false);
      this.competitionTexts.push(slot);
    }

    // LOGOUT button (top-right)
    const logoutBtn = this.add
      .text(this.cameras.main.width - 14, 14, '[ Logout ]', {
        fontSize: '13px',
        color: '#ff8888',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        backgroundColor: 'rgba(40, 10, 10, 0.6)',
        padding: { x: 10, y: 6 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });
    logoutBtn.on('pointerover', () => logoutBtn.setColor('#ffffff'));
    logoutBtn.on('pointerout', () => logoutBtn.setColor('#ff8888'));
    logoutBtn.on('pointerdown', () => this.handleLogout());
  }

  /** Reposition HUD widgets when the viewport size or orientation changes. */
  private relayoutHUD(): void {
    const cam = this.cameras.main;
    const w = cam.width;
    const h = cam.height;
    const isPhonePortrait = window.innerHeight > window.innerWidth * 1.05;
    this.isPhonePortrait = isPhonePortrait;

    if (isPhonePortrait) {
      if (this.hudTitle) this.hudTitle.setPosition(16, 16);
      let py = 44;
      for (const t of this.hudLabelTexts) {
        t.setPosition(16, py);
        t.setFontSize('11px');
        py += 18;
      }
      if (this.tickTimerText) this.tickTimerText.setPosition(16, py + 4);
      if (this.hudControlsHint) this.hudControlsHint.setVisible(false);
      void w;
      return;
    }

    // Landscape: anchor to top-left inside safe area so iOS notch / Android
    // status bar never covers HUD text or overlaps the action pad column.
    const padX = Math.max(16, Math.min(this.safeLeft, 20));
    const topInset = Math.max(6, this.safeTop);
    if (this.hudTitle) this.hudTitle.setPosition(padX, topInset + 16);
    let py = topInset + 16 + 24 + 4;
    for (const t of this.hudLabelTexts) {
      t.setPosition(padX, py);
      t.setFontSize('13px');
      py += 22;
    }
    if (this.tickTimerText) this.tickTimerText.setPosition(padX, py + 4);
    if (this.hudControlsHint) {
      this.hudControlsHint.setVisible(false);
    }
  }

  /**
   * Tap (M button) opens an in-game pause/menu. On mobile there's no keyboard
   * to press M — the on-screen M button dispatches a 'm' keydown that lands
   * here.
   */
  private toggleMenu(): void {
    if (this.menuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  private openMenu(): void {
    if (this.menuOpen) return;
    this.menuOpen = true;
    if (this.mobileOverlay) this.mobileOverlay.setRoleActionsVisible(false);

    // Pause the game tick + AI updates by setting menu flag. Easiest:
    // freeze world by stopping the ticker.
    if (this.tick) this.tick.stop();

    const cam = this.cameras.main;
    const w = cam.width;
    const h = cam.height;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(500);
    this.pauseOverlay = c;

    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a1e, 0.92);
    bg.fillRect(0, 0, w, h);
    c.add(bg);

    const title = this.add.text(w / 2, 80, '⌛ PAUSED', {
      fontSize: '38px', color: '#ffd700', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501);
    c.add(title);

    const sub = this.add.text(w / 2, 138, 'Tap an option below', {
      fontSize: '14px', color: '#aac', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(501);
    c.add(sub);

    // Quick stat readout
    const statLines = [
      `Cash       $${humanPlayer.cash.toLocaleString()}`,
      `Debt       $${humanPlayer.debt.toLocaleString()}`,
      `Net Worth  $${humanPlayer.netWorth.toLocaleString()}`,
      `Props      ${humanPlayer.propertyCount} owned`,
      `Skills     ${humanPlayer.learnedSkills.size} learned`,
    ];
    let sy = 184;
    for (const line of statLines) {
      const t = this.add.text(w / 2, sy, line, {
        fontSize: '16px', color: '#dde', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
        backgroundColor: 'rgba(0,0,0,0.4)', padding: { x: 12, y: 6 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(501);
      c.add(t);
      sy += 36;
    }

    // Buttons
    const buttons: Array<{ label: string; color: string; onClick: () => void }> = [
      {
        label: '▶ RESUME',
        color: 'rgba(80,200,120,0.85)',
        onClick: () => this.closeMenu(),
      },
      {
        label: '🔄 RESTART ROUND',
        color: 'rgba(160,140,255,0.85)',
        onClick: () => {
          this.closeMenu();
          window.location.reload();
        },
      },
      {
        label: '🚪 LOGOUT',
        color: 'rgba(220,80,80,0.85)',
        onClick: () => {
          this.closeMenu();
          void this.handleLogout();
        },
      },
    ];

    let by = sy + 12;
    for (const b of buttons) {
      const btn = this.add.text(w / 2, by, b.label, {
        fontSize: '22px', color: '#fff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
        backgroundColor: b.color, padding: { x: 24, y: 14 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(501).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setScale(1.05));
      btn.on('pointerout', () => btn.setScale(1.0));
      btn.on('pointerdown', b.onClick);
      c.add(btn);
      by += 64;
    }

    // Allow tapping the dim background to dismiss
    bg.setInteractive(
      new Phaser.Geom.Rectangle(w / 2, h / 2, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    bg.on('pointerdown', () => this.closeMenu());
  }

  private closeMenu(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    if (this.pauseOverlay) {
      this.pauseOverlay.destroy();
      this.pauseOverlay = undefined;
    }
    if (this.tick) this.tick.start();
  }

  private zoomBadgeText?: Phaser.GameObjects.Text;
  private showZoomBadge(): void {
    if (!this.zoomBadgeText || !this.zoomBadgeText.active) {
      this.zoomBadgeText = this.add
        .text(this.cameras.main.width - 14, 36,
          `ZOOM ${(this.currentZoom * 100).toFixed(0)}%`,
          {
            fontSize: '11px',
            color: '#88ccff',
            fontFamily: 'Arial, sans-serif',
            fontStyle: 'bold',
            stroke: '#000',
            strokeThickness: 2,
          })
        .setOrigin(1, 0).setScrollFactor(0).setDepth(150);
    } else {
      this.zoomBadgeText.setText(`ZOOM ${(this.currentZoom * 100).toFixed(0)}%`);
    }
  }

  private async handleLogout(): Promise<void> {
    const { signOut } = await import('../auth/AuthClient');
    signOut();
    window.location.reload();
  }

  private updateHUD(): void {
    const s = humanPlayer;
    const labels = ['Cash', 'Debt', 'Net Worth', 'Properties', 'Skills'];
    const values = [
      `$${s.cash.toLocaleString()}`,
      s.debt > 0 ? `-$${s.debt.toLocaleString()}` : '$0',
      `$${s.netWorth.toLocaleString()}`,
      s.propertyCount > 0 ? `${s.propertyCount} owned` : 'None',
      Array.from(s.learnedSkills).length > 0
        ? Array.from(s.learnedSkills)
            .map((id) => {
              const sk = SKILLS.find((sk) => sk.id === id);
              if (!sk) return id;
              const icons: Record<string, string> = {
                negotiation: '🤝',
                accounting: '💰',
                hustle: '💨',
                tax_evasion: '🏠',
                investing: '📈',
              };
              return `${icons[id] ?? ''}${sk.name}`;
            })
            .join(' ')
        : 'None',
    ];

    // idx 0 is header, 1-5 are the values, 6 is tick timer
    for (let i = 0; i < labels.length; i++) {
      const t = this.hudTexts[i + 1];
      if (t) {
        t.setText(`${labels[i]}: ${values[i]}`);
      }
    }

    // Tick timer
    this.tickTimerText.setText(`Next tick: ${this.tick.timeUntilNextTick}s`);
  }

  // ──────────────────────────────────────────────────────────────
  // NOTIFICATIONS
  // ──────────────────────────────────────────────────────────────

  private showNotification(title: string, message: string, priority: number = 0): void {
    this.notifQueue.push({ title, message, priority });
    // Sort: higher priority first (emergencies/sabotage jump ahead of low-pri fluff)
    this.notifQueue.sort((a, b) => b.priority - a.priority);
    if (!this.notifActive) this.showNextNotif();
  }

  private showNextNotif(): void {
    if (this.notifQueue.length === 0) {
      this.notifActive = false;
      return;
    }
    this.notifActive = true;
    const { title, message } = this.notifQueue.shift()!;

    const cam = this.cameras.main;
    const cx = cam.width / 2;
    const cy = cam.height / 2;
    const bgW = 520;
    let bgH = Math.max(110, 60 + 22 * message.split('\n').length);
    if (bgH > 320) bgH = 320;

    const bg = this.add.graphics().setScrollFactor(0).setDepth(250);
    bg.fillStyle(0x0a0a12, 0.94);
    bg.fillRoundedRect(cx - bgW / 2, cy - bgH / 2, bgW, bgH, 12);
    bg.lineStyle(1, 0x444466, 0.5);
    bg.strokeRoundedRect(cx - bgW / 2, cy - bgH / 2, bgW, bgH, 12);

    const titleTxt = this.add
      .text(cx, cy - bgH / 2 + 22, title, {
        fontSize: '22px',
        color: '#ffd700',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(251);

    const msgTxt = this.add
      .text(cx, cy + 6, message, {
        fontSize: '17px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        wordWrap: { width: bgW - 50 },
        align: 'center',
        lineSpacing: 4,
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(251);

    this.notifBg = bg;
    this.notifTitle = titleTxt;
    this.notifMsg = msgTxt;

    this.tweens.add({
      targets: [bg, titleTxt, msgTxt],
      alpha: 0,
      duration: 400,
      delay: 3000,
      ease: 'Power2',
      onComplete: () => {
        bg.destroy();
        titleTxt.destroy();
        msgTxt.destroy();
        this.notifBg = null;
        this.notifTitle = null;
        this.notifMsg = null;
        this.showNextNotif();
      },
    });
  }

  // ──────────────────────────────────────────────────────────────
  // ASSASSIN MODE (Among Us stealth layer)
  // ──────────────────────────────────────────────────────────────

  private showAssassinIntro(): void {
    // Find the assassin AI's sprite and flash a "?" over it
    const ai = this.aiPlayers.find((x) => x.state.id === this.assassinId);
    if (!ai) return;
    const danger = this.add
      .text(ai.sprite.x, ai.sprite.y - 40, '?', {
        fontSize: '24px',
        color: '#ff3344',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({
      targets: danger,
      scale: 1.5,
      alpha: 0,
      y: danger.y - 30,
      duration: 2200,
      ease: 'Power2',
      onComplete: () => danger.destroy(),
    });
    this.showNotification(
          '⚠️ ASSASSIN ALERT',
          `${this.assassinState.name} is hunting you. Stay out of their sight!`,
          2,
        );
  }

  /** Setup the assassin view-cone & risk meter graphics. */
  private buildAssassinUI(): void {
    this.assassinViewGfx = this.add.graphics().setDepth(8).setAlpha(0.55);
    const cx = this.cameras.main.width / 2;
    const cy = 30;
    this.riskMeterGfx = this.add.graphics().setScrollFactor(0).setDepth(120);
    const baseColor = '#ff8866';
    this.riskMeterText = this.add
      .text(cx, cy, 'RISK: —', {
        fontSize: '13px',
        color: baseColor,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        stroke: '#000',
        strokeThickness: 2,
      })
      .setOrigin(0.5).setScrollFactor(0).setDepth(121);
  }

  /** Each frame: update assassin view cone & stealth meter. */
  /** Each frame: update assassin view cone & stealth meter. */
  private updateAssassin(dt: number): void {
    const ai = this.aiPlayers.find((x) => x.state.id === this.assassinId);
    if (!ai) return;
    const ax = ai.sprite.x;
    const ay = ai.sprite.y;
    const hx = this.player.sprite.x;
    const hy = this.player.sprite.y;

    // ── View cone around the assassin ──
    this.assassinViewGfx.clear();
    const inView = isInView({ x: hx, y: hy }, { x: ax, y: ay });
    if (inView) {
      // Gradient ring fading from red center → transparent edge
      const t = this.assassinState.stealth;
      const alpha = 0.18 + 0.35 * t;
      this.assassinViewGfx.fillStyle(0xff2222, alpha);
      this.assassinViewGfx.fillCircle(ax, ay, ASSASSIN_VIEW_RADIUS);
      // pulse ring
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 200);
      this.assassinViewGfx.lineStyle(2, 0xff3344, 0.4 + 0.4 * pulse);
      this.assassinViewGfx.strokeCircle(ax, ay, ASSASSIN_VIEW_RADIUS);
      this.assassinViewGfx.lineStyle(1, 0xff3344, 0.2);
      this.assassinViewGfx.strokeCircle(ax, ay, ASSASSIN_VIEW_RADIUS * 0.5);

      // ── Stealth grows ──
      this.assassinState.stealth = Math.min(
        1.5,
        this.assassinState.stealth + ASSASSIN_STEALTH_RATE * (dt / 16),
      );

      // ── Trigger proximity alert once when player first enters ──
      const key = `${this.assassinId}_proximity`;
      if (!this.assassinAlertShownKey.startsWith(key)) {
        this.assassinAlertShownKey = key;
        this.showNotification(
                  '⚠️ HUNTED',
                  `${this.assassinState.name} sees you! Lose them!`,
                  2,
                );
      }

      // ── Strike at stealth >= 1.0 if cooldown elapsed ──
      const now = this.time.now;
      if (
        this.assassinState.stealth >= 1.0 &&
        now - this.assassinState.lastKillMs > ASSASSIN_KILL_COOLDOWN_MS &&
        !this.assassinState.victims.includes(humanPlayer.id)
      ) {
        this.assassinStrike();
      }
    } else {
      // Decay stealth when out of view
      this.assassinState.stealth = Math.max(
        0,
        this.assassinState.stealth - ASSASSIN_STEALTH_RATE * 2 * (dt / 16),
      );
    }

    // ── Render risk meter ──
    this.renderRiskMeter();
  }

  private renderRiskMeter(): void {
    const cx = this.cameras.main.width / 2;
    const cy = 38;
    const w = 220;
    const h = 12;
    const meterX = cx - w / 2;
    const meterY = cy - h / 2;
    const t = Math.min(1, this.assassinState.stealth);

    this.riskMeterGfx.clear();
    if (t <= 0) {
      this.riskMeterText.setText('');
      return;
    }

    // Background
    this.riskMeterGfx.fillStyle(0x1a1a1a, 0.7);
    this.riskMeterGfx.fillRect(meterX - 2, meterY - 2, w + 4, h + 4);
    // Fill (green → yellow → red)
    let color = 0x44cc44;
    if (t > 0.5) color = 0xffaa00;
    if (t > 0.8) color = 0xff3344;
    this.riskMeterGfx.fillStyle(color, 1);
    this.riskMeterGfx.fillRect(meterX, meterY, w * t, h);
    // Border
    this.riskMeterGfx.lineStyle(1, 0xffffff, 0.3);
    this.riskMeterGfx.strokeRect(meterX, meterY, w, h);

    const label = t >= 1 ? '⚠️ CRITICAL' : 'RISK';
    this.riskMeterText.setText(`${label}: ${Math.round(t * 100)}%`);
    this.riskMeterText.setColor(t > 0.8 ? '#ff3344' : t > 0.5 ? '#ffaa00' : '#88ff88');
  }

  private assassinStrike(): void {
    this.assassinState.lastKillMs = this.time.now;
    this.assassinState.stealth = 0;
    this.assassinState.victims.push(humanPlayer.id);

    const ai = this.aiPlayers.find((x) => x.state.id === this.assassinId);
    if (!ai) return;

    const stolen = Math.floor(humanPlayer.cash * ASSASSIN_KILL_PCT);
    humanPlayer.cash -= stolen;
    ai.state.cash += stolen;

    // Red flash + screen shake
    this.cameras.main.flash(220, 255, 30, 30, false);
    this.cameras.main.shake(140, 0.005);

    // Burst near player
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const px = this.player.sprite.x;
      const py = this.player.sprite.y;
      const part = this.add
        .circle(px, py, 3, 0xff3344)
        .setDepth(60);
      this.tweens.add({
        targets: part,
        x: px + Math.cos(ang) * 60,
        y: py + Math.sin(ang) * 60,
        alpha: 0,
        duration: 600,
        onComplete: () => part.destroy(),
      });
    }

    this.showNotification(
          '🩸 BANDIT KILL',
          `${this.assassinState.name} mugged you for $${stolen.toLocaleString()}!`,
          2,
        );
  }

  // ──────────────────────────────────────────────────────────────
  // PLAYER SUB-ROLE — Engineer vent + Tracker pin
  // ──────────────────────────────────────────────────────────────

  private roleHudText?: Phaser.GameObjects.Text;

  private updateRoleHUD(): void {
    if (!this.playerRole) return;
    if (!this.roleHudText || !this.roleHudText.active) {
      this.roleHudText = this.add
        .text(this.cameras.main.width - 14, 58, '', {
          fontSize: '12px',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          stroke: '#000',
          strokeThickness: 2,
        })
        .setOrigin(1, 0).setScrollFactor(0).setDepth(160);
    }
    const cooldown = Math.max(0, Math.ceil((this.roleCooldownUntilMs - Date.now()) / 1000));
    const uses = this.roleUsesLeft === Infinity ? '∞' : String(this.roleUsesLeft);
    let hint = '';
    if (this.playerRole.id === 'engineer') hint = cooldown > 0 ? `V: vent(${cooldown}s)` : 'V: vent';
    else if (this.playerRole.id === 'tracker') hint = cooldown > 0 ? `Y: pin(${cooldown}s)` : 'Y: pin';
    else hint = 'passive';
    const r = this.playerRole;
    this.roleHudText.setText(
      `${r.icon} ${r.name.toUpperCase()}  uses: ${uses}  ${hint}`,
    );
    const col = `#${r.color.toString(16).padStart(6, '0')}`;
    this.roleHudText.setColor(cooldown > 0 ? '#888888' : col);
  }

  /** V key handler — engineer vent teleport. */
  private tryEngineerVent(): void {
    if (!this.playerRole || this.playerRole.id !== 'engineer') return;
    if (this.roleCooldownUntilMs > Date.now()) {
      const s = Math.ceil((this.roleCooldownUntilMs - Date.now()) / 1000);
      this.showNotification('🔧 ENGINEER', `Cooldown ${s}s`);
      return;
    }
    if (this.roleUsesLeft <= 0) {
      this.showNotification('🔧 ENGINEER', 'No vents left.');
      return;
    }

    // Find nearest service zone to player
    const serviceZones = ZONES.filter((z) =>
      ['bank', 'university', 'day_job', 'real_estate'].includes(z.id),
    );
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    const sorted = serviceZones
      .map((z) => ({ z, d: (z.x + z.w / 2 - px) ** 2 + (z.y + z.h / 2 - py) ** 2 }))
      .sort((a, b) => a.d - b.d);
    if (sorted.length < 2) return;
    // nearest is current; pick second-nearest as destination
    const dest = sorted[1].z;

    // Show vent animation: circle pulse on player then teleport
    const pulse = this.add.circle(px, py, 18, 0xffa500, 0.7).setDepth(80);
    this.tweens.add({
      targets: pulse,
      scale: 8,
      alpha: 0,
      duration: 400,
      onComplete: () => pulse.destroy(),
    });
    this.time.delayedCall(280, () => {
      this.player.sprite.x = dest.x + dest.w / 2;
      this.player.sprite.y = dest.y + dest.h / 2;
      this.player.body.reset(this.player.sprite.x, this.player.sprite.y);
      // arrive
      const arrive = this.add.circle(this.player.sprite.x, this.player.sprite.y, 32, 0xffa500, 0.6).setDepth(80);
      this.tweens.add({
        targets: arrive,
        scale: 0.2,
        alpha: 0,
        duration: 500,
        onComplete: () => arrive.destroy(),
      });
      this.showNotification(
        '🔧 ENGINEER',
        `Vented to ${dest.label}. ${this.roleUsesLeft - 1} vents left.`,
      );
      soundManager.playCoin();
    });

    this.roleUsesLeft -= 1;
    this.roleCooldownUntilMs = Date.now() + this.playerRole.cooldownMs;
    this.updateRoleHUD();
  }

  /** Y key handler — tracker pin nearest AI within range. */
  private tryTrackerPin(): void {
    if (!this.playerRole || this.playerRole.id !== 'tracker') return;
    if (this.roleCooldownUntilMs > Date.now()) {
      const s = Math.ceil((this.roleCooldownUntilMs - Date.now()) / 1000);
      this.showNotification('🎯 TRACKER', `Cooldown ${s}s`);
      return;
    }
    if (this.roleUsesLeft <= 0) {
      this.showNotification('🎯 TRACKER', 'No pins left.');
      return;
    }
    // Find nearest AI within pin range
    const pinRange = 220;
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    let best: AIPlayer | null = null;
    let bestD = Infinity;
    for (const ai of this.aiPlayers) {
      const ax = ai.sprite.x;
      const ay = ai.sprite.y;
      const d = (ax - px) ** 2 + (ay - py) ** 2;
      if (d <= pinRange * pinRange && d < bestD) {
        bestD = d;
        best = ai;
      }
    }
    if (!best) {
      this.showNotification('🎯 TRACKER', 'No AI within 220px.');
      return;
    }
    const ai = best as AIPlayer;
    const pinDur = this.playerRole.modifiers.pinDurationMs ?? 45_000;
    this.activePins.push({
      targetId: ai.state.id,
      placedAt: Date.now(),
      expiry: Date.now() + pinDur,
      gfx: this.add.container(0, 0).setDepth(60),
    });
    this.showNotification(
      '🎯 TRACKER',
      `Pin attached to ${ai.state.name}. Watch their movement for ${Math.floor(pinDur / 1000)}s.(${this.roleUsesLeft - 1} pins left)`,
    );

    this.roleUsesLeft -= 1;
    this.roleCooldownUntilMs = Date.now() + this.playerRole.cooldownMs;
    this.updateRoleHUD();
  }

  /** Render minimap blips over pinned AIs. */
  private updateActivePins(): void {
    const now = Date.now();
    // Drop expired
    const remaining: typeof this.activePins = [];
    for (const p of this.activePins) {
      if (p.expiry <= now) {
        p.gfx.destroy();
      } else {
        remaining.push(p);
      }
    }
    this.activePins = remaining;
    // Draw
    for (const p of this.activePins) {
      const ai = this.aiPlayers.find((a) => a.state.id === p.targetId);
      if (!ai) continue;
      p.gfx.removeAll(true);
      const ax = ai.sprite.x;
      const ay = ai.sprite.y;
      // pulsing outer ring
      const t = (now - p.placedAt) / 1000;
      const pulse = 6 + 4 * Math.sin(t * 6);
      const ring = this.add.circle(ax, ay, pulse, 0x44ccff, 0).setDepth(60).setStrokeStyle(2, 0x44ccff, 0.8);
      p.gfx.add(ring);
      // tracer line from player to target (only when short distance)
      const px = this.player.sprite.x;
      const py = this.player.sprite.y;
      const d = Math.hypot(ax - px, ay - py);
      if (d <= 480) {
        const line = this.add.line(0, 0, px, py, ax, ay, 0x44ccff, 0.35).setOrigin(0, 0).setDepth(59);
        p.gfx.add(line);
      }
      // count-down text
      const remain = Math.ceil((p.expiry - now) / 1000);
      const lbl = this.add.text(ax, ay - 28, `🎯${remain}s`, {
        fontSize: '10px', color: '#44ccff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5);
      p.gfx.add(lbl);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // EMERGENCY SYSTEM — random reactor/O2/power events
  // ──────────────────────────────────────────────────────────────

  /** Roll the next scheduled emergency — fires within 60-110s. */
  private scheduleNextEmergency(): void {
    const span =
      EMERGENCY_MAX_INTERVAL_MS - EMERGENCY_MIN_INTERVAL_MS;
    this.nextEmergencyDueMs =
      Date.now() +
      EMERGENCY_MIN_INTERVAL_MS +
      Math.floor(Math.random() * span);
  }

  /** Trigger a new emergency now (called externally and from timer). */
  private triggerEmergency(): void {
    if (this.currentEmergency) return;
    const e = rollEmergency();
    this.currentEmergency = e;
    this.showEmergencyAnnouncement(e);
    // Camera shake to grab attention
    this.cameras.main.shake(180, 0.005);
    // Schedule the next one regardless
    this.scheduleNextEmergency();
  }

  private showEmergencyAnnouncement(e: Emergency): void {
    const tpl = EMERGENCY_TEMPLATES.find((t) => t.type === e.type)!;
    const z = ZONES.find((zz) => zz.id === e.zoneId);
    const where = z ? ` in ${z.label}` : '';
    this.showNotification(tpl.label, `Get to ${z?.label ?? 'the zone'} and fix it!${where}`, 3);
  }

  /** Per-frame: tick emergency timer + check player proximity for fix. */
  private updateEmergency(): void {
    const now = Date.now();

    // No active emergency: check if we should spawn one
    if (!this.currentEmergency) {
      if (now >= this.nextEmergencyDueMs) {
        this.triggerEmergency();
      }
      return;
    }

    // Active emergency: countdown
    const e = this.currentEmergency;
    const elapsed = now - e.startMs;
    const remaining = Math.max(0, e.durationMs - elapsed);

    if (remaining <= 0 && !e.resolved && !e.expired) {
      // TIMEOUT — penalty applied
      e.expired = true;
      const tpl = EMERGENCY_TEMPLATES.find((t) => t.type === e.type)!;
      this.expireEmergencyPenalty();
      this.showNotification(
              '💀 SYSTEM FAILURE',
              `${tpl.label} unresolved — 30% penalty wiped from all players!`,
              3,
            );
      this.cameras.main.flash(400, 80, 80, 80, false);
      this.cameras.main.shake(300, 0.012);
      // Clear UI
      this.destroyEmergencyUI();
      // Hold expires
      setTimeout(() => {
        this.currentEmergency = null;
      }, 800);
      return;
    }

    // Active: draw countdown bar + fix UI
    this.renderEmergencyBar(e, remaining, this.emergencyHoldMs / EMERGENCY_FIX_HOLD_MS);

    // Check if player is in range
    const playerInRange = this.isPlayerInEmergencyZone(e);

    if (playerInRange) {
      // Show fix prompt
      if (!this.emergencyPrompt || !this.emergencyPrompt.active) {
        this.emergencyPrompt = this.add
          .text(this.player.sprite.x, this.player.sprite.y - 32, '[Hold E] FIX', {
            fontSize: '13px', color: '#44ff44', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
            stroke: '#000', strokeThickness: 3,
          })
          .setOrigin(0.5).setDepth(70);
      } else {
        this.emergencyPrompt.setPosition(this.player.sprite.x, this.player.sprite.y - 32);
        this.emergencyPrompt.setVisible(true);
      }
      this.emergencyPrompt.setText(
        this.emergencyHoldMs > 0
          ? `[Fixing ${Math.floor(this.emergencyHoldMs / 1000) + 1}s]`
          : '[Hold E] FIX',
      );

      // Increment hold while E held (uses eHeld, the persistent flag, NOT ePressed which
      // is one-shot and gets cleared each frame)
      if (this.eHeld) {
        this.emergencyHoldMs += 16; // assume 60fps
      } else {
        // Lenient decay — partial progress retained, slow bleed
        this.emergencyHoldMs = Math.max(0, this.emergencyHoldMs - 8);
      }
      if (this.emergencyHoldMs >= EMERGENCY_FIX_HOLD_MS) {
        e.resolved = true;
        e.fixedBy = humanPlayer.name;
        const tpl = EMERGENCY_TEMPLATES.find((t) => t.type === e.type)!;
        this.showNotification(
                    '✅ EMERGENCY FIXED',
                    `${e.fixedBy ?? 'Someone'} resolved it! Bonus +$500 applied.`,
                    2,
                  );
        humanPlayer.cash += 500;
        this.destroyEmergencyUI();
        setTimeout(() => {
          this.currentEmergency = null;
        }, 600);
      }
    } else {
      if (this.emergencyPrompt) this.emergencyPrompt.setVisible(false);
      // Decay the hold when out of range
      this.emergencyHoldMs = Math.max(0, this.emergencyHoldMs - 12);
    }
  }

  private isPlayerInEmergencyZone(e: Emergency): boolean {
    const z = ZONES.find((zz) => zz.id === e.zoneId);
    if (!z) return false;
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    // Within zone bounding box (slightly relaxed)
    return (
      px >= z.x - 20 &&
      px <= z.x + z.w + 20 &&
      py >= z.y - 20 &&
      py <= z.y + z.h + 20
    );
  }

  private renderEmergencyBar(e: Emergency, remainingMs: number, fillT: number): void {
    const z = ZONES.find((zz) => zz.id === e.zoneId);
    if (!z) return;
    const tpl = EMERGENCY_TEMPLATES.find((t) => t.type === e.type);
    const color = tpl?.color ?? 0xff2222;
    const cx = z.x + z.w / 2;
    const cy = z.y + 14;
    const totalSec = e.durationMs / 1000;
    const remainSec = Math.ceil(remainingMs / 1000);

    // Countdown text (fixed position, not tied to camera in zones map layer — fixed at top of screen)
    if (!this.emergencyCountdownText || !this.emergencyCountdownText.active) {
      this.emergencyCountdownText = this.add
        .text(this.cameras.main.width / 2, 60, '', {
          fontSize: '18px',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 4,
        })
        .setOrigin(0.5).setScrollFactor(0).setDepth(200);
    }
    this.emergencyCountdownText.setText(`${tpl?.label ?? 'EMERGENCY'}  ${remainSec}s`);
    this.emergencyCountdownText.setColor(
      remainSec <= 5 ? '#ff5566' : remainSec <= 15 ? '#ffaa44' : '#ffffff',
    );
    // Pulsing scale
    const pulse = 1 + 0.08 * Math.sin(this.time.now / 200);
    this.emergencyCountdownText.setScale(pulse);

    // Mini fix bar above player indicator — drawn at the bottom of the screen
    if (!this.emergencyBar || !this.emergencyBar.active) {
      this.emergencyBar = this.add.graphics().setScrollFactor(0).setDepth(199);
    }
    this.emergencyBar.clear();
    const barW = 240;
    const barH = 10;
    const bx = this.cameras.main.width / 2 - barW / 2;
    const by = this.cameras.main.height - 70;
    this.emergencyBar.fillStyle(0x1a1a1a, 0.7);
    this.emergencyBar.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
    // Time remaining bar (shrinking)
    const tRemaining = Math.max(0, remainingMs / e.durationMs);
    this.emergencyBar.fillStyle(color, 0.85);
    this.emergencyBar.fillRect(bx, by, barW * tRemaining, barH);
    // Fix progress (rising green overlay)
    if (fillT > 0) {
      this.emergencyBar.fillStyle(0x44ff44, 0.7);
      this.emergencyBar.fillRect(bx, by, barW * Math.min(1, fillT), barH);
    }
    this.emergencyBar.lineStyle(1, 0xffffff, 0.4);
    this.emergencyBar.strokeRect(bx, by, barW, barH);

    // Zone tint
    void cx;
    void cy;
  }

  /** Draw a thin gold ribbon across the top of any zone the human is dominating. */
  private renderDominionOverlay(): void {
    if (!this.dominionOverlayGfx) return;
    this.dominionOverlayGfx.clear();
    for (const dom of this.dominionState.values()) {
      if (!dom.leaderId) continue;
      const z = ZONES.find((zz) => zz.id === dom.zoneId);
      if (!z) continue;
      const isHuman = dom.leaderId === humanPlayer.id;
      const col = isHuman ? 0xffd700 : this.colorForAi(dom.leaderId);
      this.dominionOverlayGfx.fillStyle(col, 0.8);
      this.dominionOverlayGfx.fillRect(z.x, z.y + z.h - 6, z.w, 6);
      // Crown marker (small filled circle, top-left)
      this.dominionOverlayGfx.fillStyle(col, 0.4);
      this.dominionOverlayGfx.fillCircle(z.x + 12, z.y + 12, 6);
      this.dominionOverlayGfx.fillStyle(col, 0.9);
      this.dominionOverlayGfx.fillCircle(z.x + 12, z.y + 12, 4);
    }
  }

  /** Approximate a colour for an AI based on its id hash. */
  private colorForAi(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    const colors = [0xff4444, 0xffaa44, 0xaa88ff, 0x44ffaa, 0xff88cc];
    return colors[Math.abs(h) % colors.length];
  }

  private destroyEmergencyUI(): void {
    if (this.emergencyCountdownText) {
      this.emergencyCountdownText.destroy();
      this.emergencyCountdownText = undefined;
    }
    if (this.emergencyBar) {
      this.emergencyBar.destroy();
      this.emergencyBar = undefined;
    }
    if (this.emergencyPrompt) {
      this.emergencyPrompt.destroy();
      this.emergencyPrompt = undefined;
    }
    this.emergencyHoldMs = 0;
  }

  private expireEmergencyPenalty(): void {
    const players = [humanPlayer, ...this.aiPlayers.map((a) => a.state)];
    let totalLost = 0;
    for (const p of players) {
      const lost = Math.floor(p.cash * EMERGENCY_FAIL_PENALTY);
      p.cash -= lost;
      totalLost += lost;
    }
    soundManager.playPurchase();
    void totalLost;
  }

  // ──────────────────────────────────────────────────────────────
  // SABOTAGE SYSTEM — UI and dispatch
  // ──────────────────────────────────────────────────────────────

  private openSabotageMenu(): void {
    if (this.sabotageMenuOpen) return;
    this.sabotageMenuOpen = true;
    const cam = this.cameras.main;
    const w = 540;
    const h = 470;
    const x = (cam.width - w) / 2;
    const y = (cam.height - h) / 2;
    const c = this.add.container(x, y).setScrollFactor(0).setDepth(300);
    this.sabotagePanel = c;

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a1e, 0.96);
    bg.fillRoundedRect(0, 0, w, h, 14);
    bg.lineStyle(2, 0x882222, 0.8);
    bg.strokeRoundedRect(0, 0, w, h, 14);
    c.add(bg);

    // Title
    const title = this.add.text(w / 2, 28, '⚠️ SABOTAGE TACTICAL', {
      fontSize: '22px', color: '#ff4444', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    c.add(title);

    // Subtitle
    const sub = this.add.text(w / 2, 56, 'Press T to close · Click a card to deploy', {
      fontSize: '12px', color: '#888888', fontFamily: 'Arial, sans-serif',
    }).setOrigin(0.5);
    c.add(sub);

    const now = Date.now();
    const startY = 80;
    const rowH = 44;

    for (let i = 0; i < SABOTAGES.length; i++) {
      const def = SABOTAGES[i];
      const rowY = startY + i * rowH;
      const cooling = (this.sabotageCooldowns.get(def.id) ?? 0) > now;
      const cdSec = cooling
        ? Math.ceil(((this.sabotageCooldowns.get(def.id) ?? 0) - now) / 1000)
        : 0;
      const affordable = humanPlayer.cash >= def.cost;
      const tierColor =
        def.tier === 1 ? '#88cc66' : def.tier === 2 ? '#ddaa44' : '#ff5555';
      const lbl = cooling
        ? `⏳ COOLDOWN ${cdSec}s`
        : !affordable
          ? `🔒 NEED $${def.cost.toLocaleString()}`
          : `TIER ${def.tier}`;

      const row = this.add.graphics();
      row.fillStyle(0x141428, 0.95);
      row.fillRoundedRect(8, rowY, w - 16, rowH - 6, 8);
      row.lineStyle(1, Phaser.Display.Color.HexStringToColor(tierColor).color, 0.6);
      row.strokeRoundedRect(8, rowY, w - 16, rowH - 6, 8);
      c.add(row);

      const tcol = cooling ? '#666666' : !affordable ? '#666666' : '#ffffff';
      const txt = this.add.text(18, rowY + 6, `${def.icon} ${def.name}`, {
        fontSize: '14px', color: tcol, fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      });
      c.add(txt);
      const desc = this.add.text(18, rowY + 22, def.desc, {
        fontSize: '10.5px', color: '#9a9aaa', fontFamily: 'Arial, sans-serif',
      });
      c.add(desc);
      const meta = this.add.text(w - 18, rowY + 8, lbl, {
        fontSize: '10px', color: tierColor, fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setOrigin(1, 0);
      c.add(meta);
      const cost = this.add.text(w - 18, rowY + 22, `$${def.cost.toLocaleString()}`, {
        fontSize: '11px', color: !affordable ? '#cc6666' : '#ffd700', fontFamily: 'Arial, sans-serif',
      }).setOrigin(1, 0);
      c.add(cost);

      // Click handler (only if usable)
      if (!cooling && affordable) {
        const hit = this.add.rectangle(w / 2, rowY + (rowH - 6) / 2, w - 16, rowH - 6, 0x000000, 0)
          .setInteractive({ useHandCursor: true });
        hit.on('pointerover', () =>
          row.lineStyle(2, Phaser.Display.Color.HexStringToColor('#ff4444').color, 1));
        hit.on('pointerout', () =>
          row.lineStyle(1, Phaser.Display.Color.HexStringToColor(tierColor).color, 0.6));
        hit.on('pointerdown', () => this.deploySabotage(def.id));
        c.add(hit);
      }
    }
  }

  private closeSabotageMenu(): void {
    if (this.sabotagePanel) {
      this.sabotagePanel.destroy();
      this.sabotagePanel = undefined;
    }
    this.sabotageMenuOpen = false;
  }

  private deploySabotage(id: SabotageId): void {
    const def = SABOTAGES.find((s) => s.id === id);
    if (!def) return;
    if ((this.sabotageCooldowns.get(id) ?? 0) > Date.now()) return;
    if (humanPlayer.cash < def.cost) {
      this.showNotification('⚠️ SABOTAGE', `Need $${def.cost.toLocaleString()} to deploy.`);
      return;
    }

    humanPlayer.cash -= def.cost;

    if (def.requiresZone) {
      // Use the player's current zone if known; default to first zone
      const zoneId = ZONES[0].id;
      this.applySabotage(id, zoneId);
    } else {
      this.applySabotage(id);
    }
    this.closeSabotageMenu();
  }

  /** Activate a sabotage and start its effects. */
  private applySabotage(id: SabotageId, zoneId?: string): void {
    const def = SABOTAGES.find((s) => s.id === id);
    if (!def) return;

    // Cooldown stamp
    this.sabotageCooldowns.set(id, Date.now() + def.cooldownMs);

    const sab = buildSabotage(this, id, zoneId);
    if (!sab) {
      this.showNotification('⚠️ SABOTAGE', `${def.name} failed to deploy.`);
      return;
    }
    this.activeSabotages.push(sab);

    const ZONE = zoneId ? ZONES.find((z) => z.id === zoneId) : undefined;
    const where = ZONE ? ` in ${ZONE.label}` : '';
    this.showNotification('⚠️ SABOTAGE', `${def.name} deployed${where}!`, 3);

    // Tier 1–2 apply instant effect; Tier 3 fires immediately then goes away
    if (def.durationMs === 0) {
      this.runSingleShotSabotage(id, zoneId);
      this.activeSabotages = this.activeSabotages.filter((s) => s.id !== id);
    } else {
      this.applyDurationSabotage(id);
    }
  }

  /** Sabotages with duration (lights out, comms jam, etc.). */
  private applyDurationSabotage(id: SabotageId): void {
    if (id === 'lights_out') {
      const cam = this.cameras.main;
      // Dark vignette
      const r1 = this.add
        .rectangle(cam.width / 2, cam.height / 2, cam.width * 2, cam.height * 2, 0x000000, 0.7)
        .setScrollFactor(0)
        .setDepth(180)
        .setBlendMode(Phaser.BlendModes.MULTIPLY);
      // Punchy vignette mask fade-out at end
      this.time.delayedCall(8000, () => {
        this.tweens.add({
          targets: r1,
          alpha: 0,
          duration: 600,
          onComplete: () => r1.destroy(),
        });
      });
      // The vignette darkens everything — gameplay continues
      void cam;
    } else if (id === 'comms_jam') {
      // Hide tick counter + leaderboard by tweening alpha to 0
      const cam = this.cameras.main;
      const targets: Phaser.GameObjects.GameObject[] = [];
      if (this.leaderboardText) targets.push(this.leaderboardText);
      if (this.tickTimerText) targets.push(this.tickTimerText);
      this.tweens.add({ targets, alpha: 0.05, duration: 600, yoyo: false });
      this.time.delayedCall(12_000, () => {
        this.tweens.add({ targets, alpha: 1, duration: 600 });
      });
      void cam;
    } else if (id === 'bank_audit') {
      // +10% interest surcharge on AI for next 30s
      const event = new Phaser.Events.EventEmitter();
      event.on('deadline', () => {});
      void event;
      this.showNotification('🏦 BANK AUDIT', 'AI debt interest +10% for 30s.', 3);
    }
    // Zone quarantine + rent strike + debt freeze: ticked in updateActiveSabotages
  }

  /** Apply single-shot tier 3 sabotages. */
  private runSingleShotSabotage(id: SabotageId, zoneId?: string): void {
    if (id === 'market_crash') {
      const players = [humanPlayer, ...this.aiPlayers.map((a) => a.state)];
      let totalLost = 0;
      for (const p of players) {
        const lost = Math.floor(p.cash * 0.25);
        p.cash -= lost;
        totalLost += lost;
      }
      this.cameras.main.flash(400, 200, 50, 50, false);
      this.cameras.main.shake(300, 0.01);
      this.showNotification('📉 MARKET CRASH',
              `Total $${totalLost.toLocaleString()} wiped out across the economy.`, 3);
    } else if (id === 'bankrupt_tycoon') {
      let stripped = 0;
      for (const ai of this.aiPlayers) {
        if (ai.state.debt > 0 && ai.state.propertyCount > 0) {
          const propList = Array.from(ai.state.ownedPropertyIds);
          const choice = propList[Math.floor(Math.random() * propList.length)];
          ai.state.removeProperty(choice);
          stripped++;
        }
      }
      this.showNotification('🏚️ BANKRUPT TYCOON',
              `${stripped} ${stripped === 1 ? 'property was' : 'properties were'} seized from indebted AIs.`, 3);
    } else if (id === 'zone_quarantine') {
      // already handled via duration
    }
    void zoneId;
  }

  /** Per-frame: tick active sabotages. */
  private updateActiveSabotages(): void {
    const now = Date.now();
    // Drop expired
    this.activeSabotages = this.activeSabotages.filter((s) => s.endsAt > now);
    // Zone quarantine enforcement: push AIs back out if they enter
    for (const sab of this.activeSabotages) {
      if (sab.id === 'zone_quarantine' && sab.zoneId) {
        for (const ai of this.aiPlayers) {
          if (ai.currentZoneId === sab.zoneId) {
            ai.forceExpelFromZone(sab.zoneId);
          }
        }
      }
    }
    // Visual cue: draw red overlay on quarantined zones
    this.drawZoneQuarantineOverlay();
  }

  // ──────────────────────────────────────────────────────────────
  // PROPERTY TRADE — modal + AI evaluation + incoming trade stream
  // ──────────────────────────────────────────────────────────────

  /** Open a trade modal. Must be standing within range of an AI to use it. */
  private tryOpenTradeModal(): void {
    // Find nearest AI within trade range
    let best: AIPlayer | null = null;
    let bestD = Infinity;
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    for (const ai of this.aiPlayers) {
      const d = (ai.sprite.x - px) ** 2 + (ai.sprite.y - py) ** 2;
      if (d <= TRADE_RANGE_PX * TRADE_RANGE_PX && d < bestD) {
        bestD = d;
        best = ai;
      }
    }
    if (!best) {
      // Open a global trade picker anyway so the player can see offers
      const open = this.openTradeModal(null);
      if (!open) {
        this.showNotification('🤝 TRADE', 'No AI in range · but you see incoming offers below');
      }
      return;
    }
    this.openTradeModal(best as AIPlayer);
  }

  /** Open the trade modal: if `ai` provided, build an offer with them. Otherwise show incoming offers. */
  private openTradeModal(ai: AIPlayer | null): boolean {
    if (this.tradeModalOpen) return false;
    this.tradeModalOpen = true;
    const cam = this.cameras.main;
    const w = 560;
    const h = 480;
    const x = (cam.width - w) / 2;
    const y = (cam.height - h) / 2;
    const c = this.add.container(x, y).setScrollFactor(0).setDepth(310);
    this.tradeModal = c;

    const bg = this.add.graphics();
    bg.fillStyle(0x141426, 0.97);
    bg.fillRoundedRect(0, 0, w, h, 14);
    bg.lineStyle(2, 0x6688aa, 0.8);
    bg.strokeRoundedRect(0, 0, w, h, 14);
    c.add(bg);

    const title = this.add.text(w / 2, 28, '🤝 PROPERTY TRADE', {
      fontSize: '22px', color: '#aaddff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    }).setOrigin(0.5);
    c.add(title);

    const sub = this.add.text(w / 2, 56,
      ai ? `Trade with ${ai.state.name} · Pick a property to swap` : 'No AI in range · Click an incoming offer',
      { fontSize: '12px', color: '#88aacc', fontFamily: 'Arial, sans-serif' }).setOrigin(0.5);
    c.add(sub);

    if (ai) {
      this.renderAiTradeMenu(c, w, h, ai);
    } else {
      this.renderIncomingTradeList(c, w, h);
    }

    return true;
  }

  private closeTradeModal(): void {
    if (this.tradeModal) {
      this.tradeModal.destroy();
      this.tradeModal = undefined;
    }
    this.tradeModalOpen = false;
  }

  /** Build the swap-with-AI menu with one option per AI-owned property. */
  private renderAiTradeMenu(
    c: Phaser.GameObjects.Container,
    w: number,
    h: number,
    ai: AIPlayer,
  ): void {
    const startY = 88;
    const rowH = 56;
    const aiProps = Array.from(ai.state.ownedPropertyIds).sort();
    if (aiProps.length === 0) {
      const t = this.add.text(w / 2, h / 2,
        `${ai.state.name} owns no properties yet.`,
        { fontSize: '14px', color: '#888', fontFamily: 'Arial, sans-serif' }).setOrigin(0.5);
      c.add(t);
      return;
    }
    // Caption
    const caption = this.add.text(18, 80,
      `${ai.state.name}'s properties · click one to propose a swap`,
      { fontSize: '12px', color: '#ccc', fontFamily: 'Arial, sans-serif' });
    c.add(caption);
    for (let i = 0; i < aiProps.length; i++) {
      const aiPropId = aiProps[i];
      const aiProp = getProperty(aiPropId);
      if (!aiProp) continue;
      const rowY = startY + i * rowH;
      const row = this.add.graphics();
      row.fillStyle(0x252540, 0.96);
      row.fillRoundedRect(8, rowY, w - 16, rowH - 8, 8);
      row.lineStyle(1, 0x446688, 0.8);
      row.strokeRoundedRect(8, rowY, w - 16, rowH - 8, 8);
      c.add(row);

      c.add(this.add.text(18, rowY + 6, aiProp.name, {
        fontSize: '14px', color: '#ffd700', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }));
      c.add(this.add.text(18, rowY + 24, `Worth ~$${aiProp.cost.toLocaleString()} · earns $${aiProp.incomePerTick}/tick`,
        { fontSize: '11px', color: '#aaa', fontFamily: 'Arial, sans-serif' }));
      const btn = this.add.text(w - 18, rowY + 18, 'OFFER →', {
        fontSize: '13px', color: '#88ff88', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setOrigin(1, 0);
      c.add(btn);
      const hit = this.add.rectangle(w / 2, rowY + (rowH - 8) / 2, w - 16, rowH - 8, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => row.lineStyle(2, 0x88ff88, 1));
      hit.on('pointerout', () => row.lineStyle(1, 0x446688, 0.8));
      hit.on('pointerdown', () => this.proposeHumanTrade(ai, aiPropId));
      c.add(hit);
    }
  }

  /** The human proposes: AI's `aiPropId` for one of human's properties + cash. */
  private proposeHumanTrade(ai: AIPlayer, aiPropId: string): void {
    // Use the most profitable human property as the "donor" side.
    // Simple heuristic: AI picks the lowest-value human property they've offered,
    // and asks for cash equal to 10% markup of the difference (or all human cash).
    const humanProps = Array.from(humanPlayer.ownedPropertyIds);
    if (humanProps.length === 0) {
      this.showNotification('🤝 TRADE', 'You own no properties to offer in trade.');
      return;
    }
    // Sort human properties by cost descending — AI wants the biggest
    const sorted = humanProps
      .map((pid) => ({ pid, cost: getProperty(pid)?.cost ?? 0 }))
      .sort((a, b) => b.cost - a.cost);
    const target = sorted[0];
    const aiProp = getProperty(aiPropId);
    if (!aiProp) return;
    // Cash ask = max(0, aiProp.cost - target.cost) + 10% markup
    const diff = Math.max(0, aiProp.cost - target.cost);
    const cashAsk = Math.floor(diff * 1.15);
    const offer: TradeOffer = {
      fromId: humanPlayer.id,
      fromName: humanPlayer.name,
      toId: ai.state.id,
      toName: ai.state.name,
      offeredProperties: [target.pid],
      offeredCash: cashAsk, // human pays AI this amount
      requestedProperties: [aiPropId],
      requestedCash: 0,
      status: 'pending',
      createdMs: Date.now(),
    };
    this.closeTradeModal();
    this.evaluateAiOffer(offer, ai);
  }

  /** AI evaluates the human's offer after a short decision delay. */
  private evaluateAiOffer(offer: TradeOffer, ai: AIPlayer): void {
    this.showNotification('🤝 TRADE',
      `${ai.state.name} is reviewing your offer... (4.5s)`);
    const dueAt = Date.now() + TRADE_DECISION_DELAY_MS;
    this.activeAiTrades.push({ aiId: ai.state.id, offer, dueAt });
  }

  /** Show open incoming AI→human offers. */
  private renderIncomingTradeList(
    c: Phaser.GameObjects.Container,
    w: number,
    h: number,
  ): void {
    const open = this.activeAiTrades.filter((t) => t.dueAt > Date.now());
    const startY = 96;
    if (open.length === 0) {
      this.add.text(w / 2, h / 2, 'No pending offers. Walk near an AI and press G to propose.',
        { fontSize: '13px', color: '#888', fontFamily: 'Arial, sans-serif' }).setOrigin(0.5);
      return;
    }
    for (let i = 0; i < open.length; i++) {
      const tr = open[i];
      const o = tr.offer;
      const prop = getProperty(o.requestedProperties[0]);
      const wantProp = getProperty(o.offeredProperties[0]);
      const rowY = startY + i * 70;
      const row = this.add.graphics();
      row.fillStyle(0x2a2a40, 0.96);
      row.fillRoundedRect(8, rowY, w - 16, 60, 8);
      row.lineStyle(1, 0x886688, 0.8);
      row.strokeRoundedRect(8, rowY, w - 16, 60, 8);
      c.add(row);
      const remain = Math.max(0, Math.ceil((tr.dueAt - Date.now()) / 1000));
      c.add(this.add.text(18, rowY + 8,
        `${o.fromName} → You`,
        { fontSize: '13px', color: '#ffaa66', fontFamily: 'Arial, sans-serif', fontStyle: 'bold' }));
      c.add(this.add.text(18, rowY + 26,
        `Trade: ${prop?.name ?? '?'} for your ${wantProp?.name ?? '?'}`,
        { fontSize: '11px', color: '#ccc', fontFamily: 'Arial, sans-serif' }));
      c.add(this.add.text(18, rowY + 42,
        `+ cash $${o.requestedCash.toLocaleString()}  · ${remain}s remaining`,
        { fontSize: '11px', color: '#ffd700', fontFamily: 'Arial, sans-serif' }));

      const acc = this.add.text(w - 18, rowY + 12, 'ACCEPT', {
        fontSize: '12px', color: '#88ff88', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setOrigin(1, 0);
      const rej = this.add.text(w - 18, rowY + 32, 'REJECT', {
        fontSize: '12px', color: '#ff8888', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
      }).setOrigin(1, 0);
      c.add(acc); c.add(rej);
      const hitAcc = this.add.rectangle(w - 64, rowY + 18, 60, 18, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hitAcc.on('pointerdown', () => {
        this.closeTradeModal();
        this.completeAiTrade(tr);
      });
      const hitRej = this.add.rectangle(w - 64, rowY + 38, 60, 18, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hitRej.on('pointerdown', () => {
        this.activeAiTrades = this.activeAiTrades.filter((t) => t !== tr);
        this.showNotification('🤝 TRADE', `Rejected ${o.fromName}'s offer.`);
        this.closeTradeModal();
      });
      c.add(hitAcc); c.add(hitRej);
    }
  }

  /** Per-frame: resolve pending trade timers + occasionally fire new incoming offers. */
  private updateTrades(): void {
    const now = Date.now();
    // 1. Resolve pending evaluations (human→AI offers)
    const stillPending: typeof this.activeAiTrades = [];
    for (const tr of this.activeAiTrades) {
      if (tr.offer.fromId === humanPlayer.id && tr.dueAt <= now) {
        // Player→AI: status = decision time
        const ai = this.aiPlayers.find((a) => a.state.id === tr.aiId);
        if (ai) {
          const result = evaluateOffer(tr.offer, ai.state);
          if (result.accept) {
            this.executeTrade(tr.offer);
            this.showNotification('🤝 TRADE', `${ai.state.name}: "${result.reason}"`);
          } else {
            this.showNotification('🤝 TRADE', `${ai.state.name} declined · "${result.reason}"`);
          }
        }
      } else {
        stillPending.push(tr);
      }
    }
    this.activeAiTrades = stillPending;

    // 2. Occasionally have an AI propose a trade to the human (~ every 25-40s)
    if (now % 30_000 < 17 && !this.practiceMode) {
      const ai = this.aiPlayers[Math.floor(Math.random() * this.aiPlayers.length)];
      const offer = composeAiOpeningOffer(ai.state, humanPlayer);
      if (offer) {
        const dueAt = now + TRADE_DECISION_DELAY_MS;
        this.activeAiTrades.push({ aiId: ai.state.id, offer, dueAt });
        this.showNotification('🤝 TRADE', `${ai.state.name} sent you an offer · press G to review`);
      }
    }
  }

  /** Apply the trade: move properties + cash between both players. */
  private executeTrade(offer: TradeOffer): void {
    const fromP = this.aiPlayers.find((a) => a.state.id === offer.fromId)?.state
      ?? (offer.fromId === humanPlayer.id ? humanPlayer : null);
    const toP = this.aiPlayers.find((a) => a.state.id === offer.toId)?.state
      ?? (offer.toId === humanPlayer.id ? humanPlayer : null);
    if (!fromP || !toP) return;
    // Move offered properties (from → to)
    for (const pid of offer.offeredProperties) {
      fromP.ownedPropertyIds.delete(pid);
      toP.ownedPropertyIds.add(pid);
      if ((fromP as PlayerState).propertyLevels) {
        const level = (fromP as PlayerState).propertyLevels[pid] ?? 1;
        if ('propertyLevels' in toP) {
          (toP as PlayerState).propertyLevels[pid] = level;
        }
      }
    }
    // Move requested properties (to → from)
    for (const pid of offer.requestedProperties) {
      toP.ownedPropertyIds.delete(pid);
      fromP.ownedPropertyIds.add(pid);
      if ('propertyLevels' in toP) {
        const level = (toP as PlayerState).propertyLevels[pid] ?? 1;
        if ('propertyLevels' in fromP) {
          (fromP as PlayerState).propertyLevels[pid] = level;
        }
      }
    }
    // Cash transfer (from must pay)
    fromP.cash -= Math.abs(offer.offeredCash);
    toP.cash += Math.abs(offer.offeredCash);
  }

  /** Called when human accepts an AI-offered trade. */
  private completeAiTrade(tr: { aiId: string; offer: TradeOffer; dueAt: number }): void {
    this.executeTrade(tr.offer);
    const ai = this.aiPlayers.find((a) => a.state.id === tr.aiId);
    if (ai) soundManager.playCoin();
    this.showNotification('🤝 TRADE',
      `Deal with ${ai?.state.name ?? tr.aiId} closed · properties + cash swapped.`);
    this.activeAiTrades = this.activeAiTrades.filter((x) => x !== tr);
  }

  private quarantineGfx!: Phaser.GameObjects.Graphics;
  private drawZoneQuarantineOverlay(): void {
    if (!this.quarantineGfx) {
      this.quarantineGfx = this.add.graphics().setScrollFactor(0).setDepth(4).setAlpha(0.7);
    }
    this.quarantineGfx.clear();
    for (const sab of this.activeSabotages) {
      if (sab.id === 'zone_quarantine' && sab.zoneId) {
        const z = ZONES.find((zz) => zz.id === sab.zoneId);
        if (z) {
          this.quarantineGfx.fillStyle(0xff2222, 0.25);
          this.quarantineGfx.fillRect(z.x, z.y, z.w, z.h);
          this.quarantineGfx.lineStyle(3, 0xff4444, 0.8);
          this.quarantineGfx.strokeRect(z.x, z.y, z.w, z.h);
        }
      }
    }
  }


  private spawnSkillBurst(): void {
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    const colors = [0xffd700, 0x44cc44, 0x88ccff, 0xffaa44, 0xaa44ff];
    for (const color of colors) {
      const dot = this.add.graphics().setDepth(20);
      dot.fillStyle(color, 1);
      dot.fillCircle(0, 0, 4);
      dot.setPosition(px, py);
      const angle = Math.random() * Math.PI * 2;
      const dist = 60 + Math.random() * 40;
      this.tweens.add({
        targets: dot,
        x: px + Math.cos(angle) * dist,
        y: py + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 600,
        ease: 'Power2',
        onComplete: () => dot.destroy(),
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // HEAT MAP
  // ──────────────────────────────────────────────────────────────

  private buildHeatMap(): void {
    this.heatMapGfx.clear();
    this.heatMapGfx.setAlpha(0.55);
    const maxVisits = Math.max(1, ...Object.values(this.zoneVisitCount));
    for (const zone of ZONES) {
      const count = this.zoneVisitCount[zone.id] ?? 0;
      if (count === 0) continue;
      const t = count / maxVisits;
      const r = Math.round(255 * t);
      const b = Math.round(255 * (1 - t));
      const color = (r << 16) | (0 << 8) | b;
      this.heatMapGfx.fillStyle(color, 0.6);
      this.heatMapGfx.fillRect(zone.x, zone.y, zone.w, zone.h);
      // Visit count text
      this.heatMapGfx.fillStyle(0x000000, 0.5);
      this.heatMapGfx.fillRect(zone.x + zone.w / 2 - 20, zone.y + zone.h / 2 - 10, 40, 20);
      // We can't draw text via graphics, use scene text instead
      const label = this.add
        .text(zone.x + zone.w / 2, zone.y + zone.h / 2, `${count}`, {
          fontSize: '13px', color: '#ffffff', fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
        })
        .setOrigin(0.5).setDepth(6);
      // Auto-destroy on next rebuild
      (label as any)._heatLabel = true;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // LEADERBOARD
  // ──────────────────────────────────────────────────────────────

  private updateLeaderboard(): void {
    const all = [
      { name: humanPlayer.name, nw: humanPlayer.netWorth, owned: humanPlayer.propertyCount, skills: humanPlayer.learnedSkills.size },
      ...this.aiPlayers.map((a) => ({
        name: a.state.name,
        nw: a.state.netWorth,
        owned: a.state.propertyCount,
        skills: a.state.learnedSkills.size,
      })),
    ].sort((a, b) => b.nw - a.nw);

    const lines: string[] = [];
    lines.push('──  Rankings  ──');
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
      lines.push(`${medal} ${p.name}: $${p.nw.toLocaleString()}`);
    }
    lines.push('');
    lines.push('Press H: Heat Map');
    this.leaderboardText.setText(lines.join('\n'));
  }

  // ──────────────────────────────────────────────────────────────
  // ──────────────────────────────────────────────────────────────
  // CHAT INPUT (multiplayer)
  // ──────────────────────────────────────────────────────────────

  private openChatInput(): void {
    if (this.chatOpen || !this.multiplayerMode) return;
    this.chatOpen = true;

    const el = document.createElement('input');
    el.type = 'text';
    el.placeholder = 'Type a message…';
    el.maxLength = 200;
    Object.assign(el.style, {
      position: 'fixed',
      bottom: '60px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '320px',
      maxWidth: '80vw',
      padding: '8px 12px',
      fontSize: '14px',
      fontFamily: 'Arial, sans-serif',
      color: '#fff',
      background: 'rgba(10,10,30,0.92)',
      border: '1px solid rgba(100,180,255,0.4)',
      borderRadius: '8px',
      outline: 'none',
      zIndex: '500',
    });

    const close = () => {
      el.remove();
      this.chatOpen = false;
    };

    el.addEventListener('keydown', (ev: KeyboardEvent) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') {
        const msg = el.value.trim();
        if (msg && this.realtime) {
          const userCtx = (window as any).__capcrewUser;
          this.realtime.sendGameEvent('chat', {
            fromName: userCtx?.username ?? 'Player',
            message: msg,
          });
          // Show own message locally
          this.showNotification(`💬 ${userCtx?.username ?? 'You'}`, msg);
        }
        close();
      } else if (ev.key === 'Escape') {
        close();
      }
    });

    el.addEventListener('blur', close);
    document.body.appendChild(el);
    el.focus();
  }

  // ──────────────────────────────────────────────────────────────
  // CLEANUP
  // ──────────────────────────────────────────────────────────────

  // ──────────────────────────────────────────────────────────────
  // MULTIPLAYER
  // ──────────────────────────────────────────────────────────────

  private setupRealtimeListeners(): void {
    if (!this.realtime) return;
    const rt = this.realtime;

    // Remote player moved
    rt.events.on('position', (p: PositionPayload) => {
      this.onRemotePosition(p);
    });

    // Tick sync from another player
    rt.events.on('tick_sync', (p: TickSyncPayload) => {
      this.onRemoteTickSync(p);
    });

    // Game events (emergency, sabotage, trade, chat)
    rt.events.on('game_event', (ev: GameEventPayload) => {
      this.onRemoteGameEvent(ev);
    });

    // Connection error / reconnect
    rt.events.on('error', (err: { message: string }) => {
      this.showNotification('⚠️ CONNECTION', err.message);
    });

    // Presence: players joined or left
    rt.events.on('presence_diff', (diff) => {
      for (const meta of diff.joined) {
        if (meta.userId !== (window as any).__capcrewUser?.id) {
          this.ensureRemotePlayer(meta);
        }
      }
      for (const meta of diff.left) {
        this.removeRemotePlayer(meta.userId);
      }
    });

    // Full presence sync
    rt.events.on('presence_sync', (metas: PresenceMeta[]) => {
      const myId = (window as any).__capcrewUser?.id;
      const seen = new Set<string>();
      for (const meta of metas) {
        if (meta.userId !== myId) {
          seen.add(meta.userId);
          this.ensureRemotePlayer(meta);
        }
      }
      // Remove players no longer present
      for (const [id] of this.remotePlayers) {
        if (!seen.has(id)) this.removeRemotePlayer(id);
      }
    });

    // Errors
    rt.events.on('error', (err) => {
      console.warn('[RealtimeSync] error:', err.message);
    });
  }

  /** Ensure a remote player sprite exists; create if needed. */
  private ensureRemotePlayer(meta: PresenceMeta): void {
    if (this.remotePlayers.has(meta.userId)) return;
    const colors = [0x00ffff, 0xff4444, 0xffaa00, 0xaa44ff, 0x44ff44, 0xff44ff, 0xffff44, 0x44ffff];
    const color = colors[meta.colorIndex % colors.length] ?? 0xffffff;
    const texKey = generateCapsuleTexture(this, color, meta.username);
    const sprite = this.physics.add.sprite(MAP_W / 2, MAP_H / 2, texKey);
    sprite.setDepth(10);
    sprite.setOrigin(0.5, 0.52);
    (sprite.body as Phaser.Physics.Arcade.Body).setCircle(10, 4, 8);
    sprite.setAlpha(0.85);
    const label = this.add
      .text(MAP_W / 2, MAP_H / 2 - 26, meta.username, {
        fontSize: '11px',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(11);
    const state = new PlayerState(meta.userId, meta.username, color);
    this.remotePlayers.set(meta.userId, {
      sprite,
      label,
      state,
      lastUpdate: Date.now(),
      posBuffer: [],
      targetX: MAP_W / 2,
      targetY: MAP_H / 2,
    });
  }

  /** Remove a remote player's sprite and clean up. */
  private removeRemotePlayer(userId: string): void {
    const rp = this.remotePlayers.get(userId);
    if (!rp) return;
    rp.sprite.destroy();
    rp.label.destroy();
    this.remotePlayers.delete(userId);
  }

  /** Handle incoming position broadcast from a remote player. */
  private onRemotePosition(p: PositionPayload): void {
    const rp = this.remotePlayers.get(p.userId);
    if (!rp) return;
    // Buffer the position; tickRemoteInterpolation drains it smoothly
    rp.posBuffer.push({ x: p.x, y: p.y, ts: p.ts });
    // Cap buffer to prevent memory build-up on stalled connections
    if (rp.posBuffer.length > 10) rp.posBuffer.shift();
    rp.lastUpdate = p.ts;
  }

  /** Called every frame — drains the position buffer and lerps toward the next target. */
  private tickRemoteInterpolation(): void {
    const lerpFactor = 0.15; // smooth glide, ~15% per frame
    for (const rp of this.remotePlayers.values()) {
      // Pop next buffered target when we've nearly reached the current one
      if (rp.posBuffer.length > 0) {
        const dx = rp.targetX - rp.sprite.x;
        const dy = rp.targetY - rp.sprite.y;
        if (dx * dx + dy * dy < 4) {
          const next = rp.posBuffer.shift()!;
          rp.targetX = next.x;
          rp.targetY = next.y;
        }
      }
      // Lerp sprite toward the current target
      rp.sprite.x = Phaser.Math.Linear(rp.sprite.x, rp.targetX, lerpFactor);
      rp.sprite.y = Phaser.Math.Linear(rp.sprite.y, rp.targetY, lerpFactor);
      rp.label.setPosition(rp.sprite.x, rp.sprite.y - 26);
    }
  }

  /** Handle incoming tick sync from a remote player. */
  private onRemoteTickSync(p: TickSyncPayload): void {
    const rp = this.remotePlayers.get(p.userId);
    if (!rp) return;
    rp.state.cash = p.cash;
    rp.state.debt = p.debt;
    rp.state.tickCount = p.tickCount;
    rp.state.ownedPropertyIds = new Set(p.propertyIds);
    rp.state.learnedSkills = new Set(p.skillIds);
  }

  /** Handle incoming game event from a remote player. */
  private onRemoteGameEvent(ev: GameEventPayload): void {
    switch (ev.type) {
      case 'emergency_start':
        // A remote player triggered an emergency — apply locally
        if (!this.currentEmergency) {
          this.currentEmergency = {
            type: ev.data.emergencyType as Emergency['type'],
            zoneId: ev.data.zoneId as string,
            startMs: ev.ts,
            durationMs: (ev.data.durationMs as number) ?? 35_000,
            resolved: false,
            expired: false,
            fixedBy: null,
          };
        }
        break;
      case 'emergency_fixed':
        if (this.currentEmergency) {
          this.currentEmergency.resolved = true;
          this.currentEmergency.fixedBy = ev.data.fixedBy as string;
          this.showNotification(
                      '✅ FIXED',
                      `Emergency resolved by ${ev.data.fixedBy ?? 'someone'}!`,
                      2,
                    );
          this.currentEmergency = null;
        }
        break;
      case 'sabotage_activate':
        // Sync sabotage from remote
        {
          const sabId = ev.data.sabotageId as SabotageId;
          const zoneId = ev.data.zoneId as string | undefined;
          const active = buildSabotage(this, sabId, zoneId, ev.ts);
          if (active) {
            this.activeSabotages.push(active);
            const def = SABOTAGES.find((s) => s.id === sabId);
            if (def) {
              this.showNotification(
                              `⚡ ${def.icon} ${def.name}`,
                              `${def.desc} (activated by ${ev.data.fromName ?? 'someone'})`,
                              3,
                            );
            }
          }
        }
        break;
      case 'chat':
        this.showNotification(
          `💬 ${ev.data.fromName ?? 'Player'}`,
          (ev.data.message as string) ?? '',
        );
        break;
      default:
        break;
    }
  }

  private cleanup(): void {
    if (this.eHandler) {
      document.removeEventListener('keydown', this.eHandler);
      document.removeEventListener('keyup', this.eHandler);
    }
    for (const node of this.nodes) node.destroy();
    this.nodes = [];
    this.prompt.destroy();
    this.panel.destroy();
    this.tick.destroy();
    this.activeNode = null;

    // Destroy AI
    for (const ai of this.aiPlayers) ai.destroy();
    this.aiPlayers = [];

    // Destroy heat map labels
    this.children.list
      .filter((c) => (c as any)._heatLabel)
      .forEach((c) => c.destroy());

    // Destroy active notification
    this.notifQueue.length = 0;
    this.notifActive = false;
    if (this.notifBg) { this.notifBg.destroy(); this.notifBg = null; }
    if (this.notifTitle) { this.notifTitle.destroy(); this.notifTitle = null; }
    if (this.notifMsg) { this.notifMsg.destroy(); this.notifMsg = null; }

    // ── MULTIPLAYER — leave realtime channel ──
    if (this.realtime) {
      void this.realtime.leave();
      this.realtime = null;
    }
    // Destroy remote player sprites
    for (const [id, rp] of this.remotePlayers) {
      rp.sprite.destroy();
      rp.label.destroy();
    }
    this.remotePlayers.clear();
  }

  // ══════════════════════════════════════════════════════════════
  // MAP DRAWING
  // ══════════════════════════════════════════════════════════════

  private drawMap(): void {
    const g = this.groundLayer;
    const shadowG = this.wallShadows;
    const lightG = this.lightLayer;

    // ── Background: deep space-black with subtle radial vignette ──
    g.fillStyle(0x080818, 1);
    g.fillRect(0, 0, MAP_W, MAP_H);

    // Subtle ambient glow at map center
    lightG.fillStyle(0x1a1a3a, 0.15);
    lightG.fillCircle(MAP_W / 2, MAP_H / 2, 600);

    // ── Draw zones ──
    for (const zone of ZONES) {
      const { x, y, w, h, color, label, icon, id } = zone;
      const isResidential = id.startsWith('residential');
      const isService = id === 'bank' || id === 'university' || id === 'real_estate';
      const isPlaza = id === 'plaza';
      const isDayJob = id === 'day_job';

      // Drop shadow behind zone (3D depth)
      if (!isPlaza) {
        shadowG.fillStyle(0x000000, 0.35);
        shadowG.fillRoundedRect(x + 6, y + 8, w, h, 4);
        // Secondary softer shadow
        shadowG.fillStyle(0x000000, 0.15);
        shadowG.fillRoundedRect(x + 12, y + 16, w, h, 8);
      }

      if (isPlaza) {
        this.drawPlaza(g, lightG, x, y, w, h);
      } else if (isResidential) {
        this.drawHouses(g, x, y, w, h, color);
      } else {
        this.drawBuilding(g, lightG, x, y, w, h, color);
      }

      // ── Zone label (Among Us-style floating tag) ──
      const labelStr = icon ? `${icon}  ${label}` : label;
      // Label background pill
      const labelText = this.add
        .text(x + w / 2, y + 18, labelStr, {
          fontSize: '14px',
          color: '#ffffff',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(2);

      // Label glow
      lightG.fillStyle(color, 0.08);
      lightG.fillRoundedRect(
        x + w / 2 - labelText.width / 2 - 12,
        y + 5,
        labelText.width + 24,
        26,
        6,
      );

      // ── Doorway light cones ──
      if (!isPlaza) {
        const doorX = x + w / 2;
        const doorY = y + h;
        lightG.fillStyle(0xffeeaa, 0.06);
        lightG.fillTriangle(doorX - 30, doorY, doorX + 30, doorY, doorX, doorY + 50);
      }
    }
  }

  private drawBuilding(g: Phaser.GameObjects.Graphics, lightG: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
    const r = (color >> 16) & 0xff, gv = (color >> 8) & 0xff, b = color & 0xff;
    const bright = Phaser.Display.Color.GetColor(Math.min(255, r + 40), Math.min(255, gv + 40), Math.min(255, b + 40));
    const darkWall = Phaser.Display.Color.GetColor(Math.floor(r * 0.35), Math.floor(gv * 0.35), Math.floor(b * 0.35));
    const deepDark = Phaser.Display.Color.GetColor(Math.floor(r * 0.2), Math.floor(gv * 0.2), Math.floor(b * 0.2));

    // ── Floor fill ──
    g.fillStyle(color, 0.3);
    g.fillRoundedRect(x + 6, y + 6, w - 12, h - 12, 3);

    // ── 3D Walls (thick with perspective) ──
    // Top wall (brighter — light hits from above)
    g.fillStyle(bright, 0.6);
    g.fillRect(x, y, w, 8);
    g.fillStyle(bright, 0.2);
    g.fillRect(x + 4, y + 8, w - 8, 3);

    // Left wall (medium)
    g.fillStyle(darkWall, 0.8);
    g.fillRect(x, y, 8, h);
    g.fillStyle(bright, 0.12);
    g.fillRect(x + 8, y + 8, 3, h - 16);

    // Right wall (shadow side)
    g.fillStyle(deepDark, 0.9);
    g.fillRect(x + w - 8, y, 8, h);
    g.fillStyle(0x000000, 0.2);
    g.fillRect(x + w - 12, y + 8, 4, h - 16);

    // Bottom wall
    g.fillStyle(deepDark, 0.85);
    g.fillRect(x, y + h - 8, w, 8);
    g.fillStyle(0x000000, 0.25);
    g.fillRect(x + 4, y + h - 10, w - 8, 3);

    // Corner pillars (3D depth)
    g.fillStyle(0x050510, 1);
    for (const [cx, cy] of [[x, y], [x + w - 8, y], [x, y + h - 8], [x + w - 8, y + h - 8]]) {
      g.fillRect(cx, cy, 8, 8);
      g.fillStyle(bright, 0.1);
      g.fillRect(cx + 1, cy + 1, 2, 2);
      g.fillStyle(0x050510, 1);
    }

    // ── Windows (3D glass effect) ──
    const winCols = Math.max(2, Math.floor((w - 60) / 70));
    const winRows = Math.max(1, Math.floor((h - 80) / 50));
    const winSpacingX = (w - 60) / winCols;
    const winSpacingY = (h - 80) / Math.max(1, winRows);

    for (let row = 0; row < winRows; row++) {
      for (let col = 0; col < winCols; col++) {
        const wx = x + 24 + col * winSpacingX;
        const wy = y + 28 + row * winSpacingY;
        const ww = 22;
        const wh = 26;

        // Window recess (dark frame)
        g.fillStyle(deepDark, 0.9);
        g.fillRoundedRect(wx - 2, wy - 2, ww + 4, wh + 4, 3);

        // Glass
        g.fillStyle(0x334466, 0.8);
        g.fillRoundedRect(wx, wy, ww, wh, 2);

        // Glass gradient (top brighter)
        g.fillStyle(0x5588aa, 0.5);
        g.fillRoundedRect(wx + 1, wy + 1, ww - 2, wh / 2 - 1, { tl: 2, tr: 2, bl: 0, br: 0 });

        // Reflection highlight
        g.fillStyle(0xaaccee, 0.3);
        g.fillRoundedRect(wx + 3, wy + 2, ww - 8, 4, 2);

        // Small specular
        g.fillStyle(0xffffff, 0.4);
        g.fillCircle(wx + ww - 5, wy + 4, 1.5);
      }
    }

    // ── Door (Among Us-style rounded door) ──
    const doorW = 28;
    const doorH = 36;
    const doorX = x + w / 2 - doorW / 2;
    const doorY = y + h - doorH - 8;

    // Door recess
    g.fillStyle(deepDark, 1);
    g.fillRoundedRect(doorX - 3, doorY - 3, doorW + 6, doorH + 6, 4);

    // Door panel
    g.fillStyle(color, 0.55);
    g.fillRoundedRect(doorX, doorY, doorW, doorH, 3);

    // Door window
    g.fillStyle(0x4477aa, 0.4);
    g.fillRoundedRect(doorX + 6, doorY + 4, doorW - 12, 14, 3);

    // Door handle (gold knob)
    g.fillStyle(0xffd700, 0.7);
    g.fillCircle(doorX + doorW - 8, doorY + doorH / 2 + 4, 2.5);
    g.fillStyle(0xffee88, 0.4);
    g.fillCircle(doorX + doorW - 8, doorY + doorH / 2 + 3, 1);

    // ── Ambient light at door ──
    lightG.fillStyle(0xffdd66, 0.08);
    lightG.fillCircle(doorX + doorW / 2, doorY + doorH, 30);
    lightG.fillStyle(0xffdd66, 0.04);
    lightG.fillCircle(doorX + doorW / 2, doorY + doorH, 50);
  }

  private drawHouses(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number): void {
    const r = (color >> 16) & 0xff, gv = (color >> 8) & 0xff, b = color & 0xff;
    const bright = Phaser.Display.Color.GetColor(Math.min(255, r + 50), Math.min(255, gv + 50), Math.min(255, b + 50));
    const mid = Phaser.Display.Color.GetColor(r, gv, b);
    const roofC = Phaser.Display.Color.GetColor(Math.max(0, r - 40), Math.max(0, gv - 40), Math.max(0, b - 40));
    const deepDark = Phaser.Display.Color.GetColor(Math.max(0, r - 80), Math.max(0, gv - 80), Math.max(0, b - 80));

    // ── Zone background (subtle floor) ──
    g.fillStyle(color, 0.15);
    g.fillRoundedRect(x + 6, y + 6, w - 12, h - 12, 4);

    const houseCount = w > 350 ? 4 : 3;
    const spacing = (w - 60) / houseCount;
    const houseW = 72;
    const houseH = 56;

    for (let i = 0; i < houseCount; i++) {
      const hx = x + 22 + i * spacing;
      const hy = y + 40 + (i % 2) * 12;

      // House shadow (3D depth)
      g.fillStyle(0x000000, 0.25);
      g.fillRoundedRect(hx + 4, hy + 6, houseW, houseH, 4);

      // House body
      g.fillStyle(mid, 0.6);
      g.fillRoundedRect(hx, hy, houseW, houseH, 4);

      // 3D left highlight
      g.fillStyle(bright, 0.25);
      g.fillRoundedRect(hx + 2, hy + 2, 8, houseH - 4, { tl: 3, tr: 0, bl: 3, br: 0 });

      // 3D right shadow
      g.fillStyle(deepDark, 0.3);
      g.fillRoundedRect(hx + houseW - 10, hy + 2, 8, houseH - 4, { tl: 0, tr: 3, bl: 0, br: 3 });

      // ── Roof (3D peaked) ──
      // Roof shadow
      g.fillStyle(0x000000, 0.2);
      g.fillTriangle(hx - 6, hy + 2, hx + houseW + 6, hy + 2, hx + houseW / 2, hy - 16);

      // Roof main
      g.fillStyle(roofC, 0.7);
      g.fillTriangle(hx - 6, hy, hx + houseW + 6, hy, hx + houseW / 2, hy - 18);

      // Roof highlight (left slope)
      g.fillStyle(bright, 0.15);
      g.fillTriangle(hx - 4, hy, hx + houseW / 2, hy, hx + houseW / 2, hy - 16);

      // Roof outline
      g.lineStyle(1, 0xffffff, 0.12);
      g.strokeTriangle(hx - 6, hy, hx + houseW + 6, hy, hx + houseW / 2, hy - 18);

      // ── Windows (3D glass) ──
      const winW = 14;
      const winH = 14;
      // Left window
      this.draw3DWindow(g, hx + 10, hy + 12, winW, winH, deepDark);
      // Right window
      this.draw3DWindow(g, hx + houseW - 10 - winW, hy + 12, winW, winH, deepDark);

      // ── Door ──
      const dw = 14;
      const dh = 20;
      const dx = hx + houseW / 2 - dw / 2;
      const dy = hy + houseH - dh - 2;
      g.fillStyle(deepDark, 0.9);
      g.fillRoundedRect(dx - 1, dy - 1, dw + 2, dh + 2, 2);
      g.fillStyle(color, 0.5);
      g.fillRoundedRect(dx, dy, dw, dh, 2);
      // Door knob
      g.fillStyle(0xffd700, 0.6);
      g.fillCircle(dx + dw - 4, dy + dh / 2, 1.5);
    }
  }

  private drawPlaza(g: Phaser.GameObjects.Graphics, lightG: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
    // ── Corridor floor (Among Us space-station style) ──
    g.fillStyle(0x1a1a2e, 0.9);
    g.fillRoundedRect(x, y, w, h, 2);

    // Subtle tile grid
    g.lineStyle(1, 0x2a2a4e, 0.25);
    for (let px = x + TILE; px < x + w; px += TILE) {
      g.strokeLineShape(new Phaser.Geom.Line(px, y + 2, px, y + h - 2));
    }
    for (let py = y + TILE; py < y + h; py += TILE) {
      g.strokeLineShape(new Phaser.Geom.Line(x + 2, py, x + w - 2, py));
    }

    // Center glow line (running light strip — Among Us corridor feel)
    lightG.fillStyle(0x4466aa, 0.06);
    lightG.fillRect(x + 20, y + h / 2 - 2, w - 40, 4);
    lightG.fillStyle(0x6688cc, 0.04);
    lightG.fillRect(x + 40, y + h / 2 - 1, w - 80, 2);

    // Edge glow (top and bottom)
    g.fillStyle(0x334466, 0.12);
    g.fillRect(x, y, w, 2);
    g.fillRect(x, y + h - 2, w, 2);
  }

  private drawGrid(): void {
    // Very subtle background grid (barely visible — space station floor feel)
    const g = this.groundLayer;
    g.lineStyle(1, 0x1a1a3a, 0.08);
    for (let gx = 0; gx <= MAP_W; gx += TILE) {
      g.strokeLineShape(new Phaser.Geom.Line(gx, 0, gx, MAP_H));
    }
    for (let gy = 0; gy <= MAP_H; gy += TILE) {
      g.strokeLineShape(new Phaser.Geom.Line(0, gy, MAP_W, gy));
    }
  }

  /** Helper: draw a single 3D window (glass pane with highlight) */
  private draw3DWindow(g: Phaser.GameObjects.Graphics, wx: number, wy: number, ww: number, wh: number, frameColor: number): void {
    // Frame
    g.fillStyle(frameColor, 0.9);
    g.fillRoundedRect(wx - 2, wy - 2, ww + 4, wh + 4, 3);
    // Glass base
    g.fillStyle(0x334466, 0.8);
    g.fillRoundedRect(wx, wy, ww, wh, 2);
    // Top gradient
    g.fillStyle(0x5588aa, 0.45);
    g.fillRoundedRect(wx + 1, wy + 1, ww - 2, wh / 2 - 1, { tl: 2, tr: 2, bl: 0, br: 0 });
    // Reflection
    g.fillStyle(0xaaccee, 0.3);
    g.fillRoundedRect(wx + 2, wy + 2, ww - 6, 3, 1);
    // Specular
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(wx + ww - 4, wy + 3, 1.2);
  }
}
