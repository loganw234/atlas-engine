// Minimal CDP client over raw WebSocket - no dependencies.
// Enough for Runtime.evaluate against a headed Chrome started with
// --remote-debugging-port. 127.0.0.1 always: localhost resolves ::1
// first on this machine and costs ~2s per fresh socket.
import { connect } from "node:net";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";

const HOST = "127.0.0.1";

export function httpJson(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: HOST, port, path, method: "GET" }, res => {
      let b = "";
      res.on("data", d => b += d);
      res.on("end", () => { try { resolve(JSON.parse(b)); } catch (e) { resolve(b); } });
    });
    req.on("error", reject);
    req.end();
  });
}

export class WS {
  constructor() { this.buf = Buffer.alloc(0); this.handlers = new Map(); this.id = 0; this.onEvent = null; }

  connectTo(url) {
    const m = /^ws:\/\/([^:/]+):(\d+)(\/.*)$/.exec(url);
    if (!m) throw new Error("bad ws url " + url);
    const [, host, port, path] = m;
    return new Promise((resolve, reject) => {
      const key = randomBytes(16).toString("base64");
      const sock = connect({ host: HOST, port: +port }, () => {
        sock.write(
          `GET ${path} HTTP/1.1\r\nHost: ${host}:${port}\r\n` +
          `Upgrade: websocket\r\nConnection: Upgrade\r\n` +
          `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
      });
      this.sock = sock;
      let upgraded = false, headerBuf = Buffer.alloc(0);
      sock.on("data", d => {
        if (!upgraded) {
          headerBuf = Buffer.concat([headerBuf, d]);
          const idx = headerBuf.indexOf("\r\n\r\n");
          if (idx < 0) return;
          const hdr = headerBuf.slice(0, idx).toString();
          if (!/101/.test(hdr.split("\r\n")[0])) { reject(new Error("upgrade failed: " + hdr)); return; }
          const accept = createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
          if (!hdr.includes(accept)) { reject(new Error("bad accept")); return; }
          upgraded = true;
          this.buf = headerBuf.slice(idx + 4);
          this.pump();
          resolve();
          return;
        }
        this.buf = Buffer.concat([this.buf, d]);
        this.pump();
      });
      sock.on("error", reject);
    });
  }

  pump() {
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const op = b0 & 0x0f;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      const masked = (b1 & 0x80) !== 0;
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload = this.buf.slice(off + (masked ? 4 : 0), need);
      if (masked) {
        const mk = this.buf.slice(off, off + 4);
        payload = Buffer.from(payload.map((v, i) => v ^ mk[i & 3]));
      }
      this.buf = this.buf.slice(need);
      if (op === 1) {
        // CDP can fragment? assume FIN for our sizes
        try {
          const msg = JSON.parse(payload.toString("utf8"));
          if (msg.id !== undefined && this.handlers.has(msg.id)) {
            const h = this.handlers.get(msg.id);
            this.handlers.delete(msg.id);
            h(msg);
          } else if (this.onEvent) this.onEvent(msg);
        } catch (e) { /* ignore */ }
      } else if (op === 9) { this.sendFrame(payload, 10); }        // ping -> pong
      else if (op === 8) { try { this.sock.end(); } catch (e) {} }
    }
  }

  sendFrame(payload, op = 1) {
    const mask = randomBytes(4);
    const body = Buffer.from(payload);
    const masked = Buffer.from(body.map((v, i) => v ^ mask[i & 3]));
    let header;
    if (body.length < 126) header = Buffer.from([0x80 | op, 0x80 | body.length]);
    else if (body.length < 65536) {
      header = Buffer.alloc(4); header[0] = 0x80 | op; header[1] = 0x80 | 126;
      header.writeUInt16BE(body.length, 2);
    } else {
      header = Buffer.alloc(10); header[0] = 0x80 | op; header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(body.length), 2);
    }
    this.sock.write(Buffer.concat([header, mask, masked]));
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.handlers.set(id, msg => msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result));
      this.sendFrame(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.handlers.has(id)) { this.handlers.delete(id); reject(new Error("CDP timeout: " + method)); }
      }, 120000);
    });
  }

  close() { try { this.sock.end(); } catch (e) {} }
}

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
];

export async function launchChrome({ port = 9223, profile, url, fresh = false }) {
  const exe = CHROME_CANDIDATES.find(existsSync);
  if (!exe) throw new Error("chrome.exe not found");
  mkdirSync(profile, { recursive: true });
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-sync",
    "--disable-features=Translate", "--window-size=1280,900",
    "--window-position=2000,40",
    url,
  ];
  const child = spawn(exe, args, { detached: true, stdio: "ignore" });
  child.unref();
  // wait for the endpoint
  for (let i = 0; i < 100; i++) {
    try {
      const list = await httpJson(port, "/json/list");
      if (Array.isArray(list) && list.length) return { exe, port };
    } catch (e) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error("chrome debug endpoint never came up on " + port);
}

export async function pageSession(port, urlSubstring) {
  const list = await httpJson(port, "/json/list");
  const page = list.find(p => p.type === "page" && (!urlSubstring || (p.url || "").includes(urlSubstring)));
  if (!page) throw new Error("no page tab found; tabs: " + list.map(p => p.url).join(" | "));
  const ws = new WS();
  await ws.connectTo(page.webSocketDebuggerUrl);
  return ws;
}

export async function evalIn(ws, expr, { awaitPromise = true } = {}) {
  const r = await ws.send("Runtime.evaluate", {
    expression: expr, returnByValue: true, awaitPromise,
  });
  if (r.exceptionDetails) {
    throw new Error("page exception: " + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result.value;
}
