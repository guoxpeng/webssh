import { connect } from 'cloudflare:sockets';
import { Client } from 'ssh2';
import { Duplex } from 'stream';

const SSH_ALGORITHMS = {
  // Pure JS polyfill enables ECDH + DH group14
  kex: ['ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group14-sha256'],
  // CTR/CBC handled by pure JS AES polyfill; GCM not yet implemented
  cipher: ['aes256-ctr', 'aes192-ctr', 'aes128-ctr', 'aes256-cbc', 'aes128-cbc'],
  serverHostKey: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'],
  hmac: ['hmac-sha2-256-etm@openssh.com', 'hmac-sha2-512-etm@openssh.com', 'hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
  compress: ['none'],
};

function makeSSHConfig(body) {
  const cfg = {
    host: body.host,
    port: body.port || 22,
    username: body.username || 'root',
    readyTimeout: 15000,
    algorithms: SSH_ALGORITHMS,
  };
  if (body.auth_value) {
    if (body.auth_type === 'key') cfg.privateKey = body.auth_value;
    else cfg.password = body.auth_value;
  }
  return cfg;
}

function setupSSHClient(client, password) {
  client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
    finish(prompts.map(() => password || ''));
  });
}

/* ── CloudflareSocketDuplex: wraps cloudflare:sockets TCP into stream.Duplex ── */
class CloudflareSocketDuplex extends Duplex {
  constructor(tcpSocket) {
    super({ highWaterMark: 64 * 1024 });
    this.tcpSocket = tcpSocket;
    this.reader = tcpSocket.readable.getReader();
    this.writer = tcpSocket.writable.getWriter();
    this.destroyedByClose = false;
    this.pump();
  }
  _read() {}
  _write(chunk, encoding, callback) {
    let bytes;
    if (chunk instanceof Uint8Array) {
      bytes = chunk;
    } else if (Buffer.isBuffer(chunk)) {
      bytes = new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
    } else if (typeof chunk === 'string') {
      bytes = new TextEncoder().encode(chunk);
    } else {
      bytes = new Uint8Array(chunk);
    }
    this.writer.write(bytes).then(() => callback(), callback);
  }
  _final(callback) {
    this.writer.close().then(() => callback(), callback);
  }
  _destroy(error, callback) {
    this.destroyedByClose = true;
    Promise.allSettled([this.reader.cancel(), this.writer.abort(error || undefined)])
      .then(() => this.tcpSocket.close())
      .then(() => callback(error))
      .catch((closeError) => callback(closeError || error));
  }
  async pump() {
    try {
      while (!this.destroyedByClose) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.push(Buffer.from(value));
      }
      this.push(null);
    } catch (error) {
      if (!this.destroyedByClose) this.destroy(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/* ── Connect via cloudflare:sockets + ssh2 ── */
async function createSSHConnection(cfg) {
  let tcpSocket;
  try {
    tcpSocket = connect(`${cfg.host}:${cfg.port}`);
  } catch (e) {
    throw new Error('cloudflare:sockets not available. Requires Workers Paid plan for TCP connections. Error: ' + e.message);
  }
  try {
    await tcpSocket.opened;
  } catch (e) {
    throw new Error('TCP connection failed to ' + cfg.host + ':' + cfg.port + ' — verify host is reachable. ' + e.message);
  }
  const stream = new CloudflareSocketDuplex(tcpSocket);
  const conn = new Client();
  setupSSHClient(conn, cfg.password);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { conn.end(); } catch {}
      reject(new Error('SSH connection timeout'));
    }, cfg.readyTimeout + 3000);
    conn.on('ready', () => {
      clearTimeout(timeout);
      resolve({ conn, stream });
    });
    conn.on('error', (err) => {
      clearTimeout(timeout);
      logError('createSSHConnection', err);
      reject(err);
    });
    conn.on('close', () => {
      clearTimeout(timeout);
    });
    conn.connect({ ...cfg, sock: stream, keepaliveInterval: 10000, keepaliveCountMax: 3 });
  });
}

/* ── Helpers ── */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff' },
  });
}

function parseBody(request) {
  return request.json().catch(() => ({}));
}

function logError(context, e) {
  console.error(`[Worker ${context}] ${e.message}${e.stack ? ' | ' + e.stack.split('\n').slice(0, 3).join(' | ') : ''}`);
}

/* ── API: SSH Test ── */
async function handleSSHTest(request) {
  const body = await parseBody(request);
  const node = body.node || body;
  const cfg = makeSSHConfig(node);
  const output = [];
  try {
    const { conn } = await createSSHConnection(cfg);
    const result = await new Promise((resolve) => {
      const timeout = setTimeout(() => { try { conn.end(); } catch {} resolve({ success: false, error: ['Timeout'] }); }, 10000);
      const cmds = body.cmds || ["echo 'Connection test OK' && date"];
      conn.exec(cmds.join(' && '), (err, channel) => {
        if (err) { clearTimeout(timeout); resolve({ success: false, error: [err.message] }); return; }
        channel.on('data', (d) => output.push(d.toString().trim()));
        channel.stderr.on('data', (d) => output.push(d.toString().trim()));
        channel.on('close', () => { clearTimeout(timeout); conn.end(); resolve({ success: true, output, time_elapsed: 0.5 }); });
      });
    });
    return json(result);
  } catch (e) {
    logError('SSH Test', e);
    return json({ success: false, error: [e.message] }, 500);
  }
}

/* ── WebSocket: SFTP ── */
async function handleSFTPWebSocket(request) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return json({ error: 'WebSocket required' }, 426);
  }
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  let conn = null;
  let sftp = null;
  let closed = false;

  const send = (msg) => {
    if (!closed && server.readyState === 1) {
      try { server.send(JSON.stringify(msg)); } catch {}
    }
  };

  function cleanup() {
    if (closed) return;
    closed = true;
    try { sftp?.end(); } catch {}
    try { conn?.end(); } catch {}
    try { server.close(); } catch {}
  }

  server.addEventListener('message', async (event) => {
    if (closed) return;
    const str = String(event.data);

    // Heartbeat
    if (str === '\x00hb\x00') return;
    let _ping;
    try { _ping = JSON.parse(str); } catch {}
    if (_ping?.type === 'ping') { send({ type: 'pong' }); return; }

    // First message: connection config
    if (!conn) {
      let cfgData;
      try { cfgData = JSON.parse(str); } catch {
        send({ type: 'status', status: 'error', error: 'Invalid config JSON' });
        return;
      }
      try {
        send({ type: 'status', status: 'connecting' });
        const { conn: c } = await createSSHConnection(makeSSHConfig(cfgData));
        conn = c;
        conn.sftp((err, sftpInstance) => {
          if (err) {
            send({ type: 'status', status: 'error', error: err.message });
            cleanup();
            return;
          }
          sftp = sftpInstance;
          send({ type: 'status', status: 'connected' });
        });
      } catch (e) {
        logError('SFTP connect', e);
        send({ type: 'status', status: 'error', error: e.message });
        cleanup();
      }
      return;
    }

    if (!sftp) return;

    let msg;
    try { msg = JSON.parse(str); } catch {
      send({ type: 'error', error: 'Invalid JSON' });
      return;
    }
    const { id, action, path, content, mode, srcPath, destPath, encoding } = msg;

    try {
      let result;
      switch (action) {
        case 'list': {
          const entries = await new Promise((resolve, reject) => {
            sftp.readdir(path || '/', (err, list) => {
              if (err) { reject(err); return; }
              resolve(list.filter(e => e.filename !== '.' && e.filename !== '..').map(e => ({
                name: e.filename,
                type: e.longname?.startsWith('d') ? 'dir' : 'file',
                size: e.attrs?.size || 0,
                mode: e.attrs?.mode || 0o644,
                mtime: e.attrs?.mtime ? new Date(e.attrs.mtime * 1000).toISOString() : null,
              })));
            });
          });
          result = { entries };
          break;
        }
        case 'stat': {
          const st = await new Promise((resolve, reject) => {
            sftp.stat(path, (err, st) => { if (err) reject(err); else resolve(st); });
          });
          result = { size: st.size, mode: st.mode, mtime: st.mtime ? new Date(st.mtime * 1000).toISOString() : null };
          break;
        }
        case 'read': {
          const chunks = [];
          await new Promise((resolve, reject) => {
            const stream = sftp.createReadStream(path);
            stream.on('data', c => chunks.push(c));
            stream.on('error', reject);
            stream.on('end', resolve);
          });
          result = { content: Buffer.concat(chunks).toString('base64') };
          break;
        }
        case 'write': {
          const buf = Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8');
          await new Promise((resolve, reject) => {
            sftp.writeFile(path, buf, (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        case 'delete': {
          await new Promise((resolve, reject) => {
            sftp.unlink(path, (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        case 'rmdir': {
          await new Promise((resolve, reject) => {
            sftp.rmdir(path, (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        case 'mkdir': {
          await new Promise((resolve, reject) => {
            sftp.mkdir(path, (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        case 'rename': {
          await new Promise((resolve, reject) => {
            sftp.rename(srcPath, destPath, (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        case 'chmod': {
          await new Promise((resolve, reject) => {
            sftp.chmod(path, parseInt(mode, 8), (err) => { if (err) reject(err); else resolve(); });
          });
          result = { success: true };
          break;
        }
        default:
          send({ id, error: 'Unknown action: ' + action });
          return;
      }
      send({ id, result });
    } catch (e) {
      send({ id, error: e.message });
    }
  });

  server.addEventListener('close', () => cleanup());
  server.addEventListener('error', () => cleanup());

  return new Response(null, { status: 101, webSocket: client });
}

/* ── API: SFTP (HTTP fallback) ── */
async function handleSFTP(request, url) {
  return json({ error: 'SFTP is not yet supported on Cloudflare Workers. Please use WebSocket (/ws/sftp) for SFTP access.' }, 501);
}

/* ── API: Docker ── */
async function handleDocker(request, url) {
  const body = await parseBody(request);
  const cfg = makeSSHConfig(body);
  try {
    const { conn } = await createSSHConnection(cfg);
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { try { conn.end(); } catch {} reject(new Error('Docker timeout')); }, 15000);
      let cmd = '';
      if (url.pathname.endsWith('/docker/ps')) {
        cmd = 'docker ps -a --format "{{json .}}" 2>/dev/null || docker ps -a --format "table {{.ID}}\t{{.Image}}\t{{.Status}}\t{{.Names}}" 2>&1';
      } else if (url.pathname.endsWith('/docker/exec')) {
        const action = body.action;
        if (action === 'logs') cmd = `docker logs ${body.containerId} 2>&1 | tail -100`;
        else if (action === 'start') cmd = `docker start ${body.containerId} 2>&1`;
        else if (action === 'stop') cmd = `docker stop ${body.containerId} 2>&1`;
        else if (action === 'restart') cmd = `docker restart ${body.containerId} 2>&1`;
        else cmd = `docker ${action} ${body.containerId} 2>&1`;
      } else {
        clearTimeout(timeout);
        conn.end();
        reject(new Error('Unknown Docker action'));
        return;
      }
      const output = [];
      conn.exec(cmd, (err, channel) => {
        if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }
        channel.on('data', (d) => output.push(d.toString()));
        channel.stderr.on('data', (d) => output.push(d.toString()));
        channel.on('close', () => { clearTimeout(timeout); conn.end(); resolve({ success: true, output: output.join('').trim() }); });
      });
    });
    return json(result);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

/* ── WebSocket: SSH Terminal ── */
async function handleTerminalWS(request) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return json({ error: 'WebSocket required' }, 426);
  }
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  let conn = null;
  let stream = null;
  let shell = null;
  let cfgData = null;

  function cleanup() {
    try { shell?.close(); } catch {}
    try { conn?.end(); } catch {}
    try { stream?.destroy(); } catch {}
    try { server.close(); } catch {}
  }

  async function openSSH() {
    try {
      const tcpSocket = connect(`${cfgData.host}:${cfgData.port || 22}`);
      await Promise.race([
        tcpSocket.opened,
        new Promise((_, reject) => setTimeout(() => reject(new Error('TCP connection timeout')), 15000)),
      ]);
      stream = new CloudflareSocketDuplex(tcpSocket);
      conn = new Client();
      setupSSHClient(conn, cfgData.auth_value);

      const sshCfg = makeSSHConfig(cfgData);
      conn.on('ready', () => {
        conn.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, channel) => {
          if (err) { try { server.send(`\r\n\x1b[31m[Shell Error] ${err.message}\x1b[0m\r\n`); } catch {} cleanup(); return; }
          shell = channel;
          channel.on('data', (data) => { try { if (server.readyState === 1) server.send(typeof data === 'string' ? data : new Uint8Array(data)); } catch {} });
          channel.stderr.on('data', (data) => { try { if (server.readyState === 1) server.send(typeof data === 'string' ? data : new Uint8Array(data)); } catch {} });
          channel.on('close', () => cleanup());
          try { server.send('{"type":"ssh_ready"}'); } catch {}
        });
      });
      conn.on('error', (err) => {
        logError('Terminal', err);
        try { server.send(`\r\n\x1b[31m[SSH Error] ${err.message}\x1b[0m\r\n`); } catch {}
      });
      conn.on('close', () => cleanup());
      conn.connect({ ...sshCfg, sock: stream, keepaliveInterval: 15000, keepaliveCountMax: 3 });
    } catch (e) {
      logError('openSSH', e);
      try { server.send(`\r\n\x1b[31m[Connection Error] ${e.message}\x1b[0m\r\n`); } catch {}
      cleanup();
    }
  }

  server.addEventListener('message', (event) => {
    const str = String(event.data);
    // Heartbeat
    if (str === '\x00hb\x00') return;
    let _ping;
    try { _ping = JSON.parse(str); } catch {}
    if (_ping?.type === 'ping') { try { server.send('{"type":"pong"}'); } catch {} return; }
    // First message contains the connection config as JSON
    if (!conn && !cfgData) {
      try {
        cfgData = JSON.parse(str);
        if (cfgData.host && cfgData.username) openSSH();
        else server.send('\r\n\x1b[31mMissing host or username\x1b[0m\r\n');
      } catch {
        server.send(JSON.stringify({ type: 'error', message: 'Invalid config JSON' }));
      }
      return;
    }
    if (!shell) return;
    if (str.startsWith('resize:')) {
      const [_, rs, cs] = str.split(':');
      const rows = parseInt(rs, 10);
      const cols = parseInt(cs, 10);
      if (rows && cols && shell.setWindow) shell.setWindow(rows, cols);
      return;
    }
    shell.write(str);
  });

  server.addEventListener('close', () => cleanup());
  server.addEventListener('error', () => cleanup());

  return new Response(null, { status: 101, webSocket: client });
}

/* ── Crypto Diagnostic ── */
async function handleDiagnostic() {
  const results = {};
  const crypto = require('crypto');

  function test(name, fn) {
    try { results[name] = fn(); } catch (e) { results[name] = `FAIL: ${e.message}`; }
  }

  if (!crypto) {
    results.crypto_import = 'FAIL: node:crypto not available';
    return json(results);
  }
  results.crypto_import = 'OK';

  const key16 = new Uint8Array(16).fill(0x42);
  const key32 = new Uint8Array(32).fill(0x42);
  const iv16 = new Uint8Array(16).fill(0x00);

  test('randomBytes', () => crypto.randomBytes ? 'OK' : 'MISSING');
  test('randomFill', () => crypto.randomFill ? 'OK' : 'MISSING');
  test('createHmac', () => crypto.createHmac ? 'OK' : 'MISSING');
  test('createHash', () => crypto.createHash ? 'OK' : 'MISSING');
  test('createSign', () => crypto.createSign ? 'OK' : 'MISSING');
  test('createVerify', () => crypto.createVerify ? 'OK' : 'MISSING');
  test('createDiffieHellman', () => crypto.createDiffieHellman ? 'OK' : 'MISSING');
  test('createECDH', () => crypto.createECDH ? 'OK' : 'MISSING');
  test('createCipheriv', () => crypto.createCipheriv ? 'OK' : 'MISSING');
  test('createDecipheriv', () => crypto.createDecipheriv ? 'OK' : 'MISSING');

  test('hmac_sha256', () => { crypto.createHmac('sha256', key16).update('test').digest(); return 'OK'; });
  test('hash_sha256', () => { crypto.createHash('sha256').update('test').digest(); return 'OK'; });

  test('cipher_aes256ctr', () => { const c = crypto.createCipheriv('aes-256-ctr', key32, iv16.slice(0,16)); c.update('test','utf8','hex'); c.final('hex'); return 'OK'; });
  test('cipher_aes128ctr', () => { const c = crypto.createCipheriv('aes-128-ctr', key16, iv16.slice(0,16)); c.update('test','utf8','hex'); c.final('hex'); return 'OK'; });
  test('cipher_aes256gcm', () => { const c = crypto.createCipheriv('aes-256-gcm', key32, iv16.slice(0,12)); c.update('test','utf8','hex'); c.final('hex'); return 'OK'; });
  test('cipher_aes256cbc', () => { const c = crypto.createCipheriv('aes-256-cbc', key32, iv16); c.update('test','utf8','hex'); c.final('hex'); return 'OK'; });
  test('cipher_aes128cbc', () => { const c = crypto.createCipheriv('aes-128-cbc', key16, iv16); c.update('test','utf8','hex'); c.final('hex'); return 'OK'; });

  test('ecdh_p256', () => { const e = crypto.createECDH('prime256v1'); e.generateKeys(); return 'OK'; });
  test('dh_group14', () => { const d = crypto.createDiffieHellman('modp14'); d.generateKeys(); return 'OK'; });

  test('verify_rsa_sha256', () => {
    const v = crypto.createVerify('sha256');
    v.update(Buffer.from('SGVsbG8gV29ybGQgU1NI', 'base64'));
    const pub = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6eBbE5kYs2HMJ9mS0eiF\nMk04LgUn0xGz4ZCPS5lJRaPNrYb4E2NcDbGvgnGRl0wlfo5Oji0AaJFqcO8R/xiq\n1WI/3C+YuM7hVEiQdA8btCNmOeQkukUBPJdyLDTEcU3L8zv1b7Qw2/peiJP9IGH3\ni9sLueT3cm5z57+vyvIGGIvoWT74Ij3GIriGUn5S7oe4sOV4o7ufPRj54RYkGZ3g\ndhmNVbSmnJbXAcy6Wlqc8q4JsGyN+agDpzGJYoGPjHLyNPSzKzA2KDIvzrHikw03\na5god9Q0Veb9fqxwDwyF6ApA7UD6G6xBp4ULDoEUaR7I1mLT+Y2Eh133ZG32PTZR\nywIDAQAB\n-----END PUBLIC KEY-----';
    const sig = Buffer.from('K+9Sy1uckYmfw76r8m5SF9gTaVmG95mkZhrJQCv3S2Be3KGpo+U84pYTOiMT5xoBw5pY9yge48S3B9rvFThen4rzzYb0aHDKICqqeMK6tsRxJQSwRsVPkSVSuuxl2Iw+UEg5jguDq7JBwFAd0FIVgZjuivSX7TWUWcvohRiFbh8RlASBrV/LM39SD4IYHvIvPFRoglArgsucN7C/tsWoA69gWh7VTou/kBUwl4LouQCVObEnpYfM9J5HjGdDj2KdQAvoo/G8CME8VBB1uKInaqZuxou9V+kwGuOeQBhP4lkjkZU3pgLCWCuZTo8+Tgf4OcLX+kECx/35/5OKUOQ/mw==', 'base64');
    const result = v.verify(pub, sig);
    return result ? 'OK' : 'FAIL (verify returned false)';
  });
  test('sign_rsa_sha256', () => {
    // Minimal test: createSign() does not throw
    const s = crypto.createSign('sha256');
    s.update(Buffer.from('test'));
    return 'OK';
  });

  test('ssh2_import', () => {
    try { const { Client } = require('ssh2'); return Client ? 'OK' : 'NULL'; }
    catch (ee) { return `FAIL: ${ee.message}`; }
  });

  return json(results);
}

/* ── Main fetch handler ── */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* Health */
    if (url.pathname === '/health') {
      return json({ status: 'ok', uptime: 'worker' });
    }

    /* Crypto diagnostic */
    if (url.pathname === '/api/diag') {
      return handleDiagnostic();
    }

    /* SFTP WebSocket */
    if (url.pathname === '/ws/sftp') {
      return handleSFTPWebSocket(request);
    }

    /* SSH test */
    if (url.pathname === '/api/ssh/test' && request.method === 'POST') {
      return handleSSHTest(request);
    }

    /* SFTP HTTP API (returns 501 — use WebSocket instead) */
    if (url.pathname.startsWith('/api/sftp/') && request.method === 'POST') {
      return handleSFTP(request, url);
    }

    /* Docker */
    if (url.pathname.startsWith('/api/docker/') && request.method === 'POST') {
      return handleDocker(request, url);
    }

    /* Chat Bot API (WebSocket terminal + Docker only, chat requires Node.js backend) */
    if (url.pathname.startsWith('/api/chat/')) {
      return json({ error: 'Chat bot requires Node.js backend (Docker/VPS). Not available in Cloudflare Workers.' }, 501);
    }

    /* WebSocket terminal */
    if (url.pathname === '/ws/ssh') {
      return handleTerminalWS(request);
    }

    /* Serve built frontend via ASSETS binding (Workers format) or fall through to Pages static assets */
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return; // Let CF Pages serve static files for unmatched routes
  },
};
