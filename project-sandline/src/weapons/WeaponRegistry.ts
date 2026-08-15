// Weapon registry: loads specs from data/weapons/weapons.json and merges
// defaults so the JSON stays compact. Data-driven - no hardcoded per-weapon
// numbers anywhere else (design doc 6.1, 11).

import { weaponSpecs } from '../world/DataFiles';
import type { HitRegion, WeaponSlotId } from '../core/EventBus';

export type FireMode = 'semi' | 'auto' | 'burst';

export interface RecoilProfile {
  verticalRise: number;
  horizontalRange: number;
  recoveryDegPerSec: number;
  spreadGrowth: number;
  spreadDecayPerSec: number;
  maxSpread: number;
}

export interface WeaponSpec {
  id: string;
  category: string;
  displayName: string;
  slot: WeaponSlotId;
  price: number;
  buyable: boolean;
  teamRestriction?: 'attackers' | 'defenders';
  startEquip?: 'attackers' | 'defenders' | 'both';
  magazineSize: number;
  reserveAmmoMax: number;
  damage: number;
  pellets: number;
  rangeModifier: number;
  hitRegionMultipliers: Record<HitRegion, number>;
  armorPenetration: number;
  fireIntervalMs: number;
  reloadMs: number;
  drawMs: number;
  maxMoveSpeed: number;
  baseSpread: number;
  movementSpread: number;
  airSpread: number;
  crouchSpreadScale: number;
  jumpSpread: number;
  zoomLevels: number[];
  zoomSpreadScale: number;
  recoil: RecoilProfile;
  fireModes: FireMode[];
  burstCount: number;
  penetrationPower: number;
  penetrationDamageRetention: number;
  killReward: number;
  loudness: number;
  meleeRange: number;
  throwable: boolean;
  grenadeRadius: number;
  grenadeFuseSec: number;
}

const DEFAULT_SPEC: WeaponSpec = {
  id: '',
  category: 'unknown',
  displayName: 'Unknown',
  slot: 'primary',
  price: 0,
  buyable: false,
  magazineSize: 1,
  reserveAmmoMax: 0,
  damage: 10,
  pellets: 1,
  rangeModifier: 1.0,
  hitRegionMultipliers: { head: 1.0, chest: 1.0, stomach: 1.0, arm: 1.0, leg: 1.0 },
  armorPenetration: 1.0,
  fireIntervalMs: 200,
  reloadMs: 2000,
  drawMs: 600,
  maxMoveSpeed: 4.55,
  baseSpread: 0.01,
  movementSpread: 0.02,
  airSpread: 0.08,
  crouchSpreadScale: 0.6,
  jumpSpread: 0.3,
  zoomLevels: [1],
  zoomSpreadScale: 1,
  recoil: {
    verticalRise: 0.5,
    horizontalRange: 0.3,
    recoveryDegPerSec: 8,
    spreadGrowth: 0.003,
    spreadDecayPerSec: 2,
    maxSpread: 0.05,
  },
  fireModes: ['semi'],
  burstCount: 3,
  penetrationPower: 0,
  penetrationDamageRetention: 0,
  killReward: 0,
  loudness: 1,
  meleeRange: 1.9,
  throwable: false,
  grenadeRadius: 0,
  grenadeFuseSec: 0,
};

interface RawWeapon {
  id: string;
  [key: string]: unknown;
}

interface RawWeaponsFile {
  weapons: RawWeapon[];
}

export class WeaponRegistry {
  private specs = new Map<string, WeaponSpec>();

  constructor(raw?: RawWeaponsFile) {
    const file = raw ?? (weaponSpecs as unknown as RawWeaponsFile);
    for (const w of file.weapons) {
      const spec: WeaponSpec = {
        ...DEFAULT_SPEC,
        ...(w as unknown as Partial<WeaponSpec>),
        hitRegionMultipliers: {
          ...DEFAULT_SPEC.hitRegionMultipliers,
          ...((w.hitRegionMultipliers as Partial<Record<HitRegion, number>>) ?? {}),
        },
        recoil: {
          ...DEFAULT_SPEC.recoil,
          ...((w.recoil as Partial<RecoilProfile>) ?? {}),
        },
      };
      this.specs.set(spec.id, spec);
    }
  }

  get(id: string): WeaponSpec {
    const spec = this.specs.get(id);
    if (!spec) throw new Error(`Unknown weapon id: ${id}`);
    return spec;
  }

  has(id: string): boolean {
    return this.specs.has(id);
  }

  all(): WeaponSpec[] {
    return [...this.specs.values()];
  }

  /** Weapons a player of the given team may buy, grouped by slot. */
  buyableForTeam(team: 'attackers' | 'defenders'): WeaponSpec[] {
    return this.all().filter(
      (s) => s.buyable && (!s.teamRestriction || s.teamRestriction === team),
    );
  }

  /** The weapon a team member receives at spawn. */
  startPistol(team: 'attackers' | 'defenders'): WeaponSpec {
    const id = team === 'attackers' ? 'pistol_attacker_start' : 'pistol_defender_start';
    return this.get(id);
  }
}
