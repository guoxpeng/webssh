import { Client } from 'ssh2';
import { makeSSHConfig, setupSSHClient, hashCreds } from './utils.mjs';
import { logger } from './logger.mjs';

export const sessions = new Map();
const log = logger('Session');

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > 1800000) { try { s.client.end(); } catch {} sessions.delete(id); }
  }
}, 60000);

export function findSession(host, port, username, authValue) {
  const credHash = authValue ? hashCreds(authValue) : null;
  // SECURITY (H1): never reuse a session without presenting matching
  // credentials — the old `credHash === null` shortcut let anonymous callers
  // exec inside someone else's live session.
  if (!credHash) return null;
  for (const [id, s] of sessions) {
    if (s.host === host && s.port === (port || 22) && s.username === username && s.credHash === credHash) {
      return s.client;
    }
  }
  return null;
}

const sftpPool = new Map();
const sftpLog = logger('SFTP');

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

function runWithTimeout(promiseFn, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('SFTP timeout')), timeoutMs);
    promiseFn().then(r => { clearTimeout(timer); resolve(r); }).catch(e => { clearTimeout(timer); reject(e); });
  });
}

export async function withSessionSftp(body, fn, opts = {}) {
  const key = getPoolKey(body);
  const longLived = !!opts.longLived;
  sftpLog.debug('withSessionSftp key: ' + key);

  // Long-lived callers (the SFTP WebSocket) own a dedicated SSH connection for
  // the socket's whole lifetime. They must never share the pooled channel — one
  // ssh2 SFTP channel cannot serve two clients concurrently — and they must
  // never leave a dead channel in the pool when the socket closes.
  if (!longLived) {
    const idle = sftpPool.get(key);
    if (idle && !idle.busy) {
      sftpLog.debug('reusing idle connection');
      if (idle.conn && !idle.conn._sock?.writable) {
        sftpLog.warn('stale connection detected, removing from pool');
        sftpPool.delete(key);
        try { idle.conn.end(); } catch {}
      } else {
        idle.busy = true;
        try {
          return await runWithTimeout(() => fn(idle.sftp, idle.conn), opts.timeout || 30000);
        } catch (e) {
          sftpPool.delete(key);
          try { idle.conn.end(); } catch {}
          throw e;
        } finally {
          idle.busy = false;
          idle.lastUsed = Date.now();
        }
      }
    }
  }

  sftpLog.info(longLived ? 'creating dedicated SSH connection' : 'creating new SSH connection');
  const conn = new Client();
  setupSSHClient(conn, body.auth_value);
  const cfg = { ...makeSSHConfig(body), keepaliveInterval: 15000, keepaliveCountMax: 2 };
  sftpLog.debug(`config: ${cfg.host} ${cfg.port} ${cfg.username} ${cfg.password ? 'password' : cfg.privateKey ? 'key' : 'NO_AUTH'}`);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      sftpLog.error('connection timeout');
      try { conn.end(); } catch {}
      reject(new Error('SFTP timeout'));
    }, opts.timeout || 30000);
    const done = () => clearTimeout(timeout);

    conn.on('ready', () => {
      sftpLog.debug('SSH ready, calling sftp()');
      conn.sftp((err, sftp) => {
        if (err) {
          sftpLog.error('sftp() error', err);
          done(); try { conn.end(); } catch {} reject(err);
          return;
        }
        sftpLog.debug('sftp() success');
        // The connect timeout only covers the SSH/SFTP handshake — a long-lived
        // caller keeps the channel open for the socket's life, so stop the
        // clock now rather than killing it after 30s.
        done();

        if (longLived) {
          fn(sftp, conn).then(r => {
            try { conn.end(); } catch {}
            resolve(r);
          }).catch(e => {
            sftpLog.error('long-lived SFTP error', e);
            try { conn.end(); } catch {}
            reject(e);
          });
          return;
        }

        const entry = { conn, sftp, busy: true, lastUsed: Date.now() };
        sftpPool.set(key, entry);
        runWithTimeout(() => fn(sftp, conn), opts.timeout || 30000).then(r => {
          entry.busy = false;
          entry.lastUsed = Date.now();
          resolve(r);
        }).catch(e => {
          sftpLog.error('exec error', e);
          sftpPool.delete(key);
          try { conn.end(); } catch {}
          reject(e);
        });
      });
    });
    conn.on('error', e => {
      sftpLog.error('SSH error', e);
      sftpPool.delete(key);
      done(); try { conn.end(); } catch {} reject(e);
    });
    try { conn.connect(cfg); } catch (e) {
      sftpLog.error('connect() threw', e);
      sftpPool.delete(key);
      done(); try { conn.end(); } catch {} reject(e);
    }
  });
}
