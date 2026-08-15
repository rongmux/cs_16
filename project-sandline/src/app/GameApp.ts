// GameApp: the browser shell. Owns the three.js renderer, viewmodel, debug
// helpers, input -> match pipeline, HUD/menus/console wiring and audio.
// Simulation stays in Match; presentation only reads state and events
// (design doc 6.2).

import * as THREE from 'three';
import { FixedStepLoop } from '../core/FixedStepLoop';
import { vec3, Vec3 } from '../core/math';
import { Match } from '../sim/Match';
import { PlayerEntity, PlayerCommand } from '../player/PlayerEntity';
import { WeaponInstance } from '../weapons/WeaponInstance';
import { InputManager } from '../input/InputManager';
import { AudioSystem } from '../audio/AudioSystem';
import { Hud } from '../ui/Hud';
import { BuyMenu } from '../ui/BuyMenu';
import { Menus } from '../ui/Menus';
import { DebugConsole } from '../ui/DebugConsole';
import { DebugOverlay } from '../debug/DebugOverlay';
import { loadSettings, saveSettings, GameSettings } from '../ui/Settings';
import { clampBotCount } from '../rules/MatchConfig';
import { difficultyIds, round } from '../world/DataFiles';

const TEAM_COLORS: Record<string, number> = {
  attackers: 0xd98e3a,
  defenders: 0x4f9de0,
  spectator: 0x7a9e6b,
};

const VIEWMODEL_COLORS: Record<string, number> = {
  pistol: 0x5c6470,
  rifle: 0x4a5242,
  smg: 0x39424e,
  sniper: 0x2f4a3a,
  shotgun: 0x5a4636,
  machinegun: 0x3d3f45,
  melee: 0x8a8d92,
  grenade: 0x55603a,
  objective: 0x3a2f2f,
};

type AppState = 'menu' | 'playing';

export class GameApp {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private loop: FixedStepLoop;
  private match: Match | null = null;
  private human: PlayerEntity | null = null;
  private input: InputManager;
  private audio = new AudioSystem();
  private hud: Hud;
  private buyMenu: BuyMenu;
  private menus: Menus;
  private consoleUI: DebugConsole;
  private debug = new DebugOverlay();
  private settings: GameSettings;
  private state: AppState = 'menu';
  private entityMeshes = new Map<number, THREE.Group>();
  private bombMesh: THREE.Group | null = null;
  private bombLight: THREE.PointLight | null = null;
  private grenadeMeshes = new Map<number, THREE.Mesh>();
  private viewmodel: THREE.Group | null = null;
  private muzzleFlash: THREE.Mesh | null = null;
  private tracerPool: THREE.Line[] = [];
  private tracerData: { from: Vec3; to: Vec3; until: number }[] = [];
  private lastShots: Map<number, Vec3> = new Map();
  private mapGroup = new THREE.Group();
  private debugGroup = new THREE.Group();
  private navLines: THREE.LineSegments | null = null;
  private botTargetLines = new Map<number, THREE.Line>();
  private hitboxMeshes = new Map<number, THREE.LineSegments>();
  private spreadLines: THREE.Line[] = [];
  private debugText: HTMLElement;
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private frameMs = 0;
  private lastFrameAt = performance.now();
  private kickAnim = 0;
  private muzzleUntil = 0;
  private viewmodelSway = 0;
  private deathNotified = false;
  private rootEl: HTMLElement;
  private disposed = false;

  constructor(rootEl: HTMLElement) {
    this.rootEl = rootEl;
    this.settings = loadSettings();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    rootEl.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = 'game-canvas';

    this.camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.05, 500);
    this.scene.background = new THREE.Color(0x232a33);
    this.scene.fog = new THREE.Fog(0x232a33, 40, 180);
    const hemi = new THREE.HemisphereLight(0xdfe8f0, 0x3a3128, 0.85);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    sun.position.set(30, 60, 20);
    this.scene.add(hemi, sun);

    this.debugGroup.visible = false;
    this.scene.add(this.debugGroup);

    this.input = new InputManager({
      onBuyMenu: () => this.toggleBuyMenu(),
      onConsole: () => this.consoleUI.toggle(),
      onPause: () => this.onEscPressed(),
      onLockChange: (locked) => this.onLockChange(locked),
      onDebugKey: (n) => this.debug.toggleKey(n),
    });
    this.input.look.setSensitivity(this.settings.sensitivity);
    this.input.look.invertY = this.settings.invertY;
    this.audio.setVolume(this.settings.volume);

    this.hud = new Hud(() => this.toggleBuyMenu());
    rootEl.appendChild(this.hud.root);
    this.hud.setVisible(false);

    this.buyMenu = new BuyMenu({
      onBuy: (item) => {
        if (this.match && this.human) this.match.tryBuy(this.human.id, item);
      },
      onClose: () => this.closeBuyMenu(),
    });
    rootEl.appendChild(this.buyMenu.root);

    this.menus = new Menus(this.settings, {
      onStart: (s) => this.startMatch(s),
      onResume: () => this.resumeGame(),
      onQuitToMenu: () => this.quitToMenu(),
      onRestartRound: () => this.match?.roundManager.restartRound(this.match),
      onRematch: () => this.startMatch(this.settings),
      onSettingsChanged: (s) => this.applySettings(s),
    });
    rootEl.appendChild(this.menus.main);
    rootEl.appendChild(this.menus.pause);
    rootEl.appendChild(this.menus.matchEnd);

    this.consoleUI = new DebugConsole((line) => this.execConsole(line));
    rootEl.appendChild(this.consoleUI.root);

    this.debugText = document.createElement('div');
    this.debugText.id = 'debug-text';
    this.debugText.style.display = 'none';
    rootEl.appendChild(this.debugText);

    this.loop = new FixedStepLoop({
      step: (dt) => this.step(dt),
      render: () => this.render(),
    });

    window.addEventListener('resize', this.onResize);
    this.input.attach(this.renderer.domElement, this.renderer.domElement);
    this.loop.start();
  }

  // ---- Settings --------------------------------------------------------

  private applySettings(s: GameSettings): void {
    this.settings = s;
    this.input.look.setSensitivity(s.sensitivity);
    this.input.look.invertY = s.invertY;
    this.audio.setVolume(s.volume);
    saveSettings(s);
  }

  // ---- Match lifecycle -------------------------------------------------

  private startMatch(settings: GameSettings): void {
    this.disposeMatch();
    this.applySettings(settings);
    this.match = new Match({
      mapId: settings.mapId,
      humanTeam: settings.humanTeam,
      botCount: clampBotCount(settings.botCount),
      botDifficulty: settings.botDifficulty,
      matchSeed: 0,
      maxRounds: round.maxRounds,
      botSplit: '',
    });
    this.human = this.match.addHuman(settings.humanTeam);
    this.deathNotified = false;
    this.buildMapVisuals();
    this.wireMatchEvents();
    this.match.startMatch();
    this.state = 'playing';
    this.menus.hideAll();
    this.hud.setVisible(true);
    this.audio.init();
    this.syncCameraToPlayer();
    this.requestLock();
  }

  private quitToMenu(): void {
    this.state = 'menu';
    this.match?.dispose();
    this.match = null;
    this.human = null;
    this.hud.setVisible(false);
    this.buyMenu.close();
    this.menus.showMain();
    this.clearSceneObjects();
    this.debugGroup.visible = false;
  }

  private disposeMatch(): void {
    this.match?.dispose();
    this.match = null;
    this.human = null;
    this.clearSceneObjects();
  }

  private clearSceneObjects(): void {
    this.scene.remove(this.mapGroup);
    for (const m of this.entityMeshes.values()) this.scene.remove(m);
    this.entityMeshes.clear();
    this.grenadeMeshes.clear();
    this.botTargetLines.clear();
    this.hitboxMeshes.clear();
    for (const l of this.spreadLines) this.debugGroup.remove(l);
    this.spreadLines = [];
    if (this.navLines) this.debugGroup.remove(this.navLines);
    this.navLines = null;
    if (this.bombMesh) this.scene.remove(this.bombMesh);
    this.bombMesh = null;
    if (this.bombLight) this.scene.remove(this.bombLight);
    this.bombLight = null;
    if (this.viewmodel) this.scene.remove(this.viewmodel);
    this.viewmodel = null;
    this.muzzleFlash = null;
    this.tracerData = [];
  }

  private wireMatchEvents(): void {
    const m = this.match!;
    m.eventBus.on('round_start', (e) => {
      this.hud.showAnnounce(`ROUND ${e.round}`, 'Get ready\u2026');
      this.deathNotified = false;
    });
    m.eventBus.on('round_live', () => this.hud.showAnnounce('GO', undefined));
    m.eventBus.on('round_end', (e) => {
      const winnerLabel =
        e.winner === 'attackers' ? 'RAIDERS WIN' : e.winner === 'defenders' ? 'RESPONSE UNIT WIN' : 'DRAW';
      this.hud.showRoundEnd(e.winner, e.reason);
      if (this.human) {
        if (e.winner === this.human.team) this.audio.play('win', 0.8);
        else this.audio.play('lose', 0.8);
      }
      void winnerLabel;
    });
    m.eventBus.on('match_end', (e) => {
      this.input.exitLock();
      this.match!.paused = true;
      this.menus.showMatchEnd(e.winner, e.score);
    });
    m.eventBus.on('player_death', (e) => {
      const victim = m.playerById(e.victimId);
      const attacker = e.attackerId !== null ? m.playerById(e.attackerId) : null;
      const weaponName = e.weaponId ? (m.registry.get(e.weaponId)?.displayName ?? e.weaponId) : '';
      this.hud.addFeed(attacker?.name ?? null, victim?.name ?? '?', weaponName, e.headshot);
      if (e.victimId === this.human?.id) {
        this.deathNotified = true;
        this.hud.showDeathBanner('You can fly around with WASD while dead');
      }
      if (e.attackerId === this.human?.id && e.victimId !== this.human?.id) {
        this.audio.play('hitmarker');
      }
    });
    m.eventBus.on('player_damage', (e) => {
      if (e.victimId === this.human?.id) {
        this.hud.flashDamage(Math.min(1, e.amount / 60));
      }
    });
    m.eventBus.on('weapon_fired', (e) => {
      const isHuman = e.shooterId === this.human?.id;
      this.lastShots.set(e.shooterId, vec3(e.pos.x, e.pos.y, e.pos.z));
      if (isHuman) {
        const w = m.registry.get(e.weaponId);
        this.audio.play(shotKindFor(w.category));
        this.kickAnim = 1;
        this.muzzleUntil = performance.now() + 45;
      } else if (this.human) {
        const w = m.registry.get(e.weaponId);
        this.audio.playAt(shotKindFor(w.category), e.pos, this.human.eyePos(), this.human.yaw, 70);
      }
    });
    m.eventBus.on('bullet_impact', (e) => {
      const shot = this.lastShots.get(this.human?.id ?? -1);
      if (shot) this.spawnTracer(shot, e.pos);
    });
    m.eventBus.on('player_damage', (e) => {
      const shot = this.lastShots.get(this.human?.id ?? -1);
      if (shot && e.attackerId === this.human?.id) {
        const victim = m.playerById(e.victimId);
        if (victim) this.spawnTracer(shot, vec3(victim.pos.x, victim.pos.y + 1.2, victim.pos.z));
      }
    });
    m.eventBus.on('footstep', (e) => {
      if (this.human) {
        if (e.playerId === this.human.id) this.audio.play('footstep', 0.7);
        else this.audio.playAt('footstep', e.pos, this.human.eyePos(), this.human.yaw, 18);
      }
    });
    m.eventBus.on('grenade_exploded', (e) => {
      this.audio.play('explosion', 0.9);
      if (this.human) {
        this.audio.playAt('explosion', e.pos, this.human.eyePos(), this.human.yaw, 100);
      }
    });
    m.eventBus.on('bomb_beep', (e) => {
      if (this.human) this.audio.playAt('beep', e.pos, this.human.eyePos(), this.human.yaw, 50);
    });
    m.eventBus.on('bomb_planted', () => {
      this.hud.showAnnounce('THE BOMB HAS BEEN PLANTED');
      this.audio.play('plant');
    });
    m.eventBus.on('bomb_defused', () => this.audio.play('defuse'));
    m.eventBus.on('bomb_exploded', () => this.audio.play('explosion', 1));
    m.eventBus.on('announce', (e) => this.hud.showAnnounce(e.text, e.sub ?? ''));
  }

  // ---- Input -> match --------------------------------------------------

  private step(dt: number): void {
    if (!this.match || this.state !== 'playing') return;
    const match = this.match;
    const human = this.human;
    if (!human) return;

    if (match.paused) return;

    const cmd = this.input.buildCommand();
    // Wheel slot cycling.
    const wheel = this.input.consumeWheel();
    if (wheel !== null && human.alive) {
      this.cycleSlot(wheel);
    }
    // Mouse look -> player angles.
    if (this.input.locked) {
      if (human.alive) {
        human.yaw = this.input.look.yaw;
        human.pitch = this.input.look.pitch;
      } else {
        this.spectatorFly(cmd, dt);
      }
    }
    match.humanCmd = cmd;
    match.step(dt);
    this.input.consumeEdges();

    // Auto close buy menu when buy time ends.
    if (this.buyMenu.isVisible && !match.buyingAllowed()) {
      this.closeBuyMenu();
    }
  }

  private spectatorFly(cmd: PlayerCommand, dt: number): void {
    if (!this.human) return;
    const sp = 14;
    const f = {
      x: Math.sin(this.input.look.yaw) * Math.cos(this.input.look.pitch),
      y: Math.sin(this.input.look.pitch),
      z: -Math.cos(this.input.look.yaw) * Math.cos(this.input.look.pitch),
    };
    const r = { x: Math.cos(this.input.look.yaw), y: 0, z: Math.sin(this.input.look.yaw) };
    const p = this.human.motor.pos;
    p.x += (f.x * cmd.forward + r.x * cmd.right) * sp * dt;
    p.z += (f.z * cmd.forward + r.z * cmd.right) * sp * dt;
    p.y += f.y * cmd.forward * sp * dt;
    if (cmd.jump) p.y += sp * dt;
    if (cmd.crouch) p.y -= sp * dt;
  }

  private cycleSlot(dir: number): void {
    if (!this.human) return;
    const order = ['primary', 'secondary', 'knife', 'grenade', 'objective'] as const;
    const cur = order.indexOf(this.human.activeSlot);
    for (let i = 1; i <= order.length; i++) {
      const next = order[(cur + dir * i + order.length) % order.length];
      const available =
        next === 'primary'
          ? !!this.human.inventory.primary
          : next === 'secondary'
            ? !!this.human.inventory.secondary
            : next === 'grenade'
              ? this.human.grenadeCount('grenade_frag') > 0
              : next === 'objective'
                ? this.human.inventory.hasBomb
                : true;
      if (available) {
        this.human.switchToSlot(next, this.match!.nowMs());
        return;
      }
    }
  }

  // ---- Pointer lock / pause --------------------------------------------

  private requestLock(): void {
    this.input.requestLock(this.renderer.domElement);
  }

  private onLockChange(locked: boolean): void {
    if (!this.match) return;
    if (this.state !== 'playing') return;
    if (locked) {
      // Hide menus, resume.
      this.menus.hideAll();
      this.match.paused = false;
      this.audio.init();
    } else {
      // Pointer released while playing -> pause (unless buy menu is open).
      if (this.buyMenu.isVisible) return;
      const snap = this.match.roundSnapshot();
      if (snap.phase === 'match_end') return;
      this.match.paused = true;
      this.menus.showPause();
    }
  }

  private onEscPressed(): void {
    // Escape exits pointer lock, which triggers onLockChange -> pause.
  }

  private resumeGame(): void {
    this.menus.hideAll();
    this.requestLock();
  }

  private toggleBuyMenu(): void {
    if (!this.match || !this.human) return;
    if (this.buyMenu.isVisible) {
      this.closeBuyMenu();
      return;
    }
    const ctx = this.match.buyContextFor(this.human);
    if (!ctx.inBuyZone || !ctx.buyTimeActive) return;
    this.buyMenu.open(this.match, this.human);
    this.input.exitLock();
    this.audio.play('click');
  }

  private closeBuyMenu(): void {
    this.buyMenu.close();
    if (this.match && !this.match.paused && this.state === 'playing') {
      this.requestLock();
    }
  }

  // ---- Rendering -------------------------------------------------------

  private buildMapVisuals(): void {
    this.scene.remove(this.mapGroup);
    this.mapGroup = new THREE.Group();
    const m = this.match!;
    // Merge boxes by color for cheap draw calls.
    const byColor = new Map<string, THREE.BufferGeometry[]>();
    for (const box of m.builtMap.renderBoxes) {
      const [cx, cy, cz] = box.c;
      const [sx, sy, sz] = box.s;
      const geo = new THREE.BoxGeometry(sx, sy, sz).translate(cx, cy, cz);
      const key = box.color;
      if (!byColor.has(key)) byColor.set(key, []);
      byColor.get(key)!.push(geo);
    }
    for (const [color, geos] of byColor) {
      const merged = mergeGeometries(geos);
      const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
      this.mapGroup.add(new THREE.Mesh(merged, mat));
    }
    this.scene.add(this.mapGroup);
    this.buildNavDebug();
  }

  private buildNavDebug(): void {
    if (!this.match) return;
    if (this.navLines) this.debugGroup.remove(this.navLines);
    const g = this.match.navGraph;
    const positions: number[] = [];
    for (let i = 0; i < g.nodes.length; i++) {
      for (const j of g.adjacencyForDebug(i)) {
        if (j <= i) continue;
        positions.push(g.nodes[i].x, g.nodes[i].y + 0.4, g.nodes[i].z);
        positions.push(g.nodes[j].x, g.nodes[j].y + 0.4, g.nodes[j].z);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.navLines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.4 }),
    );
    this.debugGroup.add(this.navLines);
  }

  private syncCameraToPlayer(): void {
    if (!this.human || !this.match) return;
    const p = this.human;
    this.camera.position.set(p.eyePos().x, p.eyePos().y, p.eyePos().z);
    this.input.look.setAngles(p.yaw, p.pitch);
  }

  private render(): void {
    if (this.disposed) return;
    const now = performance.now();
    this.frameMs = now - this.lastFrameAt;
    this.lastFrameAt = now;
    this.fpsFrames++;
    this.fpsTime += this.frameMs;
    if (this.fpsTime >= 500) {
      this.fps = Math.round((this.fpsFrames * 1000) / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    const match = this.match;
    const human = this.human;

    if (match && human && this.state === 'playing') {
      // Camera.
      const p = human;
      const eye = p.eyePos();
      let pitch = p.pitch;
      let yaw = p.yaw;
      const weapon = p.activeWeapon();
      if (weapon && p.alive) {
        const punch = weapon.viewPunch();
        pitch += punch.pitch;
        yaw += punch.yaw;
      }
      this.camera.position.set(eye.x, eye.y, eye.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.set(pitch, -yaw, 0);
      // Zoom FOV.
      const zoomLevel = weapon?.spec.zoomLevels ?? [1];
      const zl = zoomLevel[Math.min(p.zoomIndex, zoomLevel.length - 1)] ?? 1;
      const targetFov = 90 / zl;
      this.camera.fov += (targetFov - this.camera.fov) * 0.3;
      this.camera.updateProjectionMatrix();
      this.hud.setScope(p.zoomIndex > 0 && zoomLevel.length > 1 && p.alive);

      // Viewmodel.
      this.updateViewmodel(p, weapon, now);

      // Entity meshes.
      this.syncEntityMeshes(match, human);

      // Bomb / grenades.
      this.syncBomb(match);
      this.syncGrenades(match);

      // Debug helpers.
      this.updateDebugHelpers(match, human, now);

      // Tracers.
      this.updateTracers(now);

      // HUD.
      this.hud.update(match, human, now);
      if (this.buyMenu.isVisible) this.buyMenu.refresh(match, human);
      if (this.debug.state.menu || this.debug.state.fps) this.updateDebugText(match, human);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private updateViewmodel(p: PlayerEntity, weapon: WeaponInstance | null, now: number): void {
    if (!p.alive) {
      if (this.viewmodel) this.viewmodel.visible = false;
      return;
    }
    if (!this.viewmodel) {
      this.viewmodel = new THREE.Group();
      this.scene.add(this.viewmodel);
    }
    this.viewmodel.visible = true;
    const key = weapon?.spec.category ?? 'melee';
    const color = VIEWMODEL_COLORS[key] ?? 0x666666;

    // Rebuild geometry when the weapon category changes.
    if (this.viewmodel.userData.category !== key) {
      this.viewmodel.userData.category = key;
      while (this.viewmodel.children.length) this.viewmodel.remove(this.viewmodel.children[0]);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.055, 0.075, 0.34),
        new THREE.MeshLambertMaterial({ color }),
      );
      const barrel = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.02, 0.22),
        new THREE.MeshLambertMaterial({ color: 0x22262c }),
      );
      barrel.position.set(0, 0.045, -0.26);
      const grip = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.12, 0.05),
        new THREE.MeshLambertMaterial({ color: 0x2b2f36 }),
      );
      grip.position.set(0, -0.085, 0.08);
      grip.rotation.x = 0.25;
      this.viewmodel.add(body, barrel, grip);
      // Muzzle flash quad.
      const flash = new THREE.Mesh(
        new THREE.PlaneGeometry(0.12, 0.12),
        new THREE.MeshBasicMaterial({
          color: 0xffd27a,
          transparent: true,
          opacity: 0.9,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      flash.position.set(0, 0.045, -0.42);
      flash.visible = false;
      this.viewmodel.add(flash);
      this.muzzleFlash = flash;
    }

    // Reload dip + draw drop + sway + recoil kick.
    let dip = 0;
    if (weapon?.state === 'reloading') dip = Math.sin(now * 0.018) * 0.07;
    if (weapon?.state === 'drawing') dip = -0.2;
    this.kickAnim = Math.max(0, this.kickAnim - 0.14);
    this.viewmodelSway = Math.sin(now * 0.0011) * 0.004;

    const punch = weapon ? weapon.viewPunch().pitch : 0;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);
    const kick = this.kickAnim * 0.07;
    this.viewmodel.position
      .copy(this.camera.position)
      .addScaledVector(fwd, 0.42)
      .addScaledVector(right, 0.2)
      .addScaledVector(up, -0.16 + dip + this.viewmodelSway - kick);
    this.viewmodel.quaternion.copy(this.camera.quaternion);
    this.viewmodel.rotateX(-punch * 0.9 - this.kickAnim * 0.06 + dip * 0.4);
    if (this.muzzleFlash) {
      this.muzzleFlash.visible = now < this.muzzleUntil;
      if (this.muzzleFlash.visible) this.muzzleFlash.rotation.z = Math.random() * Math.PI;
    }
  }

  private syncEntityMeshes(match: Match, human: PlayerEntity): void {
    for (const p of match.players()) {
      let mesh = this.entityMeshes.get(p.id);
      if (!mesh) {
        mesh = buildPlayerMesh();
        this.entityMeshes.set(p.id, mesh);
        this.scene.add(mesh);
      }
      // Hide the human's own body in first person; show it when dead/spectating.
      mesh.visible = !(p.id === human.id && human.alive);
      const body = mesh.children[0] as THREE.Mesh;
      const head = mesh.children[1] as THREE.Mesh;
      if (!p.alive) {
        mesh.rotation.set(-Math.PI / 2, 0, 0);
        mesh.position.set(p.pos.x, p.pos.y + 0.1, p.pos.z);
        (body.material as THREE.MeshLambertMaterial).color.set(0x6a6a6a);
        (head.material as THREE.MeshLambertMaterial).color.set(0x6a6a6a);
      } else {
        mesh.rotation.set(0, -p.yaw + Math.PI, 0);
        mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
        const color = p.team === 'spectator' ? TEAM_COLORS.spectator : TEAM_COLORS[p.team];
        (body.material as THREE.MeshLambertMaterial).color.set(color);
        (head.material as THREE.MeshLambertMaterial).color.set(color);
        const h = p.motor.height;
        head.position.y = h - 0.18;
        body.position.y = h / 2 - 0.3;
        body.scale.y = Math.max(0.5, h / 1.7);
      }
    }
    // Remove meshes for departed entities.
    for (const id of this.entityMeshes.keys()) {
      if (!match.playerById(id)) {
        const mesh = this.entityMeshes.get(id)!;
        this.scene.remove(mesh);
        this.entityMeshes.delete(id);
      }
    }
  }

  private syncBomb(match: Match): void {
    if (!this.bombMesh) {
      this.bombMesh = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.18, 0.22),
        new THREE.MeshLambertMaterial({ color: 0x2c2f36 }),
      );
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.05, 0.08),
        new THREE.MeshLambertMaterial({ color: 0xb03a2e }),
      );
      top.position.y = 0.12;
      this.bombMesh.add(box, top);
      this.scene.add(this.bombMesh);
      this.bombLight = new THREE.PointLight(0xff3020, 0, 12);
      this.scene.add(this.bombLight);
    }
    const bomb = match.bomb;
    const visible = bomb.state === 'dropped' || bomb.state === 'planted' || bomb.state === 'defusing';
    this.bombMesh.visible = visible && bomb.pos.y > -50;
    this.bombMesh.position.set(bomb.pos.x, bomb.pos.y + 0.1, bomb.pos.z);
    if (this.bombLight) {
      this.bombLight.position.set(bomb.pos.x, bomb.pos.y + 0.4, bomb.pos.z);
      const urgency = bomb.state === 'planted' && bomb.timer < 10;
      this.bombLight.intensity = visible ? (urgency ? 2.2 : 1.0) : 0;
    }
  }

  private syncGrenades(match: Match): void {
    const seen = new Set<number>();
    match.grenades.forEach((g, i) => {
      seen.add(i);
      let mesh = this.grenadeMeshes.get(i as number);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.07, 8, 8),
          new THREE.MeshLambertMaterial({ color: 0x4c5a3a }),
        );
        this.grenadeMeshes.set(i as number, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(g.pos.x, g.pos.y, g.pos.z);
    });
    for (const [key, mesh] of this.grenadeMeshes) {
      if (!seen.has(key as number)) {
        this.scene.remove(mesh);
        this.grenadeMeshes.delete(key);
      }
    }
  }

  private spawnTracer(from: Vec3, to: Vec3): void {
    this.tracerData.push({ from, to, until: performance.now() + 90 });
  }

  private updateTracers(now: number): void {
    this.tracerData = this.tracerData.filter((t) => t.until > now);
    // Ensure pool lines.
    while (this.tracerPool.length < this.tracerData.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({
          color: 0xffe9b0,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracerPool.push(line);
    }
    this.tracerData.forEach((t, i) => {
      const line = this.tracerPool[i];
      const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      pos.setXYZ(0, t.from.x, t.from.y, t.from.z);
      pos.setXYZ(1, t.to.x, t.to.y, t.to.z);
      pos.needsUpdate = true;
      line.visible = true;
    });
    for (let i = this.tracerData.length; i < this.tracerPool.length; i++) {
      this.tracerPool[i].visible = false;
    }
  }

  // ---- Debug visuals ---------------------------------------------------

  private updateDebugHelpers(match: Match, human: PlayerEntity, now: number): void {
    const st = this.debug.state;
    this.debugGroup.visible = this.debug.anyVisual();

    // Bot target lines.
    if (st.botTargets) {
      for (const bot of match.bots.bots) {
        let line = this.botTargetLines.get(bot.entity.id);
        if (!line) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
          line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffaa00 }));
          line.frustumCulled = false;
          this.botTargetLines.set(bot.entity.id, line);
          this.debugGroup.add(line);
        }
        line.visible = bot.alive;
        if (bot.alive && (bot.movingTo || bot.lastSeenPos)) {
          const target = bot.movingTo ?? bot.lastSeenPos!;
          const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
          pos.setXYZ(0, bot.pos.x, bot.pos.y + 1.4, bot.pos.z);
          pos.setXYZ(1, target.x, target.y + 1.2, target.z);
          pos.needsUpdate = true;
        }
      }
    } else {
      for (const line of this.botTargetLines.values()) line.visible = false;
    }

    // Hitboxes.
    if (st.hitboxes) {
      for (const p of match.players()) {
        if (!p.alive) continue;
        let box = this.hitboxMeshes.get(p.id);
        if (!box) {
          const geo = new THREE.BoxGeometry(1, 1, 1);
          const edges = new THREE.EdgesGeometry(geo);
          box = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xff4040 }));
          this.hitboxMeshes.set(p.id, box);
          this.debugGroup.add(box);
        }
        const h = p.motor.height;
        box.visible = true;
        box.position.set(p.pos.x, p.pos.y + h / 2, p.pos.z);
        box.scale.set(p.radius * 2, h, p.radius * 2);
      }
    } else {
      for (const box of this.hitboxMeshes.values()) box.visible = false;
    }

    // Spread visualization.
    if (st.spread && human.alive) {
      const weapon = human.activeWeapon();
      const spread = weapon
        ? weapon.currentSpreadRadians({
            now: match.nowMs(),
            rng: match.rng,
            world: match.collision,
            origin: human.eyePos(),
            forward: human.viewForward(),
            right: human.viewRight(),
            up: vec3(0, 1, 0),
            isCrouching: human.crouching,
            isAirborne: !human.motor.grounded,
            moveSpeed: Math.hypot(human.motor.vel.x, human.motor.vel.z),
            maxSpeed: weapon.spec.maxMoveSpeed,
            zoomed: human.zoomIndex > 0,
            zoomLevel: human.zoomIndex,
            resolveShot: () => undefined,
          })
        : 0;
      const n = 8;
      while (this.spreadLines.length < n) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x44ddff }));
        line.frustumCulled = false;
        this.spreadLines.push(line);
        this.debugGroup.add(line);
      }
      const fwd = human.viewForward();
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const dir = {
          x: fwd.x + Math.cos(ang) * Math.sin(spread),
          y: fwd.y + Math.sin(ang) * Math.sin(spread),
          z: fwd.z,
        };
        const len = Math.hypot(dir.x, dir.y, dir.z);
        const line = this.spreadLines[i];
        const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
        const eye = human.eyePos();
        pos.setXYZ(0, eye.x, eye.y, eye.z);
        pos.setXYZ(1, eye.x + (dir.x / len) * 30, eye.y + (dir.y / len) * 30, eye.z + (dir.z / len) * 30);
        pos.needsUpdate = true;
        line.visible = true;
      }
    } else {
      for (const line of this.spreadLines) line.visible = false;
    }
    void now;
  }

  private updateDebugText(match: Match, human: PlayerEntity): void {
    const w = human.activeWeapon();
    const lines = [
      `fps ${this.fps}  \u00b7  frame ${this.frameMs.toFixed(1)}ms  \u00b7  sim tick ${this.loop.tickCount}`,
      `pos ${human.pos.x.toFixed(1)} ${human.pos.y.toFixed(1)} ${human.pos.z.toFixed(1)}`,
      `vel ${human.motor.vel.x.toFixed(2)} ${human.motor.vel.y.toFixed(2)} ${human.motor.vel.z.toFixed(2)}  \u00b7  grounded ${human.motor.grounded}`,
      `weapon ${w?.spec.displayName ?? '-'}  \u00b7  mag ${w?.mag ?? 0}/${w?.reserve ?? 0}  \u00b7  state ${w?.state ?? '-'}`,
      `spread ${((w?.spreadExtra ?? 0) * 1000).toFixed(1)} mrad  \u00b7  recoil ${(((w?.viewPunch().pitch ?? 0) * 180) / Math.PI).toFixed(2)}\u00b0`,
      `bots ${match.bots.count}  \u00b7  round ${match.roundSnapshot().phase}  \u00b7  phase timer ${match.roundSnapshot().timer.toFixed(1)}`,
      `god ${this.debug.state.god}  \u00b7  noclip ${this.debug.state.noclip}`,
    ];
    this.debugText.style.display = this.debug.state.menu ? '' : 'none';
    this.debugText.textContent = lines.join('\n');
  }

  // ---- Console ---------------------------------------------------------

  private execConsole(line: string): string {
    const [cmd, ...args] = line.split(/\s+/);
    const m = this.match;
    const dev = import.meta.env.DEV;
    switch (cmd) {
      case 'help':
        return 'ai_add <attackers|defenders|both> [n]  \u00b7  ai_remove <id>  \u00b7  ai_kick_all  \u00b7  ai_fill <n>  \u00b7  ai_difficulty <id>  \u00b7  round_restart  \u00b7  map_load <id>  \u00b7  show_nav  \u00b7  show_hitbox  \u00b7  show_spread  \u00b7  fps  \u00b7  god  \u00b7  noclip  \u00b7  give_weapon <id>  \u00b7  give_money <n>  \u00b7  set_hp <n>  \u00b7  set_armor <n>  \u00b7  clear';
      case 'clear':
        this.consoleUI.root.querySelector('#console-log')!.innerHTML = '';
        return '';
      case 'fps':
        this.debug.state.fps = !this.debug.state.fps;
        this.debugText.style.display = this.debug.state.fps || this.debug.state.menu ? '' : 'none';
        return `fps ${this.debug.state.fps ? 'on' : 'off'}`;
      case 'show_nav':
        this.debug.state.navmesh = !this.debug.state.navmesh;
        return `show_nav ${this.debug.state.navmesh ? 'on' : 'off'}`;
      case 'show_hitbox':
        this.debug.state.hitboxes = !this.debug.state.hitboxes;
        return `show_hitbox ${this.debug.state.hitboxes ? 'on' : 'off'}`;
      case 'show_spread':
        this.debug.state.spread = !this.debug.state.spread;
        return `show_spread ${this.debug.state.spread ? 'on' : 'off'}`;
      case 'ai_difficulty': {
        if (!m) return 'no match';
        if (!difficultyIds.includes(args[0])) return `unknown difficulty (${difficultyIds.join(', ')})`;
        m.bots.setDifficulty(args[0]);
        return `bot difficulty set to ${args[0]}`;
      }
      case 'ai_fill': {
        if (!m) return 'no match';
        const n = clampBotCount(parseInt(args[0] ?? '9', 10));
        const half = Math.floor(n / 2);
        m.bots.fill({ attackers: half, defenders: n - half });
        return `filled to ${n} bots`;
      }
      case 'ai_add': {
        if (!m) return 'no match';
        const team = args[0] === 'defenders' ? 'defenders' : args[0] === 'attackers' ? 'attackers' : null;
        const n = Math.min(5, parseInt(args[1] ?? '1', 10));
        if (!team) return 'usage: ai_add <attackers|defenders|both>';
        for (let i = 0; i < n; i++) m.bots.addBot(team);
        return `added ${n} bot(s) to ${team}`;
      }
      case 'ai_remove': {
        if (!m) return 'no match';
        const id = parseInt(args[0], 10);
        if (!Number.isFinite(id)) return 'usage: ai_remove <id>';
        return m.bots.removeBot(id) ? `removed bot ${id}` : 'bot not found';
      }
      case 'ai_kick_all': {
        if (!m) return 'no match';
        const n = m.bots.count;
        m.bots.kickAll();
        return `kicked ${n} bots`;
      }
      case 'round_restart':
        if (!m || m.training) return 'no bomb match';
        m.roundManager.restartRound(m);
        return 'round restarted';
      case 'map_load': {
        if (!args[0]) return 'usage: map_load <mapId>';
        this.startMatch({ ...this.settings, mapId: args[0] });
        return `loading ${args[0]}`;
      }
      case 'god':
        if (!m) return 'no match';
        m.godMode = !m.godMode;
        this.debug.state.god = m.godMode;
        return `god ${m.godMode ? 'on' : 'off'}`;
      case 'noclip':
        if (!m) return 'no match';
        m.noclip = !m.noclip;
        this.debug.state.noclip = m.noclip;
        return `noclip ${m.noclip ? 'on' : 'off'}`;
      case 'give_weapon': {
        if (!dev) return 'cheats are dev-build only';
        if (!m || !this.human) return 'no match';
        return m.giveWeaponCheat(this.human.id, args[0]) ? `gave ${args[0]}` : 'unknown weapon';
      }
      case 'give_money': {
        if (!dev) return 'cheats are dev-build only';
        if (!m || !this.human) return 'no match';
        this.human.money += parseInt(args[0] ?? '16000', 10);
        return `money ${this.human.money}`;
      }
      case 'set_hp': {
        if (!dev) return 'cheats are dev-build only';
        if (!this.human) return 'no match';
        this.human.health = Math.max(1, parseInt(args[0] ?? '100', 10));
        return `hp ${this.human.health}`;
      }
      case 'set_armor': {
        if (!dev) return 'cheats are dev-build only';
        if (!this.human) return 'no match';
        this.human.armor = Math.max(0, parseInt(args[0] ?? '100', 10));
        return `armor ${this.human.armor}`;
      }
      default:
        return `unknown command: ${cmd} (type help)`;
    }
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };
}

function buildPlayerMesh(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const headMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.35), bodyMat);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), headMat);
  body.position.y = 0.5;
  head.position.y = 1.35;
  group.add(body, head);
  return group;
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const total = geos.reduce((acc, g) => acc + g.getAttribute('position').count, 0);
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  let offset = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const nor = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      positions[(offset + i) * 3] = pos.getX(i);
      positions[(offset + i) * 3 + 1] = pos.getY(i);
      positions[(offset + i) * 3 + 2] = pos.getZ(i);
      normals[(offset + i) * 3] = nor.getX(i);
      normals[(offset + i) * 3 + 1] = nor.getY(i);
      normals[(offset + i) * 3 + 2] = nor.getZ(i);
    }
    offset += pos.count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  return merged;
}

function shotKindFor(category: string): Parameters<AudioSystem['play']>[0] {
  switch (category) {
    case 'pistol':
      return 'shot_pistol';
    case 'smg':
      return 'shot_smg';
    case 'sniper':
      return 'shot_sniper';
    case 'shotgun':
      return 'shot_shotgun';
    case 'machinegun':
      return 'shot_mg';
    case 'melee':
      return 'knife';
    default:
      return 'shot_rifle';
  }
}
