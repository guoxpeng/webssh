import { createConnection } from 'net';

export function handleTelnet(ws, config) {
  const host = config.host;
  const port = config.port || 23;
  const username = config.username;
  const password = config.auth_value;
  const tag = `[TELNET ${host}:${port}]`;
  const log = (m) => console.log(`${tag} ${m}`);
  let tcp = null;
  let loginSent = false;
  let userIndex = 0, passIndex = 0;
  const cleanup = () => { try { tcp?.destroy(); } catch {}; try { ws.close(); } catch {}; };

  const tryLogin = (chunk) => {
    if (!username || loginSent) return;
    const text = chunk.toString('utf8').toLowerCase();
    if (text.includes('login:') || text.includes('username:') || text.includes('user:')) {
      if (!userIndex) { userIndex++; tcp?.write(username + '\n'); log('Sent username'); }
    } else if (text.includes('password:')) {
      if (password && !passIndex) { passIndex++; tcp?.write(password + '\n'); log('Sent password'); }
    }
    if (text.includes('$') || text.includes('#') || text.includes('>') || text.includes('Last login')) {
      loginSent = true;
      log('Login complete');
    }
  };

  try {
    tcp = createConnection({ host, port }, () => {
      log('Connected');
      ws.send(JSON.stringify({ type: 'status', message: 'connected' }));
      if (username) tcp?.write('\n');
    });
    const onWsMsg = (input) => { if (tcp?.writable) tcp.write(input.toString()); };
    ws.on('message', onWsMsg);
    tcp.on('data', (c) => {
      if (ws.readyState === 1) ws.send(c.toString());
      if (!loginSent) tryLogin(c);
    });
    tcp.on('close', () => { log('Disconnected'); ws.removeListener('message', onWsMsg); cleanup(); });
    tcp.on('error', (err) => { log('Error: ' + err.message); try { ws.send(JSON.stringify({ type: 'error', message: err.message })); } catch {} cleanup(); });
    ws.on('close', () => { log('WS closed'); tcp?.destroy(); ws.removeListener('message', onWsMsg); });
  } catch (e) {
    log('Connection failed: ' + e.message);
    try { ws.send(JSON.stringify({ type: 'error', message: e.message })); } catch {}
    cleanup();
  }
}
