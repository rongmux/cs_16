// Buy menu: team-specific weapon/equipment grid, buy zone + buy time gated,
// money display, number hotkeys (design doc 15.3 / 28).

import { Match } from '../sim/Match';
import { PlayerEntity } from '../player/PlayerEntity';
import { EQUIPMENT } from '../rules/BuySystem';

export interface BuyMenuCallbacks {
  onBuy: (itemId: string) => void;
  onClose: () => void;
}

export class BuyMenu {
  root: HTMLElement;
  private grid: HTMLElement;
  private moneyEl: HTMLElement;
  private visible = false;
  private lastPlayer: PlayerEntity | null = null;
  private lastMatch: Match | null = null;

  constructor(private callbacks: BuyMenuCallbacks) {
    this.root = document.createElement('div');
    this.root.id = 'buymenu';
    this.root.style.display = 'none';
    this.root.innerHTML = `
      <div class="buy-panel">
        <div class="buy-header"><span>BUY MENU</span><span id="buy-money">$0</span></div>
        <div id="buy-grid"></div>
        <div class="buy-footer"><span>Click or press 1-9 to buy</span><button id="buy-close">Resume [B]</button></div>
      </div>
    `;
    this.grid = this.root.querySelector('#buy-grid')!;
    this.moneyEl = this.root.querySelector('#buy-money')!;
    this.root.querySelector('#buy-close')!.addEventListener('click', () => this.callbacks.onClose());
  }

  get isVisible(): boolean {
    return this.visible;
  }

  toggle(match: Match, player: PlayerEntity): void {
    if (this.visible) this.close();
    else this.open(match, player);
  }

  open(match: Match, player: PlayerEntity): void {
    this.visible = true;
    this.lastMatch = match;
    this.lastPlayer = player;
    this.root.style.display = '';
    this.rebuild(match, player);
  }

  close(): void {
    this.visible = false;
    this.root.style.display = 'none';
    this.lastMatch = null;
    this.lastPlayer = null;
  }

  rebuild(match: Match, player: PlayerEntity): void {
    this.moneyEl.textContent = `$${player.money}`;
    this.grid.innerHTML = '';
    const items: { id: string; label: string; price: number; note?: string }[] = [];

    const team = player.team === 'attackers' ? 'attackers' : 'defenders';
    const bySlot: { title: string; list: { id: string; label: string; price: number; note?: string }[] }[] = [
      { title: 'PRIMARY', list: [] },
      { title: 'SECONDARY', list: [] },
      { title: 'GRENADES', list: [] },
      { title: 'EQUIPMENT', list: [] },
    ];
    for (const spec of match.registry.buyableForTeam(team)) {
      const item = { id: spec.id, label: spec.displayName, price: spec.price };
      if (spec.slot === 'primary') bySlot[0].list.push(item);
      else if (spec.slot === 'secondary') bySlot[1].list.push(item);
      else if (spec.slot === 'grenade') bySlot[2].list.push(item);
    }
    bySlot[3].list.push({ id: 'vest', label: 'Armor Vest', price: EQUIPMENT.vest });
    bySlot[3].list.push({ id: 'vesthelm', label: 'Vest + Helmet', price: EQUIPMENT.vestHelm });
    if (player.team === 'defenders') {
      bySlot[3].list.push({ id: 'defusekit', label: 'Defuse Kit', price: EQUIPMENT.defuseKit });
    }
    bySlot[3].list.push({ id: 'ammo_primary', label: 'Primary Ammo', price: EQUIPMENT.ammoPrimary });
    bySlot[3].list.push({ id: 'ammo_secondary', label: 'Secondary Ammo', price: EQUIPMENT.ammoSecondary });

    for (const section of bySlot) {
      if (section.list.length === 0) continue;
      const title = document.createElement('div');
      title.className = 'buy-section-title';
      title.textContent = section.title;
      this.grid.appendChild(title);
      for (const item of section.list) {
        const btn = document.createElement('button');
        btn.className = 'buy-item';
        const affordable = player.money >= item.price;
        btn.disabled = !affordable;
        btn.innerHTML = `<span class="buy-name">${item.label}</span><span class="buy-price">$${item.price}</span>`;
        btn.addEventListener('click', () => this.callbacks.onBuy(item.id));
        this.grid.appendChild(btn);
      }
    }
    void items;
  }

  refresh(match: Match, player: PlayerEntity): void {
    if (!this.visible) return;
    this.moneyEl.textContent = `$${player.money}`;
    // Cheap rebuild each refresh frame is fine for the MVP menu.
    this.rebuild(match, player);
  }
}
