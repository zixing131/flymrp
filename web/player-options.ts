import { inferScreenSize } from '../src/mythroad/device-size.ts';

/** Explicit handset metadata, bounded before allocating a guest framebuffer. */
export function parseScreenSize(value?: string | null): { width: number; height: number } | null {
  const match = value?.trim().match(/^(\d{2,3})[x×](\d{2,3})$/i);
  if (!match) return null;
  const width = Number(match[1]), height = Number(match[2]);
  return width >= 32 && height >= 32 && width <= 800 && height <= 800 ? { width, height } : null;
}

export function playerScreenSize(name: string, setting: string, metadata?: string | null): { width: number; height: number } {
  return (setting !== 'auto' ? parseScreenSize(setting) : null) ?? parseScreenSize(metadata) ?? inferScreenSize(name);
}

export function rotatedDirection(key: string, rotation: number): string {
  const directions = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
  const index = directions.indexOf(key);
  return index < 0 ? key : directions[(index - rotation + 4) % 4];
}

/** Rotate guest tilt (x right, y down) to match clockwise screen rotation 0–3. */
export function rotatedTilt(x: number, y: number, rotation: number): [number, number] {
  const turn = ((rotation % 4) + 4) % 4;
  const [tx, ty] = turn === 1 ? [y, -x] : turn === 2 ? [-x, -y] : turn === 3 ? [-y, x] : [x, y];
  return [tx || 0, ty || 0];
}
/** Invert a clockwise CSS rotation using normalized coordinates in its bounding box. */
export function screenPoint(x: number, y: number, width: number, height: number, rotation: number): [number, number] {
  const [u, v] = rotation === 1 ? [y, 1 - x] : rotation === 2 ? [1 - x, 1 - y] : rotation === 3 ? [1 - y, x] : [x, y];
  return [Math.max(0, Math.min(width - 1, Math.floor(u * width))), Math.max(0, Math.min(height - 1, Math.floor(v * height)))];
}
export function clockSlices(elapsedMs: number, speed: number): number[] {
  let remaining = Math.max(0, Math.min(100, elapsedMs)) * speed;
  const slices: number[] = [];
  while (remaining > 0) { const slice = Math.min(20, remaining); slices.push(slice); remaining -= slice; }
  return slices;
}

export function prefKey(name: string): string {
  return `flymrp.${name}`;
}

export function gameStem(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() || path;
  return base.replace(/\.mrp$/i, '').toLowerCase();
}

export function gamePrefKey(game: string, name: string): string {
  return `flymrp.game.${gameStem(game)}.${name}`;
}

export function readPref(name: string, game?: string | null): string | null {
  try {
    if (game) {
      const perGame = localStorage.getItem(gamePrefKey(game, name));
      if (perGame) return perGame;
    }
    return localStorage.getItem(prefKey(name));
  } catch {
    return null;
  }
}

export function readGamePref(game: string, name: string): string {
  try { return localStorage.getItem(gamePrefKey(game, name)) ?? ''; } catch { return ''; }
}

export function writePref(name: string, value: string, game?: string | null): void {
  try {
    const key = game ? gamePrefKey(game, name) : prefKey(name);
    if (game && !value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage is optional */ }
}

export function clearGamePrefs(game: string): void {
  try {
    const prefix = `flymrp.game.${gameStem(game)}.`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.indexOf(prefix) === 0) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch { /* storage is optional */ }
}
