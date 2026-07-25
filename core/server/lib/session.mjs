import { Client } from 'ssh2';
import { makeSSHConfig, setupSSHClient, hashCreds } from './utils.mjs';

export const sessions = new Map();

// Cleanup stale sessions every 60s
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > 1800000) { try { s.client.end(); } catch {} sessions.delete(id); }
  }
}, 60000);

export function findSession(host, port, username, authValue) {
  const credHash = authValue ? hashCreds(authValue) : null;
  const now = Date.now();
  console.log(`[findSession] looking for ${host}:${port||22}@${username} hash=${credHash}`);
  for (const [id, s] of sessions) {
    const stale = now - s.createdAt > 1800000;
    console.log(`[findSession] check: ${s.host}:${s.port}@${s.username} hash=${s.credHash} stale=${stale}`);
    if (s.host === host && s.port === (port || 22) && s.username === username) {
      if (!stale && (credHash === null || s.credHash === credHash)) {
        console.log('[findSession] ✓ found');
        return s.client;
      }
    }
  }
  console.log('[findSession] ✗ not found, sessions count:', sessions.size);
  return null;
}

// SFTP: always create a fresh connection (avoids channel conflicts with shell)
export async function withSessionSftp(body, fn, opts = {}) {
  const conn = new Client();
  setupSSHClient(conn, body.auth_value);
  console.log(`[SFTP] connecting ${body.host}:${body.port || 22} as ${body.username}`);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { conn.end(); } catch {}
      reject(new Error('SFTP timeout'));
    }, opts.timeout || 30000);
    const cfg = { ...makeSSHConfig(body), keepaliveInterval: 30000, keepaliveCountMax: 3 };
    const done = () => { clearTimeout(timeout); };
    conn.on('ready', () => {
      console.log(`[SFTP] connected, opening sftp subsystem...`);
      conn.sftp((err, sftp) => {
        if (err) {
          console.log(`[SFTP] sftp error:`, err.message);
          done(); try { conn.end(); } catch {} reject(err);
          return;
        }
        console.log(`[SFTP] sftp subsystem ready`);
        fn(sftp, conn).then(r => { done(); try { conn.end(); } catch {} resolve(r); })
          .catch(e => { done(); try { conn.end(); } catch {} reject(e); });
      });
    });
    conn.on('error', e => {
      console.log(`[SFTP] connection error:`, e.message);
      done(); try { conn.end(); } catch {} reject(e);
    });
    try { conn.connect(cfg); } catch (e) { done(); try { conn.end(); } catch {} reject(e); }
  });
}
