import { connect } from 'cloudflare:sockets';
import { Client } from 'ssh2';
import { Duplex } from 'node:stream';

const SSH_ALGORITHMS = {
  kex: ['curve25519-sha256', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha256'],
  cipher: ['chacha20-poly1305@openssh.com', 'aes256-gcm@openssh.com', 'aes128-gcm@openssh.com', 'aes256-ctr', 'aes128-ctr'],
  serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-rsa'],
  hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
  compress: ['none'],
};

function makeSSHConfig(body) {
  const cfg = {
    host: body.host,
    port: body.port || 22,
    username: body.username || 'root',
    readyTimeout: 5000,
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
    super();
    this.tcpSocket = tcpSocket;
    this.reader = tcpSocket.readable.getReader();
    this.writer = tcpSocket.writable.getWriter();
    this.destroyedByClose = false;
    this.pump();
  }
  _read() {}
  _write(chunk, encoding, callback) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, encoding) : new Uint8Array(chunk);
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
  const tcpSocket = connect(`${cfg.host}:${cfg.port}`);
  await tcpSocket.opened;
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
          if (err) { try { server.send(JSON.stringify({ type: 'error', message: err.message })); } catch {} cleanup(); return; }
          shell = channel;
          channel.on('data', (data) => { try { if (server.readyState === 1) server.send(typeof data === 'string' ? data : new Uint8Array(data)); } catch {} });
          channel.stderr.on('data', (data) => { try { if (server.readyState === 1) server.send(typeof data === 'string' ? data : new Uint8Array(data)); } catch {} });
          channel.on('close', () => cleanup());
        });
      });
      conn.on('error', (err) => { try { server.send(JSON.stringify({ type: 'error', message: err.message })); } catch {} });
      conn.on('close', () => cleanup());
      conn.connect({ ...sshCfg, sock: stream, keepaliveInterval: 15000, keepaliveCountMax: 3 });
    } catch (e) {
      try { server.send(JSON.stringify({ type: 'error', message: e.message })); } catch {}
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
        else server.send(JSON.stringify({ type: 'error', message: 'Missing host or username' }));
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

/* ── Main fetch handler ── */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    /* Health */
    if (url.pathname === '/health') {
      return json({ status: 'ok', uptime: 'worker' });
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

    /* WebSocket terminal */
    if (url.pathname === '/ws/ssh') {
      return handleTerminalWS(request);
    }

    /* Serve built frontend via ASSETS binding */
    return env.ASSETS.fetch(request);
  },
};
