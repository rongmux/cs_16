// HUD overlay: health/armor/money, ammo, timer, score, kill feed, radar,
// announcements, crosshair with spread feedback, damage flash, death banner
// and scoped overlay. Visual design is original (design doc 27).

import { Match } from '../sim/Match';
import { PlayerEntity } from '../player/PlayerEntity';
import { labelOf } from '../rules/Team';
import { round } from '../world/DataFiles';
import { Radar } from './Radar';

export class Hud {
  root: HTMLElement;
  radar: Radar;
  private elHealth!: HTMLElement;
  private elArmor!: HTMLElement;
  private elHealthBar!: HTMLElement;
  private elArmorBar!: HTMLElement;
  private elMoney!: HTMLElement;
  private elAmmo!: HTMLElement;
  private elWeapon!: HTMLElement;
  private elTimer!: HTMLElement;
  private elScore!: HTMLElement;
  private elAnnounce!: HTMLElement;
  private elAnnounceSub!: HTMLElement;
  private elFeed!: HTMLElement;
  private elCrosshair!: HTMLElement;
  private elFlash!: HTMLElement;
  private elScope!: HTMLElement;
  private elBombTimer!: HTMLElement;
  private elHint!: HTMLElement;
  private flashUntil = 0;
  private announceUntil = 0;
  private feedItems: { html: string; until: number }[] = [];

  constructor(private onBuyRequest: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.style.display = 'none';
    this.root.innerHTML = `
      <div id="hud-top">
        <div id="hud-score"></div>
        <div id="hud-timer"></div>
      </div>
      <div id="hud-left">
        <div id="hud-health"><div id="hud-health-bar"></div><span id="hud-health-num">100</span><span id="hud-health-label">HP</span></div>
        <div id="hud-armor"><div id="hud-armor-bar"></div><span id="hud-armor-num">0</span><span id="hud-armor-label">AR</span></div>
        <div id="hud-money">$0</div>
      </div>
      <div id="hud-right">
        <div id="hud-ammo">0 / 0</div>
        <div id="hud-weapon"></div>
      </div>
      <div id="hud-center">
        <div id="hud-crosshair"><div class="ch-line ch-top"></div><div class="ch-line ch-bottom"></div><div class="ch-line ch-left"></div><div class="ch-line ch-right"></div><div id="ch-dot"></div></div>
        <div id="hud-announce"></div>
        <div id="hud-announce-sub"></div>
        <div id="hud-bombtimer"></div>
      </div>
      <div id="hud-feed"></div>
      <div id="hud-flash"></div>
      <div id="hud-hint"></div>
      <div id="hud-scope"><div id="scope-cross"></div></div>
    `;
    this.elHealth = this.root.querySelector('#hud-health-num')!;
    this.elArmor = this.root.querySelector('#hud-armor-num')!;
    this.elHealthBar = this.root.querySelector('#hud-health-bar')!;
    this.elArmorBar = this.root.querySelector('#hud-armor-bar')!;
    this.elMoney = this.root.querySelector('#hud-money')!;
    this.elAmmo = this.root.querySelector('#hud-ammo')!;
    this.elWeapon = this.root.querySelector('#hud-weapon')!;
    this.elTimer = this.root.querySelector('#hud-timer')!;
    this.elScore = this.root.querySelector('#hud-score')!;
    this.elAnnounce = this.root.querySelector('#hud-announce')!;
    this.elAnnounceSub = this.root.querySelector('#hud-announce-sub')!;
    this.elFeed = this.root.querySelector('#hud-feed')!;
    this.elCrosshair = this.root.querySelector('#hud-crosshair')!;
    this.elFlash = this.root.querySelector('#hud-flash')!;
    this.elScope = this.root.querySelector('#hud-scope')!;
    this.elBombTimer = this.root.querySelector('#hud-bombtimer')!;
    this.elHint = this.root.querySelector('#hud-hint')!;
    this.radar = new Radar();
    this.root.appendChild(this.radar.canvas);
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? '' : 'none';
  }

  showAnnounce(text: string, sub = ''): void {
    this.elAnnounce.textContent = text;
    this.elAnnounceSub.textContent = sub;
    this.announceUntil = performance.now() + 3000;
    this.elAnnounce.style.opacity = '1';
    this.elAnnounceSub.style.opacity = '1';
  }

  addFeed(killer: string | null, victim: string, weaponName: string, headshot: boolean): void {
    const color = headshot ? '#ff5a3c' : '#c9d1d9';
    const html = killer
      ? `<span class="killer">${killer}</span> ${headshot ? '☠' : '»'} <span class="victim">${victim}</span> <span class="weapon">[${weaponName}]</span>`
      : `<span class="victim">${victim}</span> <span class="weapon">[${weaponName}]</span>`;
    this.feedItems.push({ html: `<div style="color:${color}">${html}</div>`, until: performance.now() + 5000 });
    if (this.feedItems.length > 6) this.feedItems.shift();
    this.renderFeed();
  }

  private renderFeed(): void {
    this.elFeed.innerHTML = this.feedItems.map((f) => f.html).join('');
  }

  flashDamage(severity: number): void {
    this.flashUntil = performance.now() + 220;
    this.elFlash.style.opacity = String(Math.min(0.85, 0.25 + severity * 0.6));
  }

  setCrosshairSpread(radians: number, moving: boolean): void {
    const px = Math.min(46, 4 + radians * 900);
    const root = this.elCrosshair;
    root.style.setProperty('--gap', `${px}px`);
    root.style.opacity = moving ? '0.75' : '1';
  }

  setScope(zoomed: boolean): void {
    this.elScope.style.display = zoomed ? '' : 'none';
  }

  showDeathBanner(respawnNote: string): void {
    this.elAnnounce.textContent = 'ELIMINATED';
    this.elAnnounceSub.textContent = respawnNote;
    this.announceUntil = performance.now() + 4000;
  }

  update(match: Match, player: PlayerEntity, now: number): void {
    // Feed expiry.
    if (this.feedItems.some((f) => f.until < now)) {
      this.feedItems = this.feedItems.filter((f) => f.until >= now);
      this.renderFeed();
    }
    if (now > this.announceUntil) {
      this.elAnnounce.style.opacity = '0';
      this.elAnnounceSub.style.opacity = '0';
    }
    if (now > this.flashUntil) this.elFlash.style.opacity = '0';

    this.elHealth.textContent = String(player.health);
    this.elArmor.textContent = String(player.armor);
    this.elHealthBar.style.width = `${Math.max(0, player.health)}%`;
    this.elArmorBar.style.width = `${Math.max(0, player.armor)}%`;
    this.elMoney.textContent = `$${player.money}`;

    const weapon = player.activeWeapon();
    if (weapon) {
      const reloading = weapon.isReloading;
      this.elAmmo.textContent = reloading ? '— reloading —' : `${weapon.mag} / ${weapon.reserve}`;
      this.elWeapon.textContent = `${weapon.spec.displayName}${weapon.spec.fireModes.length > 1 ? ` · ${weapon.fireMode.toUpperCase()}` : ''}`;
    } else {
      this.elAmmo.textContent = '0 / 0';
      this.elWeapon.textContent = '';
    }

    const snap = match.roundSnapshot();
    if (match.training) {
      this.elTimer.textContent = 'TRAINING';
      this.elScore.textContent = 'Training Yard';
    } else {
      const phaseLabel = snap.phase === 'freeze' ? 'FREEZE' : snap.phase === 'end' ? 'ROUND END' : '';
      const t = Math.max(0, Math.ceil(snap.timer));
      const mm = Math.floor(t / 60);
      const ss = String(t % 60).padStart(2, '0');
      this.elTimer.textContent = snap.phase === 'end' ? `${phaseLabel}` : `${mm}:${ss} ${phaseLabel}`;
      this.elScore.textContent = `Raiders ${snap.score.attackers} : ${snap.score.defenders} Unit · Round ${snap.roundNumber}/${match.settings.maxRounds}`;
    }

    // Bomb timer while planted.
    if (match.bomb.state === 'planted' || match.bomb.state === 'defusing') {
      const t = Math.max(0, match.bomb.timer);
      const urgency = t < round.bombBeepStartSec;
      this.elBombTimer.textContent = match.bomb.state === 'defusing' ? 'DEFUSING…' : `◉ ${t.toFixed(1)}`;
      this.elBombTimer.className = urgency ? 'urgent' : '';
    } else {
      this.elBombTimer.textContent = '';
    }

    // Buy hint.
    const ctx = match.buyContextFor(player);
    const inBuy = ctx.inBuyZone && ctx.buyTimeActive && player.alive;
    this.elHint.textContent = inBuy ? 'Press [B] to open the buy menu' : '';

    this.radar.draw(match, player);
  }

  showRoundEnd(winner: string, reason: string): void {
    const title = winner === 'attackers' ? 'RAIDERS WIN' : winner === 'defenders' ? 'RESPONSE UNIT WIN' : 'DRAW';
    const reasons: Record<string, string> = {
      bomb_detonated: 'The bomb detonated',
      bomb_defused: 'The bomb was defused',
      attackers_eliminated: 'All raiders eliminated',
      defenders_eliminated: 'All response units eliminated',
      timeout: 'Round time expired',
    };
    this.showAnnounce(title, reasons[reason] ?? reason);
  }

  teamLabel(team: string): string {
    return labelOf(team as 'attackers' | 'defenders' | 'spectator');
  }
}
