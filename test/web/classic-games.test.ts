import { describe, expect, it } from "vitest";
import classics from "../../config/classic-games.json";

describe("classic library manifest", () => {
  it("validates the fork's generated library without assuming the upstream 100-game snapshot", () => {
    const paths = classics.games.map(game => game.path);
    expect(paths.length).toBeGreaterThan(0);
    expect(new Set(paths).size).toBe(paths.length);
    for (const path of paths) {
      expect(path).toMatch(/\.mrp$/i);
      expect(path.split(/[\\/]/)).not.toContain('..');
      expect(path).not.toMatch(/^(?:[A-Za-z]:|[\\/])/);
    }
    for (const game of classics.games) {
      expect(game.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(game.title.length).toBeGreaterThan(0);
      expect(game.category.length).toBeGreaterThan(0);
    }
  });
});
