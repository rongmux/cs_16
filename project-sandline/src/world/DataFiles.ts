// Data loader for JSON data files. All game rules read from data/* so nothing
// is hardcoded (design doc 6.1). In the browser the data is imported through
// Vite's JSON support; headless (node/vitest) uses the same import mechanism.

import movementRaw from '../../data/game/movement.json';
import roundRaw from '../../data/game/round.json';
import economyRaw from '../../data/economy/economy.json';
import difficultyRaw from '../../data/bots/difficulty.json';
import materialsRaw from '../../data/game/materials.json';
import weaponsRaw from '../../data/weapons/weapons.json';
import mapSandlineRaw from '../../data/maps/map_sandline.json';
import mapTrainingRaw from '../../data/maps/map_training_yard.json';
import type { MapData } from './MapData';

export interface MovementParams {
  gravity: number;
  groundAcceleration: number;
  airAcceleration: number;
  groundFriction: number;
  stopSpeed: number;
  walkSpeed: number;
  runSpeed: number;
  crouchSpeedScale: number;
  jumpImpulse: number;
  maxAirSpeed: number;
  stepHeight: number;
  capsuleRadius: number;
  standingHeight: number;
  crouchingHeight: number;
  eyeHeightStand: number;
  eyeHeightCrouch: number;
  skinWidth: number;
}

export interface RoundParams {
  freezeTimeSec: number;
  buyTimeSec: number;
  roundTimeSec: number;
  roundEndDelaySec: number;
  bombPlantTimeSec: number;
  bombDefuseTimeSec: number;
  bombDefuseKitTimeSec: number;
  bombTimerSec: number;
  bombRadius: number;
  bombDamage: number;
  bombBeepStartSec: number;
  maxRounds: number;
  sideSwitchAtRound: number;
}

export interface EconomyParams {
  startMoney: number;
  maxMoney: number;
  winReward: number;
  lossRewardBase: number;
  lossRewardPerStreak: number;
  lossRewardCap: number;
  bombPlantReward: number;
  bombDefuseReward: number;
  teamKillPenalty: number;
  teamDamagePenaltyPerHp: number;
}

export interface DifficultyParams {
  label: string;
  reactionMsMin: number;
  reactionMsMax: number;
  aimNoiseDeg: number;
  trackingLag: number;
  turnSpeedDegPerSec: number;
  burstMsMin: number;
  burstMsMax: number;
  burstPauseMsMin: number;
  burstPauseMsMax: number;
  visionHz: number;
  combatHz: number;
  tacticalHz: number;
  hearingScale: number;
  strafeChance: number;
  crouchChance: number;
  recoilCompensation: number;
  aimTargetPreference: 'head' | 'chest';
  grenadeChance: number;
}

export interface MaterialDef {
  penetrationResistance: number;
  footstepLoudness: number;
}

export const movement: MovementParams = movementRaw;
export const round: RoundParams = roundRaw;
export const economy: EconomyParams = economyRaw;
export const difficulties: Record<string, DifficultyParams> = Object.fromEntries(
  Object.entries(difficultyRaw).filter(([k]) => k !== '_comment'),
) as Record<string, DifficultyParams>;
export const materials: Record<string, MaterialDef> = Object.fromEntries(
  Object.entries(materialsRaw).filter(([k]) => k !== '_comment'),
) as Record<string, MaterialDef>;
export const weaponSpecs = weaponsRaw;
export const difficultyIds: string[] = Object.keys(difficulties);

export const mapCatalog: { id: string; name: string; mode: string }[] = [
  { id: 'map_sandline', name: 'Sandline', mode: 'bomb' },
  { id: 'map_training_yard', name: 'Training Yard', mode: 'training' },
];

export function getMapData(id: string): MapData {
  if (id === 'map_sandline') return mapSandlineRaw as unknown as MapData;
  if (id === 'map_training_yard') return mapTrainingRaw as unknown as MapData;
  throw new Error(`Unknown map id: ${id}`);
}
