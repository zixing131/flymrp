import { describe, expect, it } from "vitest";
import { EXT_CODE_ADDR } from "../../src/abi/layout.ts";
import {
  CREATE_ABC,
  CREATE_ABx,
  OP_CALL,
  OP_GETGLOBAL,
  OP_LOADK,
  OP_MOVE,
  OP_RETURN,
  dumpChunk,
  proto,
} from "../../src/lua/index.ts";
import { buildMrp } from "../../src/mrp/index.ts";
import {
  MR_STATE_RUN,
  MR_TIMER_STATE_RUNNING,
  MythroadRuntime,
  NullGraphicsBackend,
} from "../../src/mythroad/index.ts";
import { kn, ks } from "../helpers/lua.ts";
import { ARM_LOAD_HELPER_OFF, assembleArmHelperAt, buildArmLoadImage } from "../helpers/ext-asm.ts";

function fixtureStartMr(): Uint8Array {
  return dumpChunk(
    proto({
      maxstack: 10,
      k: [
        ks("_com"),
        kn(3629),
        kn(2913),
        ks("GetSysInfo"),
        ks("_clearScr"),
        kn(128),
        kn(0),
        ks("_drawText"),
        ks("hi"),
        kn(255),
        kn(255),
        ks("_dispUp"),
        kn(240),
        kn(320),
      ],
      code: [
        CREATE_ABx(OP_GETGLOBAL, 0, 0),
        CREATE_ABx(OP_LOADK, 1, 1),
        CREATE_ABx(OP_LOADK, 2, 2),
        CREATE_ABC(OP_CALL, 0, 3, 1),
        CREATE_ABx(OP_GETGLOBAL, 0, 3),
        CREATE_ABC(OP_CALL, 0, 1, 2),
        CREATE_ABx(OP_GETGLOBAL, 1, 4),
        CREATE_ABx(OP_LOADK, 2, 5),
        CREATE_ABx(OP_LOADK, 3, 5),
        CREATE_ABx(OP_LOADK, 4, 6),
        CREATE_ABC(OP_CALL, 1, 4, 1),
        CREATE_ABx(OP_GETGLOBAL, 1, 7),
        CREATE_ABx(OP_LOADK, 2, 8),
        CREATE_ABx(OP_LOADK, 3, 6),
        CREATE_ABx(OP_LOADK, 4, 6),
        CREATE_ABx(OP_LOADK, 5, 9),
        CREATE_ABx(OP_LOADK, 6, 10),
        CREATE_ABx(OP_LOADK, 7, 6),
        CREATE_ABC(OP_CALL, 1, 7, 1),
        CREATE_ABx(OP_GETGLOBAL, 1, 11),
        CREATE_ABx(OP_LOADK, 2, 6),
        CREATE_ABx(OP_LOADK, 3, 6),
        CREATE_ABx(OP_LOADK, 4, 12),
        CREATE_ABx(OP_LOADK, 5, 13),
        CREATE_ABC(OP_CALL, 1, 5, 1),
        CREATE_ABC(OP_RETURN, 0, 2, 0),
      ],
    }),
  );
}

describe("5-B start.mr runtime", () => {
  it("documents real start.mr binary unavailable", () => {
    expect("real start.mr binary unavailable").toBe("real start.mr binary unavailable");
  });

  it("fixture start.mr draws and sets BI flag", () => {
    const g = new NullGraphicsBackend();
    const rt = new MythroadRuntime({ graphics: g });
    rt.loadMrp(buildMrp([{ name: "start.mr", data: fixtureStartMr() }]));
    rt.start();
    expect(rt.state).toBe(MR_STATE_RUN);
    expect(rt.bi & 1).toBe(1);
    expect(g.commands.some((c) => c.op === "clear")).toBe(true);
    expect(g.commands.some((c) => c.op === "text" && c.text === "hi")).toBe(true);
    expect(g.commands.some((c) => c.op === "flush")).toBe(true);
  });

  it("start sets _mr_entry / _mr_param", () => {
    const rt = new MythroadRuntime({ entry: "_dsm", param: "p" });
    rt.loadMrp(buildMrp([{ name: "start.mr", data: fixtureStartMr() }]));
    rt.start();
    const e = rt.lua.L.getGlobal("_mr_entry");
    expect(rt.lua.L.strings[e.num]).toBe("_dsm");
  });

  it("start supplies the legacy parent-launch sentinel", () => {
    const rt = new MythroadRuntime();
    rt.loadMrp(buildMrp([{ name: "start.mr", data: fixtureStartMr() }]));
    rt.start();
    const sentinel = rt.lua.L.getGlobal("_nes3ShP7SwK0");
    expect(sentinel.num).toBe(370);
  });

  it("dealtimer present auto-starts 100ms timer", () => {
    const rt = new MythroadRuntime();
    rt.lua.register("dealtimer", () => 0);
    rt.loadMrp(buildMrp([{ name: "start.mr", data: fixtureStartMr() }]));
    rt.start();
    expect(rt.timers.state).toBe(MR_TIMER_STATE_RUNNING);
    expect(rt.timers.interval).toBe(100);
  });

  it("resource → Lua via _strCom(601) after loadMrp", () => {
    const rt = new MythroadRuntime();
    rt.loadMrp(buildMrp([{ name: "note.txt", data: Uint8Array.from("XYZ", (c) => c.charCodeAt(0)) }]));
    rt.lua.runCold(
      proto({
        maxstack: 4,
        k: [ks("_strCom"), kn(601), ks("note.txt")],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABC(OP_CALL, 0, 3, 2),
          CREATE_ABC(OP_RETURN, 0, 2, 0),
        ],
      }),
    );
    expect(rt.lua.L.strings[rt.lua.L.nums[0]!]!).toBe("XYZ");
  });

  it("Lua → native → EXT still works", () => {
    const helperAt = EXT_CODE_ADDR + ARM_LOAD_HELPER_OFF;
    const ext = buildArmLoadImage({
      dest: EXT_CODE_ADDR,
      helperWords: assembleArmHelperAt(helperAt, { ret0: 0x42 }),
    });
    const start = dumpChunk(
      proto({
        maxstack: 8,
        k: [ks("_strCom"), kn(601), ks("test.ext"), kn(800), kn(0), kn(801), ks("")],
        code: [
          CREATE_ABx(OP_GETGLOBAL, 0, 0),
          CREATE_ABx(OP_LOADK, 1, 1),
          CREATE_ABx(OP_LOADK, 2, 2),
          CREATE_ABC(OP_CALL, 0, 3, 2),
          CREATE_ABx(OP_GETGLOBAL, 1, 0),
          CREATE_ABx(OP_LOADK, 2, 3),
          CREATE_ABC(OP_MOVE, 3, 0, 0),
          CREATE_ABx(OP_LOADK, 4, 4),
          CREATE_ABC(OP_CALL, 1, 4, 2),
          CREATE_ABx(OP_GETGLOBAL, 2, 0),
          CREATE_ABx(OP_LOADK, 3, 5),
          CREATE_ABx(OP_LOADK, 4, 6),
          CREATE_ABx(OP_LOADK, 5, 4),
          CREATE_ABC(OP_CALL, 2, 4, 3),
          CREATE_ABC(OP_RETURN, 3, 2, 0),
        ],
      }),
    );
    const rt = new MythroadRuntime();
    rt.loadMrp(buildMrp([{ name: "start.mr", data: start }, { name: "test.ext", data: ext }]));
    rt.start();
    expect(rt.lua.L.nums[0]!).toBe(0x42);
  });
});
