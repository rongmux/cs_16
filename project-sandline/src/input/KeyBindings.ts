// Key binding map. V1 ships a fixed default layout; rebinding UI is a later
// task (design doc 54 stores bindings in settings).

export interface Bindings {
  forward: string;
  back: string;
  left: string;
  right: string;
  jump: string;
  crouch: string;
  walk: string;
  reload: string;
  use: string;
  drop: string;
  buyMenu: string;
  console: string;
  slot1: string;
  slot2: string;
  slot3: string;
  slot4: string;
  slot5: string;
  slotCycle: string; // wheel handled separately
  fireMode: string;
  pause: string;
}

export const DEFAULT_BINDINGS: Bindings = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  crouch: 'ControlLeft',
  walk: 'ShiftLeft',
  reload: 'KeyR',
  use: 'KeyE',
  drop: 'KeyG',
  buyMenu: 'KeyB',
  console: 'Backquote',
  slot1: 'Digit1',
  slot2: 'Digit2',
  slot3: 'Digit3',
  slot4: 'Digit4',
  slot5: 'Digit5',
  slotCycle: '',
  fireMode: 'KeyV',
  pause: 'Escape',
};

export function codeToLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'Space';
  if (code === 'ControlLeft') return 'Ctrl';
  if (code === 'ShiftLeft') return 'Shift';
  if (code === 'Backquote') return '`';
  if (code === 'Escape') return 'Esc';
  return code;
}
