// Main menu, pause menu and match end panel. Original visual design
// (design doc 28: never clone the classic VGUI skin).

import { mapCatalog, difficultyIds, difficulties } from '../world/DataFiles';
import { clampBotCount } from '../rules/MatchConfig';
import { GameSettings } from './Settings';

export interface MenuCallbacks {
  onStart: (settings: GameSettings) => void;
  onResume: () => void;
  onQuitToMenu: () => void;
  onRestartRound: () => void;
  onRematch: () => void;
  onSettingsChanged: (settings: GameSettings) => void;
}

export class Menus {
  main: HTMLElement;
  pause: HTMLElement;
  matchEnd: HTMLElement;
  private settings: GameSettings;

  constructor(settings: GameSettings, private callbacks: MenuCallbacks) {
    this.settings = settings;
    this.main = this.buildMain();
    this.pause = this.buildPause();
    this.matchEnd = this.buildMatchEnd();
  }

  // ---- Main menu -------------------------------------------------------

  private buildMain(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'menu-main';
    el.className = 'menu';
    el.innerHTML = `
      <div class="menu-box">
        <h1 class="logo">PROJECT <span>SANDLINE</span></h1>
        <p class="tagline">Browser-based classic tactical round FPS · offline bots · original content</p>
        <div class="menu-row"><label>Map</label><select id="set-map">
          ${mapCatalog.map((m) => `<option value="${m.id}">${m.name}${m.mode === 'training' ? ' (training)' : ''}</option>`).join('')}
        </select></div>
        <div class="menu-row"><label>Side</label><select id="set-team">
          <option value="defenders">Response Unit (defend)</option>
          <option value="attackers">Raiders (attack)</option>
        </select></div>
        <div class="menu-row"><label>Bots <span id="bot-count-label"></span></label><input type="range" id="set-bots" min="0" max="15" step="1"></div>
        <div class="menu-row"><label>Bot difficulty</label><select id="set-diff">
          ${difficultyIds.map((d) => `<option value="${d}">${difficulties[d].label}</option>`).join('')}
        </select></div>
        <div class="menu-row"><label>Mouse sensitivity <span id="sens-label"></span></label><input type="range" id="set-sens" min="0.2" max="4" step="0.05"></div>
        <div class="menu-row"><label>Volume <span id="vol-label"></span></label><input type="range" id="set-vol" min="0" max="1" step="0.05"></div>
        <div class="menu-row"><label><input type="checkbox" id="set-invert"> Invert mouse Y</label></div>
        <button id="btn-start" class="big">START MATCH</button>
        <div class="menu-help">
          <b>Controls</b> · WASD move · Mouse aim · LMB fire · RMB zoom · R reload · 1-5 weapons · B buy ·
          E use (plant/defuse) · Shift walk · Ctrl crouch · Space jump · \` console · F1-F7 debug · Esc pause
        </div>
        <div class="menu-foot">A clean-room original game. No Valve assets, maps, models, audio or names.</div>
      </div>
    `;
    const $ = (id: string) => el.querySelector(id) as HTMLInputElement;

    const sync = () => {
      ($('#set-bots') as HTMLInputElement).value = String(this.settings.botCount);
      el.querySelector('#bot-count-label')!.textContent = `(${this.settings.botCount})`;
      $('#set-sens').value = String(this.settings.sensitivity);
      el.querySelector('#sens-label')!.textContent = this.settings.sensitivity.toFixed(2);
      $('#set-vol').value = String(this.settings.volume);
      el.querySelector('#vol-label')!.textContent = `${Math.round(this.settings.volume * 100)}%`;
      $('#set-invert').checked = this.settings.invertY;
      $('#set-map').value = this.settings.mapId;
      $('#set-team').value = this.settings.humanTeam;
      $('#set-diff').value = this.settings.botDifficulty;
    };
    sync();

    $('#set-bots').addEventListener('input', () => {
      this.settings.botCount = clampBotCount(parseInt($('#set-bots').value, 10));
      sync();
      this.persist();
    });
    $('#set-sens').addEventListener('input', () => {
      this.settings.sensitivity = parseFloat($('#set-sens').value);
      sync();
      this.persist();
    });
    $('#set-vol').addEventListener('input', () => {
      this.settings.volume = parseFloat($('#set-vol').value);
      sync();
      this.persist();
    });
    $('#set-invert').addEventListener('change', () => {
      this.settings.invertY = $('#set-invert').checked;
      this.persist();
    });
    $('#set-map').addEventListener('change', () => {
      this.settings.mapId = $('#set-map').value;
      this.persist();
    });
    $('#set-team').addEventListener('change', () => {
      this.settings.humanTeam = $('#set-team').value as 'attackers' | 'defenders';
      this.persist();
    });
    $('#set-diff').addEventListener('change', () => {
      this.settings.botDifficulty = $('#set-diff').value;
      this.persist();
    });
    el.querySelector('#btn-start')!.addEventListener('click', () => {
      this.callbacks.onStart({ ...this.settings });
    });
    return el;
  }

  private persist(): void {
    this.callbacks.onSettingsChanged({ ...this.settings });
  }

  // ---- Pause menu ------------------------------------------------------

  private buildPause(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'menu-pause';
    el.className = 'menu';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="menu-box small">
        <h2>PAUSED</h2>
        <button id="btn-resume" class="big">Resume</button>
        <button id="btn-restart" class="alt">Restart round</button>
        <button id="btn-quit" class="alt">Quit to menu</button>
        <div class="menu-foot">Press Esc to resume</div>
      </div>
    `;
    el.querySelector('#btn-resume')!.addEventListener('click', () => this.callbacks.onResume());
    el.querySelector('#btn-restart')!.addEventListener('click', () => this.callbacks.onRestartRound());
    el.querySelector('#btn-quit')!.addEventListener('click', () => this.callbacks.onQuitToMenu());
    return el;
  }

  // ---- Match end -------------------------------------------------------

  private buildMatchEnd(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'menu-matchend';
    el.className = 'menu';
    el.style.display = 'none';
    el.innerHTML = `
      <div class="menu-box small">
        <h2 id="match-end-title">MATCH OVER</h2>
        <p id="match-end-score"></p>
        <button id="btn-rematch" class="big">Play again</button>
        <button id="btn-quit2" class="alt">Quit to menu</button>
      </div>
    `;
    el.querySelector('#btn-rematch')!.addEventListener('click', () => this.callbacks.onRematch());
    el.querySelector('#btn-quit2')!.addEventListener('click', () => this.callbacks.onQuitToMenu());
    return el;
  }

  showMatchEnd(winner: string, score: [number, number]): void {
    this.matchEnd.style.display = '';
    this.matchEnd.querySelector('#match-end-title')!.textContent =
      winner === 'attackers' ? 'RAIDERS WIN' : winner === 'defenders' ? 'RESPONSE UNIT WIN' : 'DRAW';
    this.matchEnd.querySelector('#match-end-score')!.textContent = `Final score ${score[0]} : ${score[1]}`;
  }

  hideAll(): void {
    this.main.style.display = 'none';
    this.pause.style.display = 'none';
    this.matchEnd.style.display = 'none';
  }

  showMain(): void {
    this.hideAll();
    this.main.style.display = '';
  }

  showPause(): void {
    this.hideAll();
    this.pause.style.display = '';
  }
}
