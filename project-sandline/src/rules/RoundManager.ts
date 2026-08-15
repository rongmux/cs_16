// RoundManager: the single authority over round phases and round endings
// (design doc 7). No other module may start a round, end a round, award
// round money or switch sides. Elimination + timeout + objective outcomes
// with the classic planted-bomb priority (design doc 16.3).

import type { EventBus, TeamId } from '../core/EventBus';
import { round, RoundParams } from '../world/DataFiles';
import type { PlayerEntity } from '../player/PlayerEntity';
import type { BombObjective } from '../objectives/BombObjective';
import { Economy } from './Economy';

export type RoundPhase = 'freeze' | 'live' | 'end' | 'match_end';

export interface RoundSnapshot {
  phase: RoundPhase;
  roundNumber: number;
  /** Seconds remaining in the current phase. */
  timer: number;
  winner: TeamId | null;
  reason: string;
  score: { attackers: number; defenders: number };
  /** True while the bomb is planted and the round timer no longer applies. */
  bombActive: boolean;
  lossStreaks: { attackers: number; defenders: number };
  /** Round number when teams switch (0-based, exclusive). */
  sideSwitchRound: number;
}

export interface RoundHost {
  players(): PlayerEntity[];
  bomb: BombObjective;
  eventBus: EventBus;
  economy: Economy;
  /** Spawn/reset all players for a new round (match implementation). */
  spawnPlayers(): void;
  /** Assign the bomb to a random attacker. */
  assignBomb(): void;
  /** Team side switch at half time. */
  switchSides(): void;
  /** Award objective money to one player (plant/defuse bonuses happen on event). */
  awardPlayer(playerId: number, event: 'BOMB_PLANT' | 'BOMB_DEFUSE'): void;
  /** Called once when the match ends. */
  onMatchEnd(winner: TeamId): void;
  /** Freeze state of one player (movement/fire blocked). */
  setPlayerFrozen(playerId: number, frozen: boolean): void;
}

export class RoundManager {
  phase: RoundPhase = 'freeze';
  roundNumber = 0;
  timer = 0;
  winner: TeamId | null = null;
  reason = '';
  score = { attackers: 0, defenders: 0 };
  lossStreaks = { attackers: 0, defenders: 0 };
  bombActive = false;
  private ended = false;
  private freezeElapsed = 0;
  private roundElapsed = 0;

  constructor(private params: RoundParams = round) {}

  get sideSwitchRound(): number {
    return this.params.sideSwitchAtRound;
  }

  snapshot(): RoundSnapshot {
    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      timer: this.timer,
      winner: this.winner,
      reason: this.reason,
      score: { ...this.score },
      bombActive: this.bombActive,
      lossStreaks: { ...this.lossStreaks },
      sideSwitchRound: this.sideSwitchRound,
    };
  }

  startRound(host: RoundHost): void {
    this.phase = 'freeze';
    this.timer = this.params.freezeTimeSec;
    this.freezeElapsed = 0;
    this.roundElapsed = 0;
    this.winner = null;
    this.reason = '';
    this.ended = false;
    this.bombActive = false;
    this.roundNumber++;
    host.spawnPlayers();
    host.assignBomb();
    host.eventBus.emit('round_start', { round: this.roundNumber });
  }

  /** Buying allowed from round start until buy time runs out (live included). */
  buyingAllowed(): boolean {
    if (this.phase !== 'freeze' && this.phase !== 'live') return false;
    return this.roundElapsed < this.params.buyTimeSec;
  }

  /** Players frozen during anything but the live phase. */
  get frozen(): boolean {
    return this.phase !== 'live';
  }

  /** Dev / pause-menu restart: reset the current round without incrementing. */
  restartRound(host: RoundHost): void {
    this.phase = 'freeze';
    this.timer = this.params.freezeTimeSec;
    this.freezeElapsed = 0;
    this.roundElapsed = 0;
    this.winner = null;
    this.reason = '';
    this.ended = false;
    this.bombActive = false;
    host.spawnPlayers();
    host.assignBomb();
    host.eventBus.emit('round_start', { round: this.roundNumber });
  }

  notifyDeath(victim: PlayerEntity, host: RoundHost): void {
    if (this.phase !== 'live' && this.phase !== 'freeze') return;
    if (this.ended) return;
    this.evaluate(host);
  }

  /** Bomb planted: the round timer stops being a factor (design doc 16.3). */
  notifyBombPlanted(): void {
    this.bombActive = true;
  }

  /** Bomb resolved while planted: defenders defused, attackers detonated. */
  notifyBombResolved(host: RoundHost): void {
    if (this.ended) return;
    if (host.bomb.state === 'defused') {
      this.endRound('defenders', 'bomb_defused', host);
    } else if (host.bomb.state === 'detonated') {
      this.endRound('attackers', 'bomb_detonated', host);
    }
  }

  update(dt: number, host: RoundHost): void {
    this.roundElapsed += dt;
    switch (this.phase) {
      case 'freeze': {
        this.freezeElapsed += dt;
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = 'live';
          this.timer = this.params.roundTimeSec;
          host.eventBus.emit('round_live', { round: this.roundNumber, timeSec: this.params.roundTimeSec });
        }
        // Elimination during freeze is not possible; skip.
        break;
      }
      case 'live': {
        this.evaluate(host);
        if (this.phase !== 'live') break;
        if (!this.bombActive) {
          this.timer -= dt;
          if (this.timer <= 0) {
            // Timeout: defenders win, unless the bomb is still ticking.
            this.endRound('defenders', 'timeout', host);
          }
        }
        break;
      }
      case 'end': {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.nextRound(host);
        }
        break;
      }
      case 'match_end':
        break;
    }
  }

  private evaluate(host: RoundHost): void {
    if (this.ended || this.phase !== 'live') return;
    const players = host.players().filter((p) => p.team === 'attackers' || p.team === 'defenders');
    const attackersAlive = players.some((p) => p.team === 'attackers' && p.alive);
    const defendersAlive = players.some((p) => p.team === 'defenders' && p.alive);

    // Planted bomb: elimination does not cancel the bomb outcome.
    if (host.bomb.state === 'detonated') {
      this.endRound('attackers', 'bomb_detonated', host);
      return;
    }
    if (host.bomb.state === 'defused') {
      this.endRound('defenders', 'bomb_defused', host);
      return;
    }
    if (host.bomb.state === 'planted' || host.bomb.state === 'defusing') {
      return;
    }
    if (!attackersAlive) {
      this.endRound('defenders', 'attackers_eliminated', host);
    } else if (!defendersAlive) {
      this.endRound('attackers', 'defenders_eliminated', host);
    }
  }

  endRound(winner: TeamId, reason: string, host: RoundHost): void {
    if (this.ended) return; // guard against double round end (design doc 56)
    if (this.phase === 'end' || this.phase === 'match_end') return;
    this.ended = true;
    this.phase = 'end';
    this.winner = winner;
    this.reason = reason;
    this.timer = this.params.roundEndDelaySec;
    this.bombActive = false;
    if (winner === 'attackers') this.score.attackers++;
    else if (winner === 'defenders') this.score.defenders++;

    // Economy awards: win reward or escalating loss bonus (design doc 15).
    const players = host.players();
    for (const p of players) {
      if (p.team !== 'attackers' && p.team !== 'defenders') continue;
      if (p.team === winner) {
        p.money = host.economy.apply(p.money, { type: 'ROUND_WIN' });
        p.lossStreak = 0;
      } else {
        this.lossStreaks[p.team]++;
        p.lossStreak = this.lossStreaks[p.team];
        p.money = host.economy.apply(p.money, { type: 'ROUND_LOSS' }, p.lossStreak - 1);
      }
    }
    if (winner === 'attackers' || winner === 'defenders') {
      this.lossStreaks[winner] = 0;
    }

    host.eventBus.emit('round_end', { round: this.roundNumber, winner, reason });
  }

  private nextRound(host: RoundHost): void {
    const maxRounds = this.params.maxRounds;
    const firstTo = Math.floor(maxRounds / 2) + 1;
    const maxScore = Math.max(this.score.attackers, this.score.defenders);
    if (maxScore >= firstTo || this.roundNumber >= maxRounds) {
      this.phase = 'match_end';
      const winner: TeamId =
        this.score.attackers === this.score.defenders
          ? 'spectator'
          : this.score.attackers > this.score.defenders
            ? 'attackers'
            : 'defenders';
      host.eventBus.emit('match_end', {
        winner,
        score: [this.score.attackers, this.score.defenders],
      });
      host.onMatchEnd(winner);
      return;
    }
    if (this.roundNumber === this.sideSwitchRound) {
      host.switchSides();
      host.eventBus.emit('announce', { text: 'Teams are switching sides' });
    }
    this.startRound(host);
  }
}
