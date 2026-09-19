import { expect, it } from "vitest";
import { gzipStore } from "../../src/mrp/gzip.ts";
import { decodeStoreList, isStoreSupported } from "../../web/mrp-store.ts";

it("keeps the web store available without DecompressionStream", () => {
  const original = (globalThis as { DecompressionStream?: unknown }).DecompressionStream;
  delete (globalThis as { DecompressionStream?: unknown }).DecompressionStream;
  try {
    expect(isStoreSupported()).toBe(true);
  } finally {
    if (original) (globalThis as { DecompressionStream?: unknown }).DecompressionStream = original;
  }
});

it("inflates a gzip store list without browser DecompressionStream", () => {
  const json = JSON.stringify([{
    id: 17,
    label: "白跑分",
    name: "baipao.mrp",
    down: "/mrp-files/baipaofenv1.1.5.mrp",
    vendor: "test",
    version: 1,
    size: "26KB",
    len: 26406,
    scr: "240x320",
    detail: "bench",
    icon: "/mrp-icon/a.png",
  }]);
  const apps = decodeStoreList(gzipStore(new TextEncoder().encode(json)));
  expect(apps).toHaveLength(1);
  expect(apps[0]?.label).toBe("白跑分");
  expect(apps[0]?.downUrl).toContain("/mrp-files/baipaofenv1.1.5.mrp");
});
