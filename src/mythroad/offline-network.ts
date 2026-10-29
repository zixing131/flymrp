import { DEFAULT_NETWORK_RULES, hostname, ipv4, ipString, parseNetworkRules, type NetworkRules } from "./network-rules.ts";
import { md5Bytes } from "./guest-md5.ts";
import { MR_FAILED, MR_SUCCESS } from "./constants.ts";
import { legacyDownloadRequest, legacyDownloadResponse } from "./legacy-download.ts";

const encoder = new TextEncoder(), decoder = new TextDecoder();
const LIMIT = 1024 * 1024;
const SERVICE_IP = 0xc0000201; // TEST-NET-1; never handed to a host socket.
const WAP_GATEWAY = 0x0a0000ac;
const concat = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};
const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };
const tlv = (type: number, value: Uint8Array) => concat(u32(type), u32(value.length), value);

/** Exact, bounded big-endian records used by the reference payOneAsTlv fixture. */
function records(bytes: Uint8Array): Map<number, Uint8Array> | null {
  const result = new Map<number, Uint8Array>();
  let p = 0;
  while (p < bytes.length) {
    if (bytes.length - p < 8) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset + p, 8);
    const type = view.getUint32(0), length = view.getUint32(4);
    if (length > bytes.length - p - 8 || result.has(type)) return null;
    result.set(type, bytes.slice(p + 8, p + 8 + length));
    p += 8 + length;
  }
  return result;
}

type Socket = { ip: number; port: number; connected: boolean; request: Uint8Array; response: Uint8Array | null; position: number; failed: boolean };

/** In-memory adapter for the reference project's legacy service fixture.
 * No DNS, fetch, host socket, SMS, account or payment operation is performed.
 * Unknown destinations/protocols fail instead of inventing a service response.
 */
export class OfflineNetwork {
  private nextHandle = 1;
  private sockets = new Map<number, Socket>();
  readonly requests: { host: string; path: string; stage: string }[] = [];
  readonly interceptions: { host: string; ip: string; port: number; path: string; result: string; file?: string; appid?: number }[] = [];
  readonly rules: NetworkRules;
  private readonly dns = new Map<string, number>();
  private readonly addresses = new Set<number>([WAP_GATEWAY]);
  constructor(private readonly options: { rules?: NetworkRules; readFile?: (name: string) => Uint8Array | null; readPackage?: (appid: number) => Uint8Array | null } = {}) {
    this.rules = parseNetworkRules(options.rules ?? DEFAULT_NETWORK_RULES);
    // Keep the original ROP address stable for old callers/tests.
    const hosts = ["rop.skymobiapp.com"];
    for (const host of this.rules.hosts) hosts.push(host);
    for (const route of this.rules.routes) if (route.host) hosts.push(route.host);
    const seen = new Set<string>();
    for (const host of hosts) {
      if (seen.has(host)) continue;
      seen.add(host);
      const ip = (SERVICE_IP + this.dns.size) >>> 0;
      this.dns.set(host, ip);
      this.addresses.add(ip);
    }
    for (const ip of this.rules.ips) this.addresses.add(ipv4(ip)!);
    for (const route of this.rules.routes) if (route.ip) this.addresses.add(ipv4(route.ip)!);
  }
  resolve(value: string): number {
    try { const host = hostname(value), ip = ipv4(host); return this.dns.get(host) ?? (ip !== null && this.addresses.has(ip) ? ip : MR_FAILED); }
    catch { return MR_FAILED; }
  }
  socket(type: number, protocol: number): number {
    if (type !== 0 || protocol !== 0 || this.sockets.size >= 16) return MR_FAILED;
    const id = this.nextHandle++;
    this.sockets.set(id, { ip: 0, port: 0, connected: false, request: new Uint8Array(), response: null, position: 0, failed: false });
    return id;
  }
  connect(id: number, ip: number, port: number): number {
    const s = this.sockets.get(id);
    const ports = [80, 6009, 8080];
    for (const route of this.rules.routes) if (route.port) ports.push(route.port);
    if (!s || !this.addresses.has(ip >>> 0) || !Number.isInteger(port) || ports.indexOf(port) < 0) return MR_FAILED;
    s.ip = ip >>> 0; s.port = port; s.connected = true;
    return MR_SUCCESS;
  }
  close(id: number): number { return this.sockets.delete(id) ? MR_SUCCESS : MR_FAILED; }
  state(id: number): number { const s = this.sockets.get(id); return s?.connected && !s.failed ? MR_SUCCESS : MR_FAILED; }
  closeAll(): void { this.sockets.clear(); }
  send(id: number, bytes: Uint8Array): number {
    const s = this.sockets.get(id);
    if (!s?.connected || s.failed || s.response || bytes.length > LIMIT - s.request.length) return MR_FAILED;
    s.request = concat(s.request, bytes);
    this.respond(s);
    return s.failed ? MR_FAILED : bytes.length;
  }
  receive(id: number, length: number): Uint8Array | number {
    const s = this.sockets.get(id);
    if (!s?.connected || s.failed || !Number.isInteger(length) || length < 0 || length > LIMIT) return MR_FAILED;
    if (!s.response) return 0; // Native nonblocking socket: no data yet.
    if (s.position >= s.response.length) return MR_FAILED; // Native EOF.
    const bytes = s.response.slice(s.position, s.position + length);
    s.position += bytes.length;
    return bytes;
  }
  private respond(s: Socket): void {
    const text = decoder.decode(s.request), boundary = text.indexOf("\r\n\r\n");
    if (boundary < 0) { if (s.request.length > 16 * 1024) s.failed = true; return; }
    // Headers are ASCII, so their string/byte offsets must agree.
    if (boundary > 16 * 1024 || s.request.subarray(0, boundary + 4).some(b => b > 127)) { s.failed = true; return; }
    const lines = text.slice(0, boundary).split("\r\n");
    const [method, target, version] = lines.shift()!.split(" ");
    if (!["GET", "POST"].includes(method) || !/^HTTP\/1\.[01]$/.test(version ?? "")) { s.failed = true; return; }
    const headers = new Map<string, string>();
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon < 1) { s.failed = true; return; }
      const name = line.slice(0, colon).toLowerCase();
      if (headers.has(name)) { s.failed = true; return; }
      headers.set(name, line.slice(colon + 1).trim());
    }
    let host: string, path: string, requestPort: number;
    try {
      const authority = headers.get("x-online-host") ?? headers.get("host") ?? ipString(s.ip);
      const url = new URL(target.startsWith("http://") ? target : `http://${authority}${target}`);
      if ((!target.startsWith("/") && !target.startsWith("http://")) || url.username || url.password || url.hash) throw Error("invalid target");
      host = hostname(url.hostname); path = url.pathname + url.search; requestPort = Number(url.port || s.port);
    } catch { s.failed = true; return; }
    const size = headers.get("content-length") ?? "0";
    if (!/^\d+$/.test(size) || Number(size) > LIMIT || headers.has("transfer-encoding")) { s.failed = true; return; }
    const end = boundary + 4 + Number(size);
    if (s.request.length < end) return;
    if (s.request.length !== end) { s.failed = true; return; }
    const body = s.request.subarray(boundary + 4, end);
    const allowedHost = this.dns.has(host) || this.rules.ips.includes(host);
    const directIp = ipString(s.ip);
    // A configured IP can intercept a request independently of its Host header.
    if (!allowedHost && !this.rules.ips.includes(directIp) && !this.rules.routes.some(r => r.ip === directIp)) { s.failed = true; return; }
    const note = (result: string, file?: string, appid?: number) => {
      if (this.interceptions.length === 128) this.interceptions.shift();
      this.interceptions.push({ host, ip: directIp, port: requestPort, path: path.split("?")[0], result, file, appid });
    };
    const route = this.rules.routes.find(r => (!r.host || r.host === host) && (!r.ip || r.ip === directIp) && (!r.port || r.port === requestPort) && (!r.method || r.method === method) && r.path === path);
    if (route) {
      const bytes = this.options.readFile?.(route.file);
      if (!bytes) { note("missing-file", route.file); s.response = http(404, new Uint8Array()); return; }
      note("local-file", route.file);
      s.response = http(200, bytes, "application/octet-stream"); return;
    }
    // Direct file URLs can resolve to the selected game's preloaded resource
    // directory. URL traversal and ambiguous query-driven endpoints need an
    // explicit rule; no host filesystem path is ever evaluated here.
    if (method === "GET" && !path.includes("?")) {
      let name = "";
      try { name = decodeURIComponent(path).replace(/^\/(?:mythroad(?:_res)?\/)?/, ""); } catch { /* unmatched */ }
      if (name && !name.includes("\\") && !name.split("/").some(p => !p || p === "." || p === "..")) {
        const bytes = this.options.readFile?.(name);
        if (bytes) { note("local-resource", name); s.response = http(200, bytes, "application/octet-stream"); return; }
      }
    }
    if (host === "spd.skymobiapp.com" && path === "/simpleDownload" && method === "POST") {
      const fields = records(body), appid = field32(fields, 0x29ce), product = field32(fields, 0x2775);
      if (appid === null || product === null) { note("invalid-download"); s.failed = true; return; }
      const file = this.rules.packages[String(appid)], bytes = file ? this.options.readFile?.(file) : null;
      if (!bytes) { note("missing-package", file, appid); s.response = http(404, new Uint8Array()); return; }
      note("local-package", file, appid);
      s.response = http(200, simpleDownload(bytes, appid, product)); return;
    }
    if (host === "www.sky-mobi.com" && path === "/" && method === "POST") {
      const request = legacyDownloadRequest(body);
      if (!request) { note("unsupported-legacy-command"); s.response = http(404, new Uint8Array()); return; }
      const file = this.rules.packages[String(request.appid)], bytes = file ? this.options.readFile?.(file) : this.options.readPackage?.(request.appid);
      const response = bytes ? legacyDownloadResponse(bytes, request.appid, request.sequence) : null;
      if (!response) { note(bytes ? "invalid-package" : "missing-package", file, request.appid); s.response = http(404, new Uint8Array()); return; }
      note("legacy-local-package", file, request.appid);
      s.response = http(200, response, "application/octet-stream"); return;
    }
    if (host !== "rop.skymobiapp.com" || method !== "POST") { note("unmatched"); s.failed = true; return; }
    let response: Uint8Array, stage = "";
    if (path === "/payOneAsTlv") {
      const fields = records(body);
      if (!fields) { s.failed = true; return; }
      stage = decoder.decode(fields.get(0x0452));
      const transaction = fields.get(0x045b);
      // Reference fixture: REG/PROP continuation echoes the transaction. No
      // forced plugin update; this local service uses the bundled v386 image.
      response = transaction?.length === 4 && ["REG", "PROP"].includes(stage)
        ? concat(tlv(101, transaction), tlv(100, u32(200)), tlv(200, new Uint8Array([12])))
        : concat(tlv(0x03f1, encoder.encode("000000006")), tlv(0x044f, u32(0)));
    } else if (path === "/payOne") {
      const form = new URLSearchParams(decoder.decode(body)), ids = form.getAll("msgid");
      if (ids.length !== 1 || !/^\d+$/.test(ids[0]) || Number(ids[0]) > 0xffffffff) { s.failed = true; return; }
      stage = "SMS-FIXTURE";
      response = concat(tlv(100, u32(200)), tlv(101, u32(Number(ids[0]))), tlv(200, new Uint8Array([1])));
    } else { note("unmatched"); s.failed = true; return; }
    note("legacy-service");
    if (this.requests.length < 128) this.requests.push({ host, path, stage });
    s.response = http(200, response);
  }
}

function http(status: number, body: Uint8Array, contentType = "application/x-tar"): Uint8Array {
  return concat(encoder.encode(`HTTP/1.1 ${status} ${status === 200 ? "OK" : "Not Found"}\r\nContent-Type: ${contentType}\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`), body);
}
function field32(fields: Map<number, Uint8Array> | null, tag: number): number | null {
  const b = fields?.get(tag); return b?.length === 4 ? new DataView(b.buffer, b.byteOffset, 4).getUint32(0) : null;
}
/** Native reference fixture: complete package plus size, MD5 and request IDs. */
function simpleDownload(bytes: Uint8Array, appid: number, product: number): Uint8Array {
  const metadata = concat(tlv(0x2c7, u32(1)), tlv(0x2be, u32(appid)), tlv(0x2bf, u32(0)),
    tlv(0x2c0, new Uint8Array()), tlv(0x2c1, new Uint8Array()), tlv(0x2c2, new Uint8Array(2)),
    tlv(0x2c3, u32(0)), tlv(0x2c4, u32(bytes.length)), tlv(0x2c5, md5Bytes(bytes)), tlv(0x2c6, u32(0)));
  return concat(tlv(0x64, u32(200)), tlv(0x65, u32(product)), tlv(0x6d, encoder.encode("00000000000000000001")),
    tlv(0x2bc, new Uint8Array([0,1])), tlv(0x2bd, metadata), tlv(0x2c3, u32(0)), tlv(0x2d1, bytes));
}
