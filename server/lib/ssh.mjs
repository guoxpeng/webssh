import { Client } from 'ssh2';
import { makeSSHConfig, setupSSHClient } from './utils.mjs';
import { sessions } from './session.mjs';
import { audit } from './audit.mjs';

export function handleSSH(ws, config) {
  const client = new Client();
  setupSSHClient(client, config.auth_value);
  const cfg = {
    ...makeSSHConfig(config),
    keepaliveInterval: 30000,
    keepaliveCountMax: 3,
  };
  const tag = `[SSH ${cfg.host}:${cfg.port}]`;
  let sessionId = null;
  const log = (m) => console.log(`${tag} ${m}`);
  const cleanup = () => { if (sessionId && sessions.get(sessionId)?.client === client) sessions.delete(sessionId); try { client.end(); } catch {}; try { ws.close(); } catch {}; try { client.removeAllListeners(); } catch {}; try { ws.removeAllListeners(); } catch {}; };

  client.on('ready', () => {
    log('Connected');
    audit('ssh_connected', { host: cfg.host, port: cfg.port, username: cfg.username });
    const stdKey = `${cfg.host}_${cfg.port}_${cfg.username}`;
    sessionId = stdKey;
    if (!sessions.has(stdKey)) {
      sessions.set(stdKey, { client, host: cfg.host, port: cfg.port, username: cfg.username, createdAt: Date.now() });
    }
    client.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
      if (err) { log('Shell error: ' + err.message); try { ws.send('\r\n\x1b[31m[Shell Error] ' + err.message + '\x1b[0m\r\n'); } catch {} cleanup(); return; }
      const onWsMsg = (input) => {
        const str = input.toString();
        if (str.startsWith('resize:')) {
          const [_, rs, cs] = str.split(':');
          const rows = parseInt(rs, 10);
          const cols = parseInt(cs, 10);
          if (rows && cols && stream.setWindow) stream.setWindow(rows, cols);
          return;
        }
        if (stream.writable) stream.write(str);
      };
      ws.on('message', onWsMsg);
      stream.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
      stream.stderr.on('data', (c) => { if (ws.readyState === 1) ws.send(c.toString()); });
      stream.on('close', () => { log('Shell closed'); ws.removeListener('message', onWsMsg); cleanup(); });
      ws.on('close', () => { log('WS closed (SSH kept alive)'); ws.removeListener('message', onWsMsg); });
    });
  });
  client.on('error', (err) => {
    log('Error: ' + err.message);
    audit('ssh_error', { host: cfg.host, port: cfg.port, username: cfg.username, error: err.message });
    try { ws.send('\r\n\x1b[31m[Error] ' + err.message + '\x1b[0m\r\n'); } catch {}
    setTimeout(() => cleanup(), 500);
  });
  client.on('close', () => { log('Disconnected'); audit('ssh_disconnected', { host: cfg.host, port: cfg.port, username: cfg.username }); cleanup(); });
  client.connect(cfg);
}
