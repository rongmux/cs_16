// Boot: create the app shell and start it (design doc 4.1).

import { GameApp } from './GameApp';

export function bootstrap(): GameApp {
  const root = document.getElementById('app');
  if (!root) throw new Error('#app root element missing');
  const app = new GameApp(root);
  return app;
}
