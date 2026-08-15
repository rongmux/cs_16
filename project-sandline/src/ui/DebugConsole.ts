// Lightweight in-game console (design doc 55). Commands are executed by the
// GameApp; cheats are dev-build only.

export type ConsoleExecutor = (line: string) => string;

export class DebugConsole {
  root: HTMLElement;
  private input: HTMLInputElement;
  private logEl: HTMLElement;
  private history: string[] = [];
  private histIndex = 0;
  visible = false;

  constructor(private executor: ConsoleExecutor) {
    this.root = document.createElement('div');
    this.root.id = 'console';
    this.root.style.display = 'none';
    this.root.innerHTML = `
      <div id="console-log"></div>
      <div id="console-line"><span>&gt;</span><input id="console-input" autocomplete="off" spellcheck="false"></div>
    `;
    this.logEl = this.root.querySelector('#console-log')!;
    this.input = this.root.querySelector('#console-input')!;
    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const line = this.input.value.trim();
        if (line) {
          this.history.push(line);
          this.histIndex = this.history.length;
          this.print(`> ${line}`);
          const out = this.executor(line);
          if (out) this.print(out);
        }
        this.input.value = '';
      } else if (e.key === 'ArrowUp') {
        if (this.histIndex > 0) {
          this.histIndex--;
          this.input.value = this.history[this.histIndex] ?? '';
        }
        e.preventDefault();
      } else if (e.key === 'ArrowDown') {
        if (this.histIndex < this.history.length) {
          this.histIndex++;
          this.input.value = this.history[this.histIndex] ?? '';
        }
        e.preventDefault();
      }
    });
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? '' : 'none';
    if (this.visible) {
      this.input.focus();
    }
  }

  print(text: string): void {
    const div = document.createElement('div');
    div.textContent = text;
    this.logEl.appendChild(div);
    while (this.logEl.children.length > 120) this.logEl.removeChild(this.logEl.firstChild!);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
}
