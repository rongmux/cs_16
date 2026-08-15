// Persisted settings via localStorage (design doc 54).

const KEY = 'sandline.settings.v1';

export interface GameSettings {
  sensitivity: number;
  volume: number;
  invertY: boolean;
  botCount: number;
  botDifficulty: string;
  humanTeam: 'attackers' | 'defenders';
  mapId: string;
}

export const DEFAULT_SETTINGS: GameSettings = {
  sensitivity: 1.0,
  volume: 0.8,
  invertY: false,
  botCount: 9,
  botDifficulty: 'normal',
  humanTeam: 'defenders',
  mapId: 'map_sandline',
};

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable - settings just won't persist.
  }
}
