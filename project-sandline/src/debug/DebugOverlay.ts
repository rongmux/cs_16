// Debug overlay state + text lines (design doc 32). The three.js helper
// visuals (collision wireframes, nav graph, hitboxes, spread cones) live in
// GameApp and read these toggles.

export interface DebugOverlayState {
  menu: boolean;
  collision: boolean;
  navmesh: boolean;
  botTargets: boolean;
  hitboxes: boolean;
  spread: boolean;
  fps: boolean;
  god: boolean;
  noclip: boolean;
}

export class DebugOverlay {
  state: DebugOverlayState = {
    menu: false,
    collision: false,
    navmesh: false,
    botTargets: false,
    hitboxes: false,
    spread: false,
    fps: false,
    god: false,
    noclip: false,
  };

  /** F1..F7 mapping. */
  toggleKey(n: number): void {
    switch (n) {
      case 1:
        this.state.menu = !this.state.menu;
        break;
      case 2:
        this.state.collision = !this.state.collision;
        break;
      case 3:
        this.state.navmesh = !this.state.navmesh;
        break;
      case 4:
        this.state.botTargets = !this.state.botTargets;
        break;
      case 5:
        this.state.hitboxes = !this.state.hitboxes;
        break;
      case 6:
        this.state.spread = !this.state.spread;
        break;
      case 7:
        this.state.fps = !this.state.fps;
        break;
    }
  }

  anyVisual(): boolean {
    return (
      this.state.collision ||
      this.state.navmesh ||
      this.state.botTargets ||
      this.state.hitboxes ||
      this.state.spread
    );
  }
}
