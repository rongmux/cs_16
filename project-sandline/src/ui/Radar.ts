// Top-left schematic radar (design doc 66): self, teammates, objective and
// site markers only. North-up, drawn on 2D canvas from live match state.

import { Match } from '../sim/Match';
import { PlayerEntity } from '../player/PlayerEntity';

export class Radar {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly size = 168;
  private lastDrawn = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'radar';
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = this.canvas.getContext('2d')!;
  }

  draw(match: Match, player: PlayerEntity): void {
    const now = performance.now();
    if (now - this.lastDrawn < 66) return; // ~15Hz is plenty for a radar
    this.lastDrawn = now;
    const ctx = this.ctx;
    const bounds = match.mapData.radarBounds;
    const w = bounds[0];
    const d = bounds[1];
    const scale = this.size / Math.max(w, d);

    ctx.clearRect(0, 0, this.size, this.size);
    ctx.fillStyle = 'rgba(10, 14, 18, 0.72)';
    ctx.fillRect(0, 0, this.size, this.size);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(0.5, 0.5, this.size - 1, this.size - 1);

    const toScreen = (x: number, z: number): [number, number] => {
      const sx = this.size / 2 + x * scale;
      const sy = this.size / 2 + z * scale;
      return [sx, sy];
    };

    // Bomb sites.
    for (const site of match.mapData.bombSites) {
      const [sx, sy] = toScreen(site.center[0], site.center[1]);
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(5, site.radius * scale), 0, Math.PI * 2);
      ctx.strokeStyle = '#e8a33d';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#e8a33d';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(site.label, sx, sy + 3);
    }

    // Teammates (and self).
    for (const p of match.players()) {
      if (!p.alive) continue;
      if (p.team !== player.team) continue;
      const [sx, sy] = toScreen(p.pos.x, p.pos.z);
      const isSelf = p.id === player.id;
      ctx.beginPath();
      ctx.arc(sx, sy, isSelf ? 4 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isSelf ? '#ffffff' : p.team === 'attackers' ? '#d98e3a' : '#4f9de0';
      ctx.fill();
    }

    // Bomb.
    const bomb = match.bomb;
    if (bomb.state !== 'dropped' || bomb.pos.y > -50) {
      if (bomb.state === 'planted' || bomb.state === 'defusing' || bomb.state === 'dropped') {
        const [sx, sy] = toScreen(bomb.pos.x, bomb.pos.z);
        ctx.fillStyle = '#ff3b30';
        ctx.fillRect(sx - 3, sy - 3, 6, 6);
        if (bomb.state !== 'dropped') {
          ctx.beginPath();
          ctx.arc(sx, sy, 8, 0, Math.PI * 2);
          ctx.strokeStyle = '#ff3b30';
          ctx.stroke();
        }
      }
    }
  }
}
