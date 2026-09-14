import { describe, expect, it } from "vitest";
import kaios from "../../config/kaios-games.json";

describe("KaiOS library manifest", () => {
  it("keeps the independent five-game KaiOS selection valid", () => {
    expect(kaios.games).toHaveLength(5);
    expect(new Set(kaios.games.map(game => game.path)).size).toBe(5);
    for (const game of kaios.games) {
      expect(game.path).toMatch(/\.mrp$/i);
      expect(game.category.length).toBeGreaterThan(0);
      expect(game.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(kaios.games.map(game => game.title)).toEqual(["俄罗斯方块", "扫雷", "推箱子", "经典泡泡龙", "黄金矿工"]);
  });
});
