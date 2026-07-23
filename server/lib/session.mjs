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
    if (s.host === host && s.port === (port || 22) && s.username === username && s.credHash === credHash) return s.client;
  }
  return null;
}

// Non-reusable SFTP (creates a new SSH connection each time)
export async function withSftp(body, fn) {
  if (!body?.host) throw new Error('Host is required');
  const conn = new Client();
  setupSSHClient(conn, body.auth_value);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { conn.end(); } catch {}
      reject(new Error('SFTP connection timeout'));
    }, 10000);
    conn.on('ready', () => {
      clearTimeout(timeout);
      conn.sftp((err, sftp) => {
        if (err) { clearTimeout(timeout); conn.end(); reject(err); return; }
        fn(sftp, conn).then(resolve).catch(reject).finally(() => { clearTimeout(timeout); try { conn.end(); } catch {} });
      });
    });
    conn.on('error', (err) => { clearTimeout(timeout); reject(err); });
    conn.on('close', () => { clearTimeout(timeout); });
    const cfg = makeSSHConfig(body);
    try { conn.connect(cfg); } catch (e) { clearTimeout(timeout); reject(e); }
  });
}

// Session-aware SFTP (reuses existing SSH connections)
export async function withSessionSftp(body, fn) {
  let conn = findSession(body.host, body.port, body.username, body.auth_value);
  let ownsClient = false;
  if (!conn) {
    conn = new Client();
    setupSSHClient(conn, body.auth_value);
    ownsClient = true;
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { if (ownsClient) try { conn.end(); } catch {} reject(new Error('SFTP timeout')); }, 15000);
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
      onReady();
    }
  });
}
