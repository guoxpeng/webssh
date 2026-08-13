// End-to-end smoke test.
// Boots a throwaway SSH target + the real webssh server in-process, then
// drives a genuine terminal session over the authenticated WebSocket:
//   health → WS auth (subprotocol) → SSH shell round-trip → host stats.
// Run:  node scripts/smoke.mjs   (exits 0 on success)
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'ssh2';
const { Server, utils } = pkg;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SSH_PORT = 2231;
const WEB_PORT = 19631;
const TOKEN = 'smoke-secret-token';
const USER = 'test', PASS = 'test123';

// The mock target regenerates its host key on every run, so its TOFU entry
// must be cleared before and after — otherwise the MITM guard (correctly)
// refuses the changed key.
const KNOWN_HOSTS = join(root, 'core', 'server', 'data', 'known_hosts.json');
function purgeKnownHost() {
  try {
    if (!existsSync(KNOWN_HOSTS)) return;
    const data = JSON.parse(readFileSync(KNOWN_HOSTS, 'utf8'));
    delete data[`127.0.0.1:${SSH_PORT}`];
    writeFileSync(KNOWN_HOSTS, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch {}
}
purgeKnownHost();

let failures = 0;
const pass = (m) => console.log('  PASS', m);
const fail = (m) => { failures++; console.log('  FAIL', m); };

function waitFor(fn, timeout = 8000, step = 120) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      try { if (await fn()) return resolve(true); } catch {}
      if (Date.now() - start > timeout) return reject(new Error('timeout'));
      setTimeout(tick, step);
    };
    tick();
  });
}

async function main() {
  // ── 1. Throwaway SSH target with an echo shell ──
  const { private: hostKey } = utils.generateKeyPairSync('rsa', { bits: 2048 });
  const sshd = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === USER && ctx.password === PASS) return ctx.accept();
      if (ctx.method === 'none') return ctx.reject(['password']);
      ctx.reject();
    }).on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        // webssh requests a pty (xterm) before the shell — must accept it.
        session.on('pty', (acc) => { if (process.env.SMOKE_DEBUG) console.log('[mock] pty requested'); acc(); });
        session.on('window-change', (acc) => acc && acc());
        // stats:1 arrives on an exec channel — return a canned /proc snapshot
        // so parseStats produces a valid host_stats payload.
        session.on('exec', (acc) => {
          if (process.env.SMOKE_DEBUG) console.log('[mock] exec requested');
          const stream = acc();
          stream.write('cpu  100 0 50 1000 0 0 0 0 0 0\ncpu  200 0 50 2000 0 0 0 0 0 0\n');
          stream.write('MEM 1073741824 429496729 536870912\nSWAP 0 0\n');
          stream.write('DISK 10737418240 3221225472 30%\nLOAD 0.50 0.40 0.30\n');
          stream.write('CPU_N 4\nUPTIME 12345\nRX 1000 2000\nTX 500 1500\n');
          stream.exit(0);
          stream.end();
        });
        session.on('shell', (acc) => {
          if (process.env.SMOKE_DEBUG) console.log('[mock] shell requested');
          const stream = acc();
          stream.write('MOCK-SHELL-READY\r\n');
          stream.on('data', (d) => {
            const cmd = d.toString().trim();
            if (cmd.startsWith('echo ')) stream.write(cmd.slice(5) + '\r\n');
            else if (cmd === 'exit') { stream.exit(0); stream.end(); }
            else if (cmd) stream.write('?\r\n');
          });
        });
      });
    });
  });
  await new Promise((r) => sshd.listen(SSH_PORT, '127.0.0.1', r));
  console.log(`[smoke] mock SSH target on :${SSH_PORT}`);

  // ── 2. Boot the real webssh server ──
  process.env.PORT = String(WEB_PORT);
  process.env.AUTH_TOKEN = TOKEN;
  process.env.NODE_ENV = 'production';
  const mod = await import(fileURLToPath(new URL('../core/server/index.mjs', import.meta.url)));
  const httpServer = mod.server;
  await waitFor(() => httpServer && httpServer.listening);
  console.log(`[smoke] webssh server on :${WEB_PORT}`);

  const WebSocket = (await import('ws')).default;

  // ── 3. HTTP health ──
  const health = await fetch(`http://127.0.0.1:${WEB_PORT}/health`).then(r => r.json());
  health && health.status === 'ok' ? pass('GET /health → ok') : fail('GET /health');

  // ── 4. WS auth: valid subprotocol opens, bad token is rejected ──
  const okAuth = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${WEB_PORT}/ws/ssh`, ['webssh-auth', TOKEN]);
    const t = setTimeout(() => { ws.terminate(); resolve(false); }, 4000);
    ws.on('open', () => { clearTimeout(t); ws.close(); resolve(true); });
    ws.on('error', () => { clearTimeout(t); resolve(false); });
  });
  okAuth ? pass('WS subprotocol auth accepted') : fail('WS subprotocol auth');

  const badAuth = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${WEB_PORT}/ws/ssh`, ['webssh-auth', 'wrong-token']);
    const t = setTimeout(() => { ws.terminate(); resolve(true); });
    ws.on('open', () => { clearTimeout(t); ws.close(); resolve(false); });
    ws.on('error', () => { clearTimeout(t); resolve(true); });
  });
  badAuth ? pass('WS bad token rejected') : fail('WS bad token was accepted');

  // ── 5. Full SSH round-trip over the WS ──
  const roundTrip = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${WEB_PORT}/ws/ssh`, ['webssh-auth', TOKEN]);
    let ready = false, echo = false, stats = false, sentEcho = false, sentStats = false;
    const t = setTimeout(() => { try { ws.close(); } catch {} resolve({ ready, echo, stats }); }, 12000);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        protocol: 'ssh', host: '127.0.0.1', port: SSH_PORT,
        username: USER, auth_type: 'password', auth_value: PASS,
      }));
    });
    ws.on('message', (data) => {
      const s = data.toString();
      if (process.env.SMOKE_DEBUG) console.log('[ws<-]', JSON.stringify(s.slice(0, 80)));
      if (s.startsWith('{"type":"ssh_ready"')) {
        ready = true; ws.send('echo smoke-ok\r'); sentEcho = true;
      } else if (s.includes('smoke-ok') && !echo) {
        echo = true; ws.send('stats:1'); sentStats = true;
      } else if (s.startsWith('{"type":"host_stats"')) {
        stats = true; clearTimeout(t); ws.close();
        resolve({ ready, echo, stats });
      }
    });
    ws.on('error', () => {});
  });
  roundTrip.ready ? pass('SSH session established (ssh_ready)') : fail('SSH session not established');
  roundTrip.echo ? pass('terminal echo round-trip') : fail('terminal echo round-trip');
  roundTrip.stats ? pass('stats:1 → host_stats reply') : fail('stats:1 → host_stats reply');

  sshd.close();
  purgeKnownHost();
  try { httpServer.close(); } catch {}
  console.log(failures === 0 ? '\nSMOKE_ALL_PASS' : `\nSMOKE_FAILED (${failures})`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('SMOKE_ERROR', e); process.exit(1); });
