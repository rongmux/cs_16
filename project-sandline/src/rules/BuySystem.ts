// Buy system: enforces buy zone, buy time, team restriction, money, inventory
// slots, armor/helmet, defuse kit and grenade limits (design doc 15.2).
// No UI knowledge - the menu calls these functions.

import { economy } from '../world/DataFiles';
import type { PlayerEntity } from '../player/PlayerEntity';
import type { WeaponRegistry } from '../weapons/WeaponRegistry';

export interface BuyContext {
  inBuyZone: boolean;
  buyTimeActive: boolean;
  /** Round is in freeze/live phase where buying is allowed. */
  buyingAllowed: boolean;
}

export type BuyItemId = string | 'vest' | 'vesthelm' | 'defusekit' | 'ammo_primary' | 'ammo_secondary';

export interface BuyResult {
  ok: boolean;
  reason?: string;
}

export interface EquipmentPrices {
  vest: number;
  vestHelm: number;
  defuseKit: number;
  ammoPrimary: number;
  ammoSecondary: number;
  grenadeLimits: Record<string, number>;
}

export const EQUIPMENT: EquipmentPrices = {
  vest: 650,
  vestHelm: 1000,
  defuseKit: 400,
  ammoPrimary: 300,
  ammoSecondary: 150,
  grenadeLimits: { grenade_frag: 1 },
};

export class BuySystem {
  constructor(private registry: WeaponRegistry) {}

  private checkBase(player: PlayerEntity, ctx: BuyContext): BuyResult {
    if (!ctx.buyingAllowed) return { ok: false, reason: 'Buying is not allowed right now' };
    if (!ctx.buyTimeActive) return { ok: false, reason: 'Buy time has ended' };
    if (!ctx.inBuyZone) return { ok: false, reason: 'You must be in a buy zone' };
    if (!player.alive) return { ok: false, reason: 'Dead players cannot buy' };
    if (player.team !== 'attackers' && player.team !== 'defenders') {
      return { ok: false, reason: 'Spectators cannot buy' };
    }
    return { ok: true };
  }

  canBuy(player: PlayerEntity, itemId: BuyItemId, ctx: BuyContext): BuyResult {
    const base = this.checkBase(player, ctx);
    if (!base.ok) return base;

    if (itemId === 'vest') {
      if (player.money < EQUIPMENT.vest) return { ok: false, reason: 'Not enough money' };
      if (player.armor >= 100 && player.helmet === false) return { ok: false, reason: 'Already have armor' };
      return { ok: true };
    }
    if (itemId === 'vesthelm') {
      if (player.money < EQUIPMENT.vestHelm) return { ok: false, reason: 'Not enough money' };
      if (player.armor >= 100 && player.helmet) return { ok: false, reason: 'Already have armor + helmet' };
      return { ok: true };
    }
    if (itemId === 'defusekit') {
      if (player.team !== 'defenders') return { ok: false, reason: 'Defenders only' };
      if (player.money < EQUIPMENT.defuseKit) return { ok: false, reason: 'Not enough money' };
      if (player.inventory.defuseKit) return { ok: false, reason: 'Already have a defuse kit' };
      return { ok: true };
    }
    if (itemId === 'ammo_primary' || itemId === 'ammo_secondary') {
      const price = itemId === 'ammo_primary' ? EQUIPMENT.ammoPrimary : EQUIPMENT.ammoSecondary;
      if (player.money < price) return { ok: false, reason: 'Not enough money' };
      const slot = itemId === 'ammo_primary' ? 'primary' : 'secondary';
      const wid = slot === 'primary' ? player.inventory.primary : player.inventory.secondary;
      if (!wid) return { ok: false, reason: 'No weapon in that slot' };
      return { ok: true };
    }

    // Weapon purchase.
    const spec = this.registry.get(itemId);
    if (!spec.buyable) return { ok: false, reason: 'This item cannot be bought' };
    if (spec.teamRestriction && spec.teamRestriction !== player.team) {
      return { ok: false, reason: 'Not available for your team' };
    }
    if (player.money < spec.price) return { ok: false, reason: 'Not enough money' };
    if (spec.slot === 'grenade') {
      const limit = EQUIPMENT.grenadeLimits[spec.id] ?? 1;
      if (player.grenadeCount(spec.id) >= limit) return { ok: false, reason: 'Grenade limit reached' };
    }
    return { ok: true };
  }

  buy(player: PlayerEntity, itemId: BuyItemId, ctx: BuyContext): BuyResult {
    const check = this.canBuy(player, itemId, ctx);
    if (!check.ok) return check;

    if (itemId === 'vest') {
      player.money -= EQUIPMENT.vest;
      player.armor = 100;
      return { ok: true };
    }
    if (itemId === 'vesthelm') {
      player.money -= EQUIPMENT.vestHelm;
      player.armor = 100;
      player.helmet = true;
      return { ok: true };
    }
    if (itemId === 'defusekit') {
      player.money -= EQUIPMENT.defuseKit;
      player.inventory.defuseKit = true;
      return { ok: true };
    }
    if (itemId === 'ammo_primary' || itemId === 'ammo_secondary') {
      const price = itemId === 'ammo_primary' ? EQUIPMENT.ammoPrimary : EQUIPMENT.ammoSecondary;
      player.money -= price;
      const wid =
        itemId === 'ammo_primary' ? player.inventory.primary : player.inventory.secondary;
      if (wid) {
        const inst = player.weapons.get(wid);
        if (inst) inst.reserve = inst.spec.reserveAmmoMax;
      }
      return { ok: true };
    }

    const spec = this.registry.get(itemId);
    player.money -= spec.price;
    if (spec.slot === 'grenade') {
      player.addGrenade(spec.id);
      return { ok: true };
    }
    player.giveWeapon(spec.id, true);
    return { ok: true };
  }

  /** Start money for a fresh match. */
  startMoney(): number {
    return economy.startMoney;
  }
}
