// Economy: pure money math against data/economy/economy.json (the locked
// reference rule version v1). No UI, no weapon/entity access (design doc 15).

import { economy, EconomyParams } from '../world/DataFiles';

export type EconomyEventType =
  | 'ROUND_WIN'
  | 'ROUND_LOSS'
  | 'KILL'
  | 'BOMB_PLANT'
  | 'BOMB_DEFUSE'
  | 'TEAM_DAMAGE_PENALTY'
  | 'TEAM_KILL_PENALTY';

export interface EconomyEvent {
  type: EconomyEventType;
  /** Kill reward amount (from the weapon spec) for KILL events. */
  amount?: number;
}

export class Economy {
  readonly params: EconomyParams;

  constructor(params: EconomyParams = economy) {
    this.params = params;
  }

  clamp(money: number): number {
    return Math.max(0, Math.min(this.params.maxMoney, Math.round(money)));
  }

  lossRewardForStreak(streak: number): number {
    const p = this.params;
    return Math.min(p.lossRewardBase + p.lossRewardPerStreak * Math.max(0, streak), p.lossRewardCap);
  }

  /** Apply one event to a money amount. Loss streaks are tracked by the caller. */
  apply(money: number, event: EconomyEvent, lossStreak = 0): number {
    const p = this.params;
    switch (event.type) {
      case 'ROUND_WIN':
        return this.clamp(money + p.winReward);
      case 'ROUND_LOSS':
        return this.clamp(money + this.lossRewardForStreak(lossStreak));
      case 'KILL':
        return this.clamp(money + (event.amount ?? 0));
      case 'BOMB_PLANT':
        return this.clamp(money + p.bombPlantReward);
      case 'BOMB_DEFUSE':
        return this.clamp(money + p.bombDefuseReward);
      case 'TEAM_DAMAGE_PENALTY':
        return this.clamp(money - p.teamDamagePenaltyPerHp * (event.amount ?? 0));
      case 'TEAM_KILL_PENALTY':
        return this.clamp(money - p.teamKillPenalty);
      default:
        return money;
    }
  }

  startMoney(): number {
    return this.params.startMoney;
  }
}
