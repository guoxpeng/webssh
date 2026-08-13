import { withSessionSftp } from './session.mjs';
import { logger } from './logger.mjs';

const log = logger('SFTP');

// SECURITY (M3): refuse to buffer unbounded remote files over the WS channel
const MAX_READ_BYTES = 16 * 1024 * 1024;

export function handleSFTP(ws, config) {
  let sftpSession = null;
  let closed = false;
  log.info(`handleSFTP: ${config?.host} ${config?.username} ${config?.auth_type} ${config?.auth_value ? '***' : 'NO_AUTH'}`);

  const close = () => {
    if (closed) return;
    closed = true;
    log.debug('closing');
    try { ws.close(1000); } catch {}
  };

  const send = (msg) => {
    if (!closed && ws.readyState === 1) {
      try { ws.send(JSON.stringify(msg)); } catch {}
    }
  };

  const start = async () => {
    try {
      send({ type: 'status', status: 'connecting' });
      try {
        await withSessionSftp(config, async (sftp, client) => {
          if (closed) return;
          sftpSession = sftp;
          send({ type: 'status', status: 'connected' });

          ws.on('message', async (raw) => {
            if (closed) return;
            let msg;
            try { msg = JSON.parse(raw.toString()); } catch {
              send({ type: 'error', error: 'Invalid JSON' });
              return;
            }
            if (msg.type === 'ping') return;
            const { id, action, path, content, mode, srcPath, destPath, encoding } = msg;

            if (!action) return;
            try {
              let result;
              switch (action) {
                case 'list': {
                  const entries = await new Promise((resolve, reject) => {
                    sftp.readdir(path || '/', (err, list) => {
                      if (err) { reject(err); return; }
                      resolve(list.filter(e => e.filename !== '.' && e.filename !== '..').map(e => ({
                        name: e.filename, type: e.longname?.startsWith('d') ? 'dir' : 'file',
                        size: e.attrs?.size || 0, mode: e.attrs?.mode || 0o644,
                        mtime: e.attrs?.mtime ? new Date(e.attrs.mtime * 1000).toISOString() : null,
                      })));
                    });
                  });
                  result = { entries };
                  break;
                }
                case 'stat': {
                  const st = await new Promise((resolve, reject) => {
                    sftp.stat(path, (err, st) => { if (err) reject(err); else resolve(st); });
                  });
                  result = { size: st.size, mode: st.mode, mtime: st.mtime ? new Date(st.mtime * 1000).toISOString() : null };
                  break;
                }
                case 'read': {
                  const chunks = [];
                  let size = 0;
                  await new Promise((resolve, reject) => {
                    const stream = sftp.createReadStream(path);
                    stream.on('data', c => {
                      size += c.length;
                      if (size > MAX_READ_BYTES) { stream.destroy(); reject(new Error('File too large to read via WS')); return; }
                      chunks.push(c);
                    });
                    stream.on('error', reject);
                    stream.on('end', resolve);
                  });
                  result = { content: Buffer.concat(chunks).toString('base64') };
                  break;
                }
                case 'write': {
                  const buf = Buffer.from(content, encoding === 'base64' ? 'base64' : 'utf8');
                  await new Promise((resolve, reject) => {
                    sftp.writeFile(path, buf, (err) => { if (err) reject(err); else resolve(); });
                  });
                  result = { success: true };
                  break;
                }
                case 'delete': {
                  await new Promise((resolve, reject) => {
                    sftp.unlink(path, (err) => { if (err) reject(err); else resolve(); });
                  });
                  result = { success: true };
                  break;
                }
                case 'rmdir': {
                  await new Promise((resolve, reject) => {
                    sftp.rmdir(path, (err) => { if (err) reject(err); else resolve(); });
                  });
                  result = { success: true };
                  break;
                }
                case 'mkdir': {
                  await new Promise((resolve, reject) => {
                    sftp.mkdir(path, (err) => { if (err) reject(err); else resolve(); });
                  });
                  result = { success: true };
                  break;
                }
                case 'rename': {
                  await new Promise((resolve, reject) => {
                    sftp.rename(srcPath, destPath, (err) => { if (err) reject(err); else resolve(); });
                  });
                  result = { success: true };
                  break;
                }
                case 'chmod': {
                  await new Promise((resolve, reject) => {
                    sftp.chmod(path, parseInt(mode, 8), (err) => { if (err) reject(err); else resolve(); });
                  });
                  result = { success: true };
                  break;
                }
                default:
                  send({ id, error: 'Unknown action: ' + action });
                  return;
              }
              send({ id, result });
            } catch (e) {
              send({ id, error: e.message });
            }
          });
        });
      } catch (e) {
        send({ type: 'status', status: 'error', error: e.message });
        close();
      }
    } catch (e) {
      send({ type: 'status', status: 'error', error: e.message });
      close();
    }
  };

  ws.on('error', close);
  ws.on('close', () => { closed = true; if (sftpSession) try { sftpSession.end(); } catch {} });
  start();
}
