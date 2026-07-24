import { connect } from 'cloudflare:sockets';
import { Client } from 'ssh2';
import { Duplex } from 'node:stream';

const SSH_ALGORITHMS = {
  // Prefer ECDH/Curve25519 (Web Crypto native); fallback to DH group14 (workerd polyfill)
  kex: ['curve25519-sha256', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group14-sha256'],
  // CTR/CBC handled by Web Crypto AES; GCM may work on newer workerd; ChaCha20-Poly1305 as last resort
  cipher: ['aes256-gcm@openssh.com', 'aes128-gcm@openssh.com', 'aes256-ctr', 'aes192-ctr', 'aes128-ctr', 'aes256-cbc', 'aes128-cbc', 'chacha20-poly1305@openssh.com'],
  serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'],
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
      console.error('[Worker SSH] createSSHConnection error:', err.message, err.stack?.split('\n').slice(0, 3).join(' | '));
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
    console.error('[Worker SSH] SSH test error:', e.message);
    return json({ success: false, error: [e.message] }, 500);
  }
}

/* ── API: SFTP ── */
async function handleSFTP(request, url) {
  const action = url.pathname.slice('/api/sftp/'.length);
  const body = await parseBody(request);
  const cfg = makeSSHConfig(body);

  try {
    const { conn } = await createSSHConnection(cfg);
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { try { conn.end(); } catch {} reject(new Error('SFTP timeout')); }, 15000);
      conn.sftp((err, sftp) => {
        if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }
        const done = (data) => {
          clearTimeout(timeout);
          try { conn.end(); } catch {}
          resolve(data);
        };
        const fail = (e) => {
          clearTimeout(timeout);
          try { conn.end(); } catch {}
          reject(e);
        };
        switch (action) {
          case 'list': {
            sftp.readdir(body.path || '/', (e, list) => {
              if (e) fail(e);
              else done(list.map(f => ({ name: f.filename, type: f.attrs.isDirectory() ? 'd' : '-', size: f.attrs.size, mode: f.attrs.mode.toString(8), mtime: f.attrs.mtime * 1000 })));
            });
            break;
          }
          case 'stat': {
            sftp.stat(body.path, (e, st) => {
              if (e) fail(e);
              else done({ size: st.size, mode: st.mode.toString(8), mtime: st.mtime * 1000 });
            });
            break;
          }
          case 'read': {
            const buffers = [];
            const readStream = sftp.createReadStream(body.path);
            readStream.on('data', (chunk) => buffers.push(chunk));
            readStream.on('end', () => done({ content: Buffer.concat(buffers).toString('base64') }));
            readStream.on('error', fail);
            break;
          }
          case 'write': {
            const content = body.encoding === 'base64' ? Buffer.from(body.content, 'base64') : body.content;
            sftp.writeFile(body.path, content, (e) => { if (e) fail(e); else done({ success: true }); });
            break;
          }
          case 'delete': {
            sftp.unlink(body.path, (e) => { if (e) fail(e); else done({ success: true }); });
            break;
          }
          case 'rmdir': {
            sftp.rmdir(body.path, (e) => { if (e) fail(e); else done({ success: true }); });
            break;
          }
          case 'mkdir': {
            sftp.mkdir(body.path, (e) => { if (e) fail(e); else done({ success: true }); });
            break;
          }
          case 'rename': {
            sftp.rename(body.srcPath, body.destPath, (e) => { if (e) fail(e); else done({ success: true }); });
            break;
          }
          case 'chmod': {
            const mode = parseInt(body.mode, 8);
            sftp.chmod(body.path, mode, (e) => { if (e) fail(e); else done({ success: true }); });
            break;
          }
          default:
            fail(new Error(`Unknown SFTP action: ${action}`));
        }
      });
    });
    return json(result);
  } catch (e) {
    console.error('[Worker SSH] SFTP error:', e.message);
    return json({ error: e.message }, 500);
  }
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
      await tcpSocket.opened;
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
        });
      });
      conn.on('error', (err) => {
        const msg = `\r\n\x1b[31m[SSH Error] ${err.message}\x1b[0m\r\n`;
        console.error('[Worker SSH] Terminal error:', err.message, err.stack?.split('\n').slice(0, 3).join(' | '));
        try { server.send(msg); } catch {}
      });
      conn.on('close', () => cleanup());
      conn.connect({ ...sshCfg, sock: stream, keepaliveInterval: 15000, keepaliveCountMax: 3 });
    } catch (e) {
      const msg = `\r\n\x1b[31m[Connection Error] ${e.message}\x1b[0m\r\n`;
      console.error('[Worker SSH] openSSH error:', e.message, e.stack?.split('\n').slice(0, 3).join(' | '));
      try { server.send(msg); } catch {}
      cleanup();
    }
  }

  server.addEventListener('message', (event) => {
    const str = String(event.data);
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
  const crypto = await import('node:crypto').then(m => m.default || m).catch(() => null);

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

    /* SSH test */
    if (url.pathname === '/api/ssh/test' && request.method === 'POST') {
      return handleSSHTest(request);
    }

    /* SFTP */
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

    /* Serve built frontend via ASSETS binding (Workers) or 404 (Pages without ASSETS) */
    if (env.ASSETS_STORE) {
      return env.ASSETS_STORE.fetch(request);
    }
    return json({ error: 'Not found', hint: 'If on Pages, ensure _worker.js is present and static files are deployed together.' }, 404);
  },
};
