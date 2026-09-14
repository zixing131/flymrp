import { expect, it } from 'vitest';
import { LuaVM, call, TAG_BOOL, TAG_NIL, TAG_NUMBER, TAG_STRING, TAG_TABLE } from '../../src/lua/index.ts';

for (const name of ['foreach', 'foreachi']) it(`${name} visits current values and stops on false as a non-nil result`, () => {
  const vm = new LuaVM(), L = vm.L, id = L.newTable(), table = L.tables[id];
  for (let i=1;i<=3;i++) table.setNum(i,{tag:TAG_NUMBER,num:i*10});
  const visited: number[][] = [];
  L.register('visit', state => {
    const key=state.optNumber(1),value=state.optNumber(2);visited.push([key,value]);
    if(key===1) table.setNum(2,{tag:TAG_NUMBER,num:99});
    if(key===2){state.pushBoolean(false);return 1;}return 0;
  });
  L.top=0;L.base=1;
  L.pushSlot(L.tables[L.getGlobal('table').num].getStr(L.internStr(name)));
  L.pushSlot({tag:TAG_TABLE,num:id});L.pushSlot(L.getGlobal('visit'));call(L,0,1);
  expect(visited).toEqual([[1,10],[2,99]]);expect(L.slot(0)).toEqual({tag:TAG_BOOL,num:0});
});

it('foreach tolerates deletion of the current key and reaches subsequent hash entries', () => {
  const vm = new LuaVM(), L = vm.L, id = L.newTable(), table = L.tables[id], seen: string[] = [];
  for(const key of ['a','b']) table.set(TAG_STRING,L.internStr(key),{tag:TAG_NUMBER,num:1});
  L.register('visit', state => {
    const {s,id:key}=state.checkString(1);seen.push(s);table.set(TAG_STRING,key,{tag:TAG_NIL,num:0});return 0;
  });
  L.top=0;L.base=1;
  L.pushSlot(L.tables[L.getGlobal('table').num].getStr(L.internStr('foreach')));
  L.pushSlot({tag:TAG_TABLE,num:id});L.pushSlot(L.getGlobal('visit'));call(L,0,1);
  expect(seen).toEqual(['a','b']);expect(L.slot(0).tag).toBe(TAG_NIL);
});
