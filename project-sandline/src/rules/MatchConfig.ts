// Match configuration: everything the main menu can set, persisted to
// localStorage (design doc 54).

import type { TeamId } from '../core/EventBus';
import { round } from '../world/DataFiles';

export interface MatchSettings {
  mapId: string;
  humanTeam: TeamId;
  botCount: number;
  botDifficulty: string;
  matchSeed: number;
  maxRounds: number;
  /** Comma separated attacker/defender bot counts, e.g. "5/4". */
  botSplit: string;
}

export const DEFAULT_SETTINGS: MatchSettings = {
  mapId: 'map_sandline',
  humanTeam: 'defenders',
  botCount: 9,
  botDifficulty: 'normal',
  matchSeed: 0, // 0 = random each match
  maxRounds: round.maxRounds,
  botSplit: '',
};

export function resolveBotSplit(settings: MatchSettings): { attackers: number; defenders: number } {
  if (settings.botSplit) {
    const [a, d] = settings.botSplit.split('/').map((n) => parseInt(n, 10) || 0);
    if (a + d === settings.botCount) return { attackers: a, defenders: d };
  }
  // Default: the human's team gets one fewer bot so teams are equal size.
  const attackers = Math.floor(settings.botCount / 2);
  const defenders = settings.botCount - attackers;
  if (settings.humanTeam === 'attackers') return { attackers, defenders };
  return { attackers, defenders };
}

export function clampBotCount(n: number): number {
  return Math.max(0, Math.min(15, Math.floor(n)));
}
