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

// SFTP connection pool (separate from terminal shell sessions)
const sftpPool = new Map();

function getPoolKey(body) {
  return `${body.host}:${body.port || 22}:${body.username}:${hashCreds(body.auth_value || '')}`;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, e] of sftpPool) {
    if (!e.busy && now - e.lastUsed > 300000) {
      try { e.conn.end(); } catch {}
      sftpPool.delete(key);
    }
  }
}, 60000);

export async function withSessionSftp(body, fn, opts = {}) {
  const key = getPoolKey(body);
  console.log('[SFTP] withSessionSftp key:', key);
  const idle = sftpPool.get(key);

  if (idle && !idle.busy) {
    console.log('[SFTP] reusing idle connection');
    idle.busy = true;
    const timeout = setTimeout(() => {
      idle.busy = false;
    }, opts.timeout || 30000);
    try {
      return await fn(idle.sftp, idle.conn);
    } catch (e) {
      sftpPool.delete(key);
      try { idle.conn.end(); } catch {}
      throw e;
    } finally {
      clearTimeout(timeout);
      idle.busy = false;
      idle.lastUsed = Date.now();
    }
  }

  console.log('[SFTP] creating new SSH connection');
  const conn = new Client();
  setupSSHClient(conn, body.auth_value);
  const cfg = { ...makeSSHConfig(body), keepaliveInterval: 30000, keepaliveCountMax: 3 };
  console.log('[SFTP] SSH config:', cfg.host, cfg.port, cfg.username, cfg.password ? 'has_password' : cfg.privateKey ? 'has_key' : 'NO_AUTH');

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.log('[SFTP] TIMEOUT - connection took too long');
      try { conn.end(); } catch {}
      reject(new Error('SFTP timeout'));
    }, opts.timeout || 30000);
    const done = () => clearTimeout(timeout);

    conn.on('ready', () => {
      console.log('[SFTP] SSH ready, calling sftp()');
      conn.sftp((err, sftp) => {
        if (err) {
          console.log('[SFTP] sftp() error:', err.message);
          done(); try { conn.end(); } catch {} reject(err);
          return;
        }
        console.log('[SFTP] sftp() success');
        const entry = { conn, sftp, busy: true, lastUsed: Date.now() };
        sftpPool.set(key, entry);

        const exec = () => fn(sftp, conn);
        exec().then(r => {
          done();
          entry.busy = false;
          entry.lastUsed = Date.now();
          resolve(r);
        }).catch(e => {
          console.log('[SFTP] exec error:', e.message);
          done();
          sftpPool.delete(key);
          try { conn.end(); } catch {}
          reject(e);
        });
      });
    });
    conn.on('error', e => {
      console.log('[SFTP] SSH error:', e.message);
      sftpPool.delete(key);
      done(); try { conn.end(); } catch {} reject(e);
    });
    try { conn.connect(cfg); } catch (e) {
      console.log('[SFTP] connect() threw:', e.message);
      sftpPool.delete(key);
      done(); try { conn.end(); } catch {} reject(e);
    }
  });
}
