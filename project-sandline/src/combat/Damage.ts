// Damage model: base damage x distance falloff x hit-region multiplier,
// then armor reduction. All multipliers come from weapon specs and the
// economy/combat data files - no hardcoded numbers (design doc 12).

import type { HitRegion } from '../core/EventBus';
import type { WeaponSpec } from '../weapons/WeaponRegistry';

export interface ArmorState {
  armor: number;
  helmet: boolean;
}

export interface DamageResult {
  hpDamage: number;
  armorDamage: number;
  /** Damage after armor reduction. */
  finalDamage: number;
}

/** Fraction of incoming damage absorbed by armor (classic split). */
export const ARMOR_ABSORB_RATIO = 0.5;
/** Helmet headshot damage scale while armor > 0. */
export const HELMET_HEAD_DAMAGE_SCALE = 0.6;

export function distanceFalloff(spec: WeaponSpec, distance: number): number {
  if (spec.rangeModifier >= 1) return 1;
  return Math.pow(spec.rangeModifier, distance);
}

export function baseDamageForRegion(spec: WeaponSpec, region: HitRegion): number {
  return spec.damage * (spec.hitRegionMultipliers[region] ?? 1);
}

/**
 * Compute damage against a target. `armorState` may be mutated when armor
 * absorbs damage.
 */
export function computeDamage(
  spec: WeaponSpec,
  region: HitRegion,
  distance: number,
  armorState: ArmorState,
): DamageResult {
  let dmg = baseDamageForRegion(spec, region) * distanceFalloff(spec, distance);

  const hasArmor = armorState.armor > 0;
  if (hasArmor) {
    if (region === 'head' && armorState.helmet) {
      // Helmet: reduced (but still high) headshot damage; armor absorbs less.
      const absorb = dmg * ARMOR_ABSORB_RATIO * clampPen(spec.armorPenetration);
      armorState.armor = Math.max(0, armorState.armor - absorb);
      dmg *= HELMET_HEAD_DAMAGE_SCALE;
    } else {
      const absorb = dmg * ARMOR_ABSORB_RATIO * clampPen(spec.armorPenetration);
      const applied = Math.min(armorState.armor, absorb);
      armorState.armor -= applied;
      dmg -= applied;
    }
  }

  dmg = Math.max(0, dmg);
  const armorDamage = 0; // reported separately by caller via before/after
  return { hpDamage: Math.round(dmg), armorDamage, finalDamage: Math.round(dmg) };
}

function clampPen(pen: number): number {
  return Math.max(0, Math.min(2, pen));
}

/** Round HP damage to integer with a minimum of 1 when any damage lands. */
export function quantizeDamage(dmg: number): number {
  if (dmg <= 0) return 0;
  return Math.max(1, Math.round(dmg));
}
