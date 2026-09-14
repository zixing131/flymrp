import { describe, expect, it } from 'vitest';
import { installedGamesFromSd, playerHref } from '../../web/library.ts';
import { parseScreenSize, playerScreenSize } from '../../web/player-options.ts';

describe('store handset resolution', () => {
  it.each(['128x128', '128x160', '176x220', '240x320', '240x400', '320x240', '320x480', '480x320', '272x480', '480x800'])(
    'passes %s from a downloaded game through its player URL to the runtime profile', resolution => {
      const [game] = installedGamesFromSd([{ path: 'games/store/sky_game.mrp', bytes: { length: 20 }, resolution }]);
      const url = new URL(playerHref(game, 'https://example.com/flymrp/index.html'));
      expect(url.searchParams.get('local')).toBe('games/store/sky_game.mrp');
      const [width, height] = resolution.split('x').map(Number);
      expect(playerScreenSize(game.name, 'auto', url.searchParams.get('scr'))).toEqual({ width, height });
    },
  );
  it('keeps an explicit user setting ahead of store metadata and metadata ahead of filename hints', () => {
    expect(playerScreenSize('game240x320.mrp', 'auto', '320x480')).toEqual({ width: 320, height: 480 });
    expect(playerScreenSize('game.mrp', '176x220', '320x480')).toEqual({ width: 176, height: 220 });
    expect(playerScreenSize('game240x400.mrp', 'auto')).toEqual({ width: 240, height: 400 });
  });
  it('rejects malformed or excessive dimensions before allocating the screen', () => {
    for (const text of ['0x0', '1x320', '999x999', '480x800suffix', '-320x480', 'Infinityx320']) expect(parseScreenSize(text)).toBeNull();
    expect(playerScreenSize('game.mrp', 'auto', '9999x9999')).toEqual({ width: 240, height: 320 });
  });
});
