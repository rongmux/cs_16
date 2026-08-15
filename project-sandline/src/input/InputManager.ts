// Input manager: keyboard + pointer lock + mouse buttons + wheel.
// Builds a PlayerCommand each frame; edge-triggered inputs are queued and
// consumed by the game once per frame (no stuck keys after focus loss -
// design doc 52.3).

import { PlayerCommand } from '../player/PlayerEntity';
import { MouseLook } from './MouseLook';
import { DEFAULT_BINDINGS, Bindings } from './KeyBindings';

export interface InputCallbacks {
  /** Player asked to open/close the buy menu. */
  onBuyMenu: () => void;
  /** Player asked to open the console. */
  onConsole: () => void;
  /** Pause requested (Escape handled via pointer lock exit). */
  onPause: () => void;
  /** Pointer lock acquired / released. */
  onLockChange: (locked: boolean) => void;
  /** Debug keys F1-F7. */
  onDebugKey: (n: number) => void;
}

export class InputManager {
  look = new MouseLook();
  private keys = new Set<string>();
  private buttons = new Set<number>();
  private edges = new Set<string>();
  private slotEdges: PlayerCommand['switchSlot'][] = [];
  locked = false;
  bindings: Bindings = { ...DEFAULT_BINDINGS };

  constructor(private callbacks: InputCallbacks) {}

  attach(target: HTMLElement, canvas: HTMLElement): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerlockchange', this.onLockChangeEvent);
    target.addEventListener('click', this.onClick);
    void canvas;
  }

  detach(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerlockchange', this.onLockChangeEvent);
  }

  requestLock(canvas: HTMLElement): void {
    canvas.requestPointerLock?.();
  }

  exitLock(): void {
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  private onClick = (e: MouseEvent): void => {
    const target = e.currentTarget as HTMLElement;
    if (!this.locked) {
      target.requestPointerLock?.();
    }
  };

  private onLockChangeEvent = (): void => {
    this.locked = document.pointerLockElement !== null;
    if (!this.locked) {
      this.keys.clear();
      this.buttons.clear();
    }
    this.callbacks.onLockChange(this.locked);
  };

  private onBlur = (): void => {
    this.keys.clear();
    this.buttons.clear();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) {
      // Keep repeat for movement keys; ignore for edges.
      this.keys.add(e.code);
      return;
    }
    this.keys.add(e.code);

    if (e.code === 'F1' || e.code === 'F2' || e.code === 'F3' || e.code === 'F4' || e.code === 'F5' || e.code === 'F6' || e.code === 'F7') {
      this.callbacks.onDebugKey(parseInt(e.code.slice(1), 10));
      e.preventDefault();
      return;
    }
    if (e.code === this.bindings.jump) this.queueEdge('jump');
    if (e.code === this.bindings.reload) this.queueEdge('reload');
    if (e.code === this.bindings.use) this.queueEdge('use');
    if (e.code === this.bindings.drop) this.queueEdge('drop');
    if (e.code === this.bindings.buyMenu) this.callbacks.onBuyMenu();
    if (e.code === this.bindings.console) this.callbacks.onConsole();
    if (e.code === this.bindings.fireMode) this.queueEdge('fireMode');
    if (e.code === this.bindings.pause) this.callbacks.onPause();
    if (e.code === this.bindings.slot1) this.slotEdges.push('primary');
    if (e.code === this.bindings.slot2) this.slotEdges.push('secondary');
    if (e.code === this.bindings.slot3) this.slotEdges.push('knife');
    if (e.code === this.bindings.slot4) this.slotEdges.push('grenade');
    if (e.code === this.bindings.slot5) this.slotEdges.push('objective');

    // Swallow game keys to avoid browser shortcuts while locked.
    if (this.locked && (e.code === 'Space' || e.code === 'Tab')) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.look.addDelta(e.movementX, e.movementY);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (!this.locked) return;
    this.buttons.add(e.button);
    if (e.button === 1) {
      this.queueEdge('altFire');
      e.preventDefault();
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    this.buttons.delete(e.button);
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.locked) return;
    // Wheel cycles slots.
    const dir = e.deltaY > 0 ? 1 : -1;
    this.wheelQueue.push(dir);
  };

  private wheelQueue: number[] = [];

  private queueEdge(name: string): void {
    this.edges.add(name);
  }

  held(code: string): boolean {
    return this.keys.has(code);
  }

  buttonHeld(button: number): boolean {
    return this.buttons.has(button);
  }

  /** Consume one queued wheel tick (called by the app once per frame). */
  consumeWheel(): number | null {
    return this.wheelQueue.shift() ?? null;
  }

  buildCommand(): PlayerCommand {
    const b = this.bindings;
    const cmd: PlayerCommand = {
      forward: (this.held(b.forward) ? 1 : 0) - (this.held(b.back) ? 1 : 0),
      right: (this.held(b.right) ? 1 : 0) - (this.held(b.left) ? 1 : 0),
      run: !this.held(b.walk),
      crouch: this.held(b.crouch),
      jump: this.edges.has('jump'),
      fire: this.buttonHeld(0),
      reload: this.edges.has('reload'),
      altFire: this.edges.has('altFire'),
      fireModeSwitch: this.edges.has('fireMode'),
      switchSlot: this.slotEdges.length > 0 ? this.slotEdges.shift()! : null,
      use: this.held(b.use),
      usePressed: this.edges.has('use'),
      throwGrenade: this.buttonHeld(0),
      grenadePower: undefined,
    };
    return cmd;
  }

  /** Alt-fire is a click of button 1. */
  noteAltFireClick(): void {
    this.queueEdge('altFire');
  }

  consumeEdges(): void {
    this.edges.clear();
    this.slotEdges.length = 0;
  }
}
