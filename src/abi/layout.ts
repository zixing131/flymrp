/**
 * EXT guest address layout. Values match src/include/arm_ext_internal.h.
 * Guest addresses are never host pointers.
 */

export const EXT_BASE_ADDR = 0x0001_0000;
export const EXT_MEM_SIZE = 32 * 1024 * 1024;
export const EXT_TABLE_ADDR = EXT_BASE_ADDR;
export const EXT_TABLE_COUNT = 150;
export const EXT_TABLE_BYTES = EXT_TABLE_COUNT * 4;
/** rxgj `mr.h` / `pack_filename[MR_MAX_FILENAME_SIZE]`. table[100] data slot. */
export const MR_MAX_FILENAME_SIZE = 128;
export const PACK_FILENAME_SLOT = 100;
export const EXT_STOP_ADDR = 0x0007_fff0;
export const EXT_HEAP_ADDR = 0x0020_0000;
export const EXT_STACK_ADDR = 0x01e0_0000;
export const EXT_STACK_SIZE = 512 * 1024;
export const EXT_CODE_ADDR = 0x01e8_0000;
export const EXT_WRAPPER_STACK_SIZE = 0x20000;
export const EXT_CHUNK_MAGIC = 0x7fd8_54eb;
export const EXT_LOW_TABLE_SIZE = 0x1_0000;

export const EXT_PLATFORM_MEM_ADDR = 0x4000_0000;
export const EXT_PLATFORM_MEM_SIZE = 2 * 1024 * 1024;
export const EXT_SCRRAM_ADDR = 0x5000_0000;
export const EXT_EXECUTOR_META_ADDR = 0x7000_0000;
export const EXT_VFD_BASE = 0x7fff_0000;
export const EXT_PLATFORM_IO_MEM_ADDR = 0x8000_0000;
export const EXT_PLATFORM_IO_MEM_SIZE = 18 * 1024 * 1024;
export const EXT_PLATFORM_ALT_MEM_ADDR = 0xa000_0000;

export const AEX_P_ER_RW_OFF = 0x00;
export const AEX_P_ER_RW_LEN_OFF = 0x04;
export const AEX_P_EXT_TYPE_OFF = 0x08;
export const AEX_P_EXT_CHUNK_OFF = 0x0c;
export const AEX_P_STACK_OFF = 0x10;
export const AEX_P_SIZE = 20;

export const AEX_CHUNK_INIT_OFF = 0x04;
export const AEX_CHUNK_HELPER_OFF = 0x08;
export const AEX_CHUNK_FILE_BASE_OFF = 0x0c;
export const AEX_CHUNK_FILE_LEN_OFF = 0x10;
export const AEX_CHUNK_RW_BASE_OFF = 0x14;
export const AEX_CHUNK_RW_LEN_OFF = 0x18;
export const AEX_CHUNK_P_ADDR_OFF = 0x1c;
export const AEX_CHUNK_SUSPEND_OFF = 0x34;

export const MR_SUCCESS = 0;
export const MR_FAILED = 0xffff_ffff; // -1
export const MR_IGNORE = 1;

export const MRPGCMAP = new Uint8Array([0x4d, 0x52, 0x50, 0x47, 0x43, 0x4d, 0x41, 0x50]);

export function tableSlotAddr(n: number): number {
  return (EXT_TABLE_ADDR + n * 4) >>> 0;
}

export function tableSlotIndex(pc: number): number {
  return ((pc >>> 0) - EXT_TABLE_ADDR) >>> 2;
}

export function inTableRange(pc: number): boolean {
  const a = pc >>> 0;
  return a >= EXT_TABLE_ADDR && a < EXT_TABLE_ADDR + EXT_TABLE_BYTES;
}

export function stackTop(): number {
  return (EXT_STACK_ADDR + EXT_STACK_SIZE) >>> 0;
}
