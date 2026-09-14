import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MrpFormatError } from "../../src/err/errors.ts";
import { MRPArchive, buildMrp, gunzip, gzipStore } from "../../src/mrp/index.ts";

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("5-A-1/2 MRPArchive", () => {
  it("empty MRP", () => {
    const bytes = buildMrp([]);
    const a = MRPArchive.parse(bytes);
    expect(a.header.magic).toBe("MRPG");
    expect(a.listFiles()).toEqual([]);
    expect(a.hasFile("start.mr")).toBe(false);
  });

  it("one plain file", () => {
    const bytes = buildMrp([{ name: "start.mr", data: enc("hello") }]);
    const a = MRPArchive.parse(bytes);
    expect(a.hasFile("start.mr")).toBe(true);
    expect(Array.from(a.readFile("start.mr"))).toEqual(Array.from(enc("hello")));
  });

  it("multiple files", () => {
    const bytes = buildMrp([
      { name: "a.txt", data: enc("A") },
      { name: "b.txt", data: enc("BB") },
      { name: "c.txt", data: enc("CCC") },
    ]);
    const a = MRPArchive.parse(bytes);
    expect(a.listFiles()).toEqual(["a.txt", "b.txt", "c.txt"]);
    expect(Array.from(a.readFile("b.txt"))).toEqual([0x42, 0x42]);
  });

  it("gzip file (store-block + zlib deflate)", () => {
    const raw = enc("gzip-payload-0123456789");
    const store = buildMrp([{ name: "g.bin", data: raw, gzip: true }]);
    expect(Array.from(MRPArchive.parse(store).readFile("g.bin"))).toEqual(Array.from(raw));

    const real = gzipSync(raw);
    const packed = buildMrp([{ name: "z.bin", data: real }]);
    const got = MRPArchive.parse(packed).readFile("z.bin");
    expect(Array.from(got)).toEqual(Array.from(raw));
    expect(Array.from(gunzip(real))).toEqual(Array.from(raw));
  });

  it("zero-length file", () => {
    const bytes = buildMrp([{ name: "empty.dat", data: new Uint8Array() }]);
    const a = MRPArchive.parse(bytes);
    expect(a.readFile("empty.dat").length).toBe(0);
  });

  it("filename edge cases", () => {
    const bytes = buildMrp([
      { name: "a/b", data: enc("p") },
      { name: "A.TXT", data: enc("u") },
      { name: ".", data: enc("d") },
    ]);
    const a = MRPArchive.parse(bytes);
    expect(a.hasFile("a/b")).toBe(true);
    expect(a.hasFile("A.TXT")).toBe(true);
    expect(a.hasFile("a.txt")).toBe(true);
    expect(Array.from(a.readFile("."))).toEqual([0x64]);
  });

  it("malformed header", () => {
    expect(() => MRPArchive.parse(enc("XXXX"))).toThrow(MrpFormatError);
    expect(() => MRPArchive.parse(new Uint8Array([1, 2, 3]))).toThrow(MrpFormatError);
  });

  it("truncated entry", () => {
    const ok = buildMrp([{ name: "x", data: enc("yy") }]);
    const cut = ok.subarray(0, 250);
    expect(() => MRPArchive.parse(cut)).toThrow(MrpFormatError);
  });

  it("accepts a stale larger FileLen when the full index and every resource remain present", () => {
    const bytes = buildMrp([{ name: "start.mr", data: enc("hello"), gzip: true }]);
    const reported = bytes.length + 34070;
    new DataView(bytes.buffer).setUint32(8, reported, true);
    const archive = MRPArchive.parse(bytes);
    expect(archive.header.fileLen).toBe(reported);
    expect(Array.from(archive.readFile("start.mr"))).toEqual(Array.from(enc("hello")));
  });

  it("still rejects missing payload bytes with a larger declared FileLen", () => {
    const bytes = buildMrp([{ name: "start.mr", data: enc("hello") }]);
    expect(() => MRPArchive.parse(bytes.subarray(0, bytes.length - 1))).toThrow(MrpFormatError);
  });

  it("rejects a missing index tail even when an early zero could terminate parsing", () => {
    const bytes = buildMrp([{ name: "start.mr", data: enc("hello") }]);
    const view = new DataView(bytes.buffer);
    view.setUint32(4, bytes.length + 100, true);
    view.setUint32(240, 0, true);
    expect(() => MRPArchive.parse(bytes)).toThrow(MrpFormatError);
  });

  it("invalid offset", () => {
    const ok = buildMrp([{ name: "x", data: enc("yy") }]);
    const bad = ok.slice();
    // index: [240] name_len=2, [244] "x\0", [246] offset
    bad[246] = 0xff;
    bad[247] = 0xff;
    bad[248] = 0xff;
    bad[249] = 0x7f;
    expect(() => MRPArchive.parse(bad)).toThrow(MrpFormatError);
  });

  it("invalid compressed length", () => {
    const ok = buildMrp([{ name: "x", data: enc("yy") }]);
    const bad = ok.slice();
    // [250] stored_length
    bad[250] = 0xff;
    bad[251] = 0xff;
    bad[252] = 0xff;
    bad[253] = 0x7f;
    expect(() => MRPArchive.parse(bad)).toThrow(MrpFormatError);
  });

  it("nested MRP", () => {
    const inner = buildMrp([{ name: "leaf.txt", data: enc("NEST") }]);
    const outer = buildMrp([{ name: "pack.mrp", data: inner }]);
    const child = MRPArchive.parse(outer).openNested("pack.mrp");
    expect(Array.from(child.readFile("leaf.txt"))).toEqual(Array.from(enc("NEST")));
  });

  it("MRPG magic", () => {
    const a = MRPArchive.parse(buildMrp([{ name: "f", data: enc("1") }], { magic: "MRPG" }));
    expect(a.header.magic).toBe("MRPG");
  });

  it("MRPF magic", () => {
    const a = MRPArchive.parse(buildMrp([{ name: "f", data: enc("1") }], { magic: "MRPF" }));
    expect(a.header.magic).toBe("MRPF");
    expect(Array.from(a.readFile("f"))).toEqual([0x31]);
  });

  it("gzipStore is valid gzip", () => {
    const raw = enc("abc");
    const gz = gzipStore(raw);
    expect(gz[0]).toBe(0x1f);
    expect(gz[1]).toBe(0x8b);
    expect(Array.from(gunzip(gz))).toEqual(Array.from(raw));
  });
});
