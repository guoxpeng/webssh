import { Client } from 'ssh2';
import { makeSSHConfig, setupSSHClient, hashCreds } from './utils.mjs';
import { sessions } from './session.mjs';

export function handleSSH(ws, config) {
  if (config.simulateError) {
    const tag = `[SSH SIM ${config.host}:${config.port}]`;
    setTimeout(() => {
      try { ws.send('\r\n\x1b[31m[SSH Error] Connection refused: simulateError is enabled\x1b[0m\r\n'); } catch {}
      setTimeout(() => { try { ws.close(1000); } catch {} }, 1000);
    }, 1500);
    return;
  }
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
  let closed = false;
  const closeAll = () => { if (closed) return; closed = true; try { client.end(); } catch {}; try { client.removeAllListeners(); } catch {}; if (sessionId && sessions.get(sessionId)?.client === client) sessions.delete(sessionId); try { ws.close(1000); } catch {}; };

  client.on('ready', () => {
    log('Connected');
    const credHash = config.auth_value ? hashCreds(config.auth_value) : null;
    const stdKey = `${cfg.host}_${cfg.port}_${cfg.username}_${credHash || 'noauth'}`;
    sessionId = stdKey;
    if (!sessions.has(stdKey)) {
      sessions.set(stdKey, { client, host: cfg.host, port: cfg.port, username: cfg.username, credHash, createdAt: Date.now() });
    }
    client.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
      if (err) { log('Shell error: ' + err.message); try { ws.send('\r\n\x1b[31m[Shell Error] ' + err.message + '\x1b[0m\r\n'); } catch {} closeAll(); return; }
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
      stream.on('error', (err) => { log('Stream error: ' + err.message); closeAll(); });
      stream.on('close', () => { log('Shell closed'); ws.removeListener('message', onWsMsg); closeAll(); });
      ws.on('close', () => { log('WS closed (SSH kept alive)'); ws.removeListener('message', onWsMsg); });
    });
  });
  client.on('error', (err) => {
    log('Error: ' + err.message);
    try { ws.send('\r\n\x1b[31m[Error] ' + err.message + '\x1b[0m\r\n'); } catch {}
    setTimeout(() => closeAll(), 500);
  });
  client.on('close', () => { log('Disconnected'); setTimeout(() => closeAll(), 100); });
  client.connect(cfg);
}
