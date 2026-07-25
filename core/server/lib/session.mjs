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
  for (const [id, s] of sessions) {
    if (s.host === host && s.port === (port || 22) && s.username === username) {
      if (credHash === null || s.credHash === credHash) return s.client;
    }
  }
  return null;
}

// SFTP: always create a fresh connection (avoids channel conflicts with shell)
export async function withSessionSftp(body, fn, opts = {}) {
  const conn = new Client();
  setupSSHClient(conn, body.auth_value);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { conn.end(); } catch {}
      reject(new Error('SFTP timeout'));
    }, opts.timeout || 30000);
    const cfg = { ...makeSSHConfig(body), keepaliveInterval: 30000, keepaliveCountMax: 3 };
    const done = () => { clearTimeout(timeout); };
    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          done(); try { conn.end(); } catch {} reject(err);
          return;
        }
        fn(sftp, conn).then(r => { done(); try { conn.end(); } catch {} resolve(r); })
          .catch(e => { done(); try { conn.end(); } catch {} reject(e); });
      });
    });
    conn.on('error', e => {
      done(); try { conn.end(); } catch {} reject(e);
    });
    try { conn.connect(cfg); } catch (e) { done(); try { conn.end(); } catch {} reject(e); }
  });
}
