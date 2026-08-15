// Team helpers. Original faction naming for the release build (design doc 8):
// attackers -> "Raiders", defenders -> "Response Unit".

import type { TeamId } from '../core/EventBus';

export const TEAM_LABELS: Record<TeamId, string> = {
  attackers: 'Raiders',
  defenders: 'Response Unit',
  spectator: 'Spectator',
};

export function enemyOf(team: TeamId): TeamId {
  if (team === 'attackers') return 'defenders';
  if (team === 'defenders') return 'attackers';
  return 'spectator';
}

export function isCombatTeam(team: TeamId): team is 'attackers' | 'defenders' {
  return team === 'attackers' || team === 'defenders';
}

export function labelOf(team: TeamId): string {
  return TEAM_LABELS[team];
}
