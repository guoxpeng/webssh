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

// Session-aware SFTP (reuses existing SSH connections)
export async function withSessionSftp(body, fn, opts = {}) {
  let conn = findSession(body.host, body.port, body.username, body.auth_value);
  let ownsClient = false;
  if (!conn) {
    conn = new Client();
    setupSSHClient(conn, body.auth_value);
    ownsClient = true;
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (ownsClient) { try { conn.end(); } catch {} reject(new Error('SFTP timeout')); }
      else { reject(new Error('SFTP timeout - session stalled')); }
    }, opts.timeout || 15000);
    const done = () => { clearTimeout(timeout); };
    const onReady = () => {
      conn.sftp((err, sftp) => {
        if (err) { done(); if (ownsClient) try { conn.end(); } catch {} reject(err); return; }
        fn(sftp, conn).then(r => { done(); resolve(r); }).catch(e => { done(); if (ownsClient) try { conn.end(); } catch {} reject(e); });
      });
    };
    if (ownsClient) {
      const cfg = { ...makeSSHConfig(body), keepaliveInterval: 30000, keepaliveCountMax: 3 };
      const credHash = body.auth_value ? hashCreds(body.auth_value) : null;
      const sessKey = `${body.host}_${body.port || 22}_${body.username || 'root'}_${credHash || 'noauth'}`;
      conn.on('ready', () => {
        sessions.set(sessKey, { client: conn, host: body.host, port: body.port || 22, username: body.username || 'root', credHash, createdAt: Date.now() });
        conn.on('close', () => sessions.delete(sessKey));
        ownsClient = false;
        onReady();
      });
      conn.on('error', e => { done(); try { conn.end(); } catch {} reject(e); });
      try { conn.connect(cfg); } catch (e) { done(); try { conn.end(); } catch {} reject(e); }
    } else {
      conn.on('error', e => { done(); reject(e); });
      onReady();
    }
  });
}
