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
  for (const [id, s] of sessions) {
    if (s.host === host && s.port === (port || 22) && s.username === username) {
      if (credHash === null || s.credHash === credHash) return s.client;
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
  sftpLog.debug('withSessionSftp key: ' + key);
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

  sftpLog.info('creating new SSH connection');
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
        const entry = { conn, sftp, busy: true, lastUsed: Date.now() };
        sftpPool.set(key, entry);

        runWithTimeout(() => fn(sftp, conn), opts.timeout || 30000).then(r => {
          done();
          entry.busy = false;
          entry.lastUsed = Date.now();
          resolve(r);
        }).catch(e => {
          sftpLog.error('exec error', e);
          done();
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
