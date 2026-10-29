import { ExtRuntime } from '../abi/runtime.ts';
import { TAG_TABLE, type NativeFunction } from '../lua/types.ts';
import { binToBytes } from '../mrp/archive.ts';
import type { MythroadRuntime } from './runtime.ts';

/** mr_socket_target.c / mr_tcp_target.c, using the same offline backend as EXT. */
export function installLuaNetwork(rt: MythroadRuntime): { open: NativeFunction; close: NativeFunction } {
  const L = rt.lua.L;
  const backend = () => {
    if (!rt.ext) rt.bindExt(new ExtRuntime());
    return rt.mrTable!.offlineNetwork;
  };
  const states = new Set<{ handle: number; state: number }>();
  const close: NativeFunction = s => {
    backend(); rt.mrTable!.closeNetwork();
    for (const socket of states) { socket.handle = -1; socket.state = 3; }
    states.clear();
    const global = L.getGlobal('socket');
    if (global.tag === TAG_TABLE) L.setTableNum(global.num, 'state', 3);
    s.pushInteger(0); return 1;
  };
  const open: NativeFunction = s => {
    const net = backend(), id = s.pushTable();
    L.setGlobal('socket', TAG_TABLE, id); L.setTableNum(id, 'state', 2);
    L.setTableFn(id, 'getHost', t => {
      const ip = net.resolve(t.checkString(1).s);
      L.setTableNum(id, 'ip', ip); t.pushInteger(ip); return 1;
    });
    L.setTableFn(id, 'udp', t => { t.pushNil(); return 1; });
    L.setTableFn(id, 'tcp', t => {
      const handle = net.socket(0, 0);
      if (handle < 0) { t.pushNil(); return 1; }
      const socket = { handle, state: 0 }; states.add(socket);
      const object = t.pushTable();
      const put = (name: string, fn: NativeFunction) => L.setTableFn(object, name, fn);
      put('close', q => { net.close(socket.handle); socket.handle = -1; socket.state = 3; states.delete(socket); return 0; });
      put('getsock', q => { q.pushInteger(socket.handle); return 1; });
      put('getstate', q => { q.pushInteger(socket.state); return 1; });
      put('getinfo', q => { L.setTableNum(q.pushTable(), 'state', socket.state); return 1; });
      put('connect', q => {
        const result = net.connect(socket.handle, q.optNumber(2, 0), q.optNumber(3, 0) & 0xffff);
        socket.state = result === 0 ? 2 : 5;
        if (result === 0) q.pushInteger(0); else q.pushNil(); return 1;
      });
      put('bind', q => { q.pushInteger(-1); return 1; });
      put('send', q => {
        const value = q.checkLString(2).s;
        const index = (n: number) => n < 0 ? value.length + n + 1 : n;
        const start = Math.max(1, index(q.optNumber(3, 1))), end = Math.min(value.length, index(q.optNumber(4, -1)));
        const result = start > end ? 0 : net.send(socket.handle, binToBytes(value.slice(start - 1, end)));
        if (result >= 0) { q.pushInteger(result); q.pushNil(); q.pushNil(); }
        else { socket.state = 5; q.pushNil(); q.pushString('tcp send:err!'); q.pushInteger(result); }
        return 3;
      });
      put('receive', q => {
        const result = net.receive(socket.handle, Math.min(1500, q.optNumber(2, 0)));
        if (result instanceof Uint8Array || result === 0) { q.pushString(result === 0 ? '' : result); q.pushNil(); }
        else { socket.state = 5; q.pushNil(); q.pushString('tcp recv:err!'); }
        q.pushNil(); return 3;
      });
      return 1;
    });
    return 1;
  };
  L.register('_initNet', open); L.register('_closeNet', close);
  return { open, close };
}
