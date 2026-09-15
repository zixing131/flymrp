import { MR_IGNORE, MR_SUCCESS } from './constants.ts';
/** Native dsmSwitchPath keeps handset drive aliases inside virtual storage. */
export class WorkPath {
  value = 'mythroad/';
  set(path: string): void { this.value = path.replace(/\\/g,'/').replace(/\/+/g,'/'); if(this.value && !this.value.endsWith('/'))this.value+='/'; }
  query(): string {
    const prefix='mythroad/disk/',index=this.value.indexOf(prefix);
    if(index<0)return 'c:/'+this.value;
    const rest=this.value.slice(index+prefix.length);return `${rest.charAt(0)}:/${rest.slice(2)}`;
  }
  switch(input: string, length = input.length): number {
    const command=input.charAt(0).toUpperCase(),suffix=length>3?input.slice(3).split('\0')[0]:'';
    if(command==='Y')return MR_SUCCESS;
    if(command==='Z')this.set('mythroad/');
    else if(command==='X')this.set('mythroad/disk/x/');
    else if(command==='A'||command==='B')this.set(`mythroad/disk/${command.toLowerCase()}/`+suffix);
    else if(command==='C')this.set(length>3?suffix:'./');
    else return MR_IGNORE;
    return MR_SUCCESS;
  }
}

/** Virtual drive geometry: total × unit, available × unit.
 * Launchers select B as their storage card. The reference port's 77 KiB B
 * stub rejects them before initialization; B and C use our nominal SD size.
 */
export function diskSpace(drive: string): number[] | null {
  switch (drive.charAt(0).toUpperCase()) {
    case 'A': return [1722, 1024, 1271, 1024];
    case 'B':
    case 'C': return [1874, 1048576, 1873, 1048576];
    default: return null;
  }
}
