// Guacamole protocol bridge for RDP / VNC remote desktop.
//
// The browser never talks to guacd directly: this module performs the
// Guacamole handshake server-side (select → args → size/audio/video/image →
// connect), then relays instructions between the browser WebSocket and guacd.
// Credentials therefore stay on the server and never appear in URLs.
import { createConnection } from 'net';
import { GUACD_HOST, GUACD_PORT } from './config.mjs';
import { logger } from './logger.mjs';

const log = logger('GUACD');

// ── Guacamole instruction framing ("3.rdp,5.value;") ──
export function encodeInstruction(opcode, args = []) {
  let out = `${String(opcode).length}.${opcode}`;
  for (const a of args) {
    const s = String(a ?? '');
    out += `,${s.length}.${s}`;
  }
  return out + ';';
}

// Incremental parser: consumes as many complete instructions as possible,
// returns { instructions: [[opcode, ...args], ...], rest: leftover }.
export function parseInstructions(text) {
  const instructions = [];
  let pos = 0;
  while (pos < text.length) {
    const args = [];
    let cur = pos;
    let complete = false;
    while (cur < text.length) {
      const dot = text.indexOf('.', cur);
      if (dot === -1) break;
      const lenStr = text.slice(cur, dot);
      if (!/^\d+$/.test(lenStr)) { cur = text.length; break; } // malformed — drop
      const len = parseInt(lenStr, 10);
      const valueStart = dot + 1;
      const valueEnd = valueStart + len;
      if (valueEnd > text.length) break; // value incomplete — wait for more data
      args.push(text.slice(valueStart, valueEnd));
      const delim = text[valueEnd];
      if (delim === ',') { cur = valueEnd + 1; continue; }
      if (delim === ';') { cur = valueEnd + 1; complete = true; break; }
      cur = text.length; // malformed delimiter — drop
      break;
    }
    if (!complete) return { instructions, rest: text.slice(pos) };
    if (args.length) instructions.push(args);
    pos = cur;
  }
  return { instructions, rest: '' };
}

// Map our NodeConfig onto guacd connection parameters.
function buildConnectParams(config, proto, argNames) {
  const params = {
    hostname: String(config.host || ''),
    port: String(config.port || (proto === 'vnc' ? 5900 : 3389)),
    username: String(config.username || ''),
    password: String(config.auth_value || ''),
    security: 'any',
    'ignore-cert': 'true',
    'resize-method': 'display-update',
    // Keep the relay light on slow links
    'enable-wallpaper': 'false',
    'enable-theming': 'false',
    'enable-font-smoothing': 'false',
    'enable-full-window-drag': 'false',
    'enable-desktop-composition': 'false',
    'enable-menu-animations': 'false',
    'color-depth': '16',
  };
  return argNames.map((name) => params[name] ?? '');
}

export function handleGuacdWS(ws, config) {
  const proto = String(config.protocol || '').toLowerCase() === 'vnc' ? 'vnc' : 'rdp';
  const width = Math.max(320, Math.min(7680, parseInt(config.width, 10) || 1280));
  const height = Math.max(240, Math.min(4320, parseInt(config.height, 10) || 800));
  const dpi = 96;
  const tag = `${proto.toUpperCase()} ${config.host}`;
  let tcp = null;
  let closed = false;
  let handshakeDone = false;
  let buffer = '';

  const cleanup = () => {
    if (closed) return;
    closed = true;
    try { tcp?.destroy(); } catch {}
    try { ws.close(1000); } catch {}
  };
  const fail = (message) => {
    log.error(tag, message);
    try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', message })); } catch {}
    cleanup();
  };
  const send = (inst) => { if (tcp?.writable) tcp.write(inst); };

  try {
    tcp = createConnection({ host: GUACD_HOST, port: GUACD_PORT }, () => {
      log.info(`${tag}: guacd reachable, starting handshake`);
      send(encodeInstruction('select', [proto]));
    });
  } catch (e) {
    fail(`guacd 服务不可用：${e.message}`);
    return;
  }

  tcp.on('error', (err) => {
    fail(`无法连接 guacd 服务（${GUACD_HOST}:${GUACD_PORT}）：${err.message}。自建服务器请在 docker-compose 里启用 guacd 服务后重试；Cloudflare 部署不支持远程桌面。`);
  });

  const onInstructions = (instructions) => {
    for (const inst of instructions) {
      const [opcode, ...args] = inst;
      if (!handshakeDone) {
        if (opcode === 'args') {
          send(encodeInstruction('size', [String(width), String(height), String(dpi)]));
          send(encodeInstruction('audio', ['audio/L8', 'audio/L16']));
          send(encodeInstruction('video', []));
          send(encodeInstruction('image', ['image/png', 'image/jpeg']));
          send(encodeInstruction('timezone', ['']));
          send(encodeInstruction('connect', buildConnectParams(config, proto, args)));
        } else if (opcode === 'ready') {
          handshakeDone = true;
          log.info(`${tag}: session ready`);
          try { ws.send(JSON.stringify({ type: 'guac_ready' })); } catch {}
        } else if (opcode === 'error') {
          const msg = args[0] || '未知错误';
          const friendly = /authenticat|credential|denied|password/i.test(msg)
            ? `认证失败，请核对用户名和密码（${msg}）`
            : `远程桌面连接失败：${msg}`;
          fail(friendly);
          return;
        }
        continue;
      }
      // Post-handshake: relay every instruction to the browser verbatim.
      try { if (ws.readyState === 1) ws.send(encodeInstruction(opcode, args)); } catch {}
    }
  };

  tcp.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    if (buffer.length > 8 * 1024 * 1024) { fail('数据缓冲溢出，连接已重置'); return; }
    const { instructions, rest } = parseInstructions(buffer);
    buffer = rest;
    if (instructions.length) onInstructions(instructions);
  });

  // Browser → guacd: messages arriving here are already-framed Guacamole
  // instructions (key / mouse / size) produced by the frontend tunnel.
  const onWsMsg = (data) => {
    if (!handshakeDone || closed) return;
    if (tcp?.writable) tcp.write(data.toString());
  };
  ws.on('message', onWsMsg);

  tcp.on('close', () => { log.info(`${tag}: guacd closed`); cleanup(); });
  ws.on('close', () => { log.debug(`${tag}: WS closed`); ws.removeListener('message', onWsMsg); cleanup(); });
  ws.on('error', () => cleanup());
}
