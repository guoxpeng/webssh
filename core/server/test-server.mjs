import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { open, unlink, mkdir, rmdir, rename, stat, lstat, readdir as fspReaddir } from 'fs/promises';
import { join, dirname, resolve, sep } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'ssh2';
const { Server } = pkg;

// SFTP v3 protocol constants (SSH_FXF_* / SSH_FX_*) — fixed by the spec.
const OPEN_MODE = { READ: 0x00000001, WRITE: 0x00000002, APPEND: 0x00000004, CREAT: 0x00000008, TRUNC: 0x00000010, EXCL: 0x00000020 };
const STATUS_CODE = { OK: 0, EOF: 1, NO_SUCH_FILE: 2, PERMISSION_DENIED: 3, FAILURE: 4, BAD_MESSAGE: 5, NO_CONNECTION: 6, CONNECTION_LOST: 7, OP_UNSUPPORTED: 8 };

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.TEST_SSH_PORT || 2222;
const USER = 'test';
const PASS = 'test123';
const HOME = join(__dirname, '..', '..', 'sftp-home');

if (!existsSync(HOME)) {
  mkdirSync(HOME, { recursive: true });
  writeFileSync(join(HOME, 'README.txt'), 'WebSSH Test Server - SFTP enabled\n');
  const dirs = ['docs', 'projects', 'data', 'backup'];
  for (const d of dirs) {
    const dirPath = join(HOME, d);
    mkdirSync(dirPath, { recursive: true });
    writeFileSync(join(dirPath, `${d}-notes.txt`), `This is the ${d} directory.\n`);
  }
}

const sshd = new Server({
  hostKeys: [readFileSync(join(__dirname, '..', '..', 'host_key'))],
  debug: msg => console.log('[SSHD]', msg),
}, (client) => {
  console.log('[SSHD] Client connected');
  client.on('authentication', (ctx) => {
    console.log('[SSHD] Auth attempt:', ctx.method, ctx.username);
    if (ctx.method === 'password' && ctx.username === USER && ctx.password === PASS) {
      ctx.accept();
    } else if (ctx.method === 'none') {
      ctx.reject(['password']);
    } else {
      ctx.reject();
    }
  }).on('ready', () => {
    console.log('[SSHD] Client authenticated');
    client.on('session', (accept) => {
      const session = accept();
      // Real SSH servers accept pty-req; without this handler ssh2 rejects it
      // and the webssh client fails with "Unable to request a pseudo-terminal".
      session.on('pty', (accept, reject) => { try { accept(); } catch { reject && reject(); } });
      session.on('window-change', (accept) => { try { accept && accept(); } catch {} });
      // Minimal real-file SFTP server following ssh2's own example
      // (node_modules/ssh2/examples/sftp-server-download-only.js). Handles the
      // operations the webssh client uses: realpath, opendir/readdir, stat/
      // lstat/fstat, open/read/write/close, remove, mkdir, rmdir, rename.
      session.on('sftp', (accept) => {
        console.log('[SSHD] SFTP session started');
        const sftp = accept();
        const handles = new Map();
        let handleCount = 0;
        const nextHandle = (entry) => {
          const h = Buffer.alloc(4);
          h.writeUInt32BE(handleCount++, 0, true);
          handles.set(handleCount - 1, entry);
          return h;
        };
        const getHandle = (buf) => (buf && buf.length === 4 ? handles.get(buf.readUInt32BE(0, true)) : null);
        const dropHandle = (buf) => { if (buf && buf.length === 4) handles.delete(buf.readUInt32BE(0, true)); };
        // Reject any path that escapes the SFTP root.
        const safePath = (remote) => {
          const p = resolve(HOME, '.' + (remote || '/'));
          if (p !== HOME && !p.startsWith(HOME + sep)) return null;
          return p;
        };
        const toAttrs = (st) => ({
          mode: (st.isDirectory() ? 0o040000 : 0o100000) | (st.mode & 0o7777),
          uid: 0, gid: 0,
          size: st.size,
          atime: Math.floor(st.atimeMs / 1000),
          mtime: Math.floor(st.mtimeMs / 1000),
        });
        const fail = (reqid, code) => sftp.status(reqid, code);

        sftp.on('REALPATH', (reqid, remote) => {
          const p = safePath(remote);
          if (!p) return fail(reqid, STATUS_CODE.NO_SUCH_FILE);
          const name = remote && remote.startsWith('/') ? remote : '/' + (remote || '').replace(/^\/|\/$/g, '');
          sftp.name(reqid, [{ filename: name || '/', longname: '', attrs: {} }]);
        });
        sftp.on('OPENDIR', async (reqid, remote) => {
          const p = safePath(remote);
          if (!p) return fail(reqid, STATUS_CODE.NO_SUCH_FILE);
          try {
            const st = await stat(p);
            if (!st.isDirectory()) return fail(reqid, STATUS_CODE.FAILURE);
            const entries = await fspReaddir(p);
            const list = await Promise.all(entries.map(async (name) => {
              try {
                const s = await stat(join(p, name));
                const longname = `${s.isDirectory() ? 'd' : '-'}rw-r--r-- 1 0 0 ${s.size} Jan 1 00:00 ${name}`;
                return { filename: name, longname, attrs: toAttrs(s) };
              } catch { return null; }
            }));
            sftp.handle(reqid, nextHandle({ type: 'dir', list: list.filter(Boolean), index: 0 }));
          } catch (e) {
            fail(reqid, e.code === 'ENOENT' ? STATUS_CODE.NO_SUCH_FILE : STATUS_CODE.FAILURE);
          }
        });
        sftp.on('READDIR', (reqid, handleBuf) => {
          const h = getHandle(handleBuf);
          if (!h || h.type !== 'dir') return fail(reqid, STATUS_CODE.FAILURE);
          if (h.index >= h.list.length) return fail(reqid, STATUS_CODE.EOF);
          const chunk = h.list.slice(h.index);
          h.index = h.list.length;
          sftp.name(reqid, chunk);
        });
        const onStat = (reqid, remote) => {
          const p = safePath(remote);
          if (!p) return fail(reqid, STATUS_CODE.NO_SUCH_FILE);
          stat(p).then((st) => sftp.attrs(reqid, toAttrs(st)))
            .catch(() => fail(reqid, STATUS_CODE.NO_SUCH_FILE));
        };
        sftp.on('STAT', onStat);
        sftp.on('LSTAT', onStat);
        sftp.on('OPEN', async (reqid, remote, flags) => {
          const p = safePath(remote);
          if (!p) return fail(reqid, STATUS_CODE.NO_SUCH_FILE);
          let fsFlags = 'r';
          if (flags & OPEN_MODE.WRITE) fsFlags = (flags & OPEN_MODE.TRUNC) ? 'w+' : ((flags & OPEN_MODE.CREAT) ? 'a+' : 'r+');
          try {
            const fh = await open(p, fsFlags);
            sftp.handle(reqid, nextHandle({ type: 'file', fh, pos: 0 }));
          } catch (e) {
            fail(reqid, e.code === 'ENOENT' ? STATUS_CODE.NO_SUCH_FILE : STATUS_CODE.FAILURE);
          }
        });
        sftp.on('READ', async (reqid, handleBuf, offset, length) => {
          const h = getHandle(handleBuf);
          if (!h || h.type !== 'file') return fail(reqid, STATUS_CODE.FAILURE);
          const buf = Buffer.alloc(length);
          try {
            const { bytesRead } = await h.fh.read(buf, 0, length, offset);
            if (bytesRead === 0) return fail(reqid, STATUS_CODE.EOF);
            sftp.data(reqid, bytesRead === length ? buf : buf.subarray(0, bytesRead));
          } catch { fail(reqid, STATUS_CODE.FAILURE); }
        });
        sftp.on('WRITE', async (reqid, handleBuf, offset, data) => {
          const h = getHandle(handleBuf);
          if (!h || h.type !== 'file') return fail(reqid, STATUS_CODE.FAILURE);
          try {
            await h.fh.write(data, 0, data.length, offset);
            fail(reqid, STATUS_CODE.OK);
          } catch { fail(reqid, STATUS_CODE.FAILURE); }
        });
        sftp.on('FSTAT', async (reqid, handleBuf) => {
          const h = getHandle(handleBuf);
          if (!h || h.type !== 'file') return fail(reqid, STATUS_CODE.FAILURE);
          try { sftp.attrs(reqid, toAttrs(await h.fh.stat())); } catch { fail(reqid, STATUS_CODE.FAILURE); }
        });
        sftp.on('CLOSE', async (reqid, handleBuf) => {
          const h = getHandle(handleBuf);
          dropHandle(handleBuf);
          if (!h) return fail(reqid, STATUS_CODE.FAILURE);
          if (h.type === 'file') await h.fh.close().catch(() => {});
          fail(reqid, STATUS_CODE.OK);
        });
        sftp.on('REMOVE', (reqid, remote) => {
          const p = safePath(remote);
          if (!p) return fail(reqid, STATUS_CODE.NO_SUCH_FILE);
          unlink(p).then(() => fail(reqid, STATUS_CODE.OK))
            .catch(() => fail(reqid, STATUS_CODE.NO_SUCH_FILE));
        });
        sftp.on('MKDIR', (reqid, remote) => {
          const p = safePath(remote);
          if (!p) return fail(reqid, STATUS_CODE.FAILURE);
          mkdir(p).then(() => fail(reqid, STATUS_CODE.OK))
            .catch(() => fail(reqid, STATUS_CODE.FAILURE));
        });
        sftp.on('RMDIR', (reqid, remote) => {
          const p = safePath(remote);
          if (!p) return fail(reqid, STATUS_CODE.NO_SUCH_FILE);
          rmdir(p).then(() => fail(reqid, STATUS_CODE.OK))
            .catch(() => fail(reqid, STATUS_CODE.FAILURE));
        });
        sftp.on('RENAME', (reqid, fromRemote, toRemote) => {
          const a = safePath(fromRemote);
          const b = safePath(toRemote);
          if (!a || !b) return fail(reqid, STATUS_CODE.FAILURE);
          rename(a, b).then(() => fail(reqid, STATUS_CODE.OK))
            .catch(() => fail(reqid, STATUS_CODE.FAILURE));
        });
        sftp.on('SETSTAT', (reqid) => fail(reqid, STATUS_CODE.OK));
        sftp.on('FSETSTAT', (reqid) => fail(reqid, STATUS_CODE.OK));
        sftp.on('EXTENDED', (reqid) => fail(reqid, STATUS_CODE.OP_UNSUPPORTED));
        sftp.on('error', (err) => console.error('[SFTP] Error:', err.message));
      });
      session.on('shell', async (accept) => {
        console.log('[SSHD] Shell session started');
        const stream = accept();
        stream.write('Welcome to WebSSH Test Server!\r\n');
        stream.write(`User: ${USER}, Password: ${PASS}\r\n`);
        stream.write(`SFTP port: ${PORT}\r\n`);
        stream.write('Type commands or use SFTP client.\r\n$ ');
        stream.on('data', (data) => {
          const cmd = data.toString().trim();
          if (cmd === 'exit' || cmd === 'quit') {
            stream.write('Goodbye!\r\n');
            stream.exit(0);
            stream.end();
          } else if (cmd === 'ls') {
            try {
              const files = readdirSync(HOME);
              stream.write(files.join('  ') + '\r\n');
            } catch (e) {
              stream.write('Error: ' + e.message + '\r\n');
            }
          } else if (cmd.startsWith('echo ')) {
            stream.write(cmd.slice(5) + '\r\n');
          } else if (cmd === 'help') {
            stream.write('Commands: ls, echo <text>, exit/quit\r\n');
          } else if (cmd) {
            stream.write(`Unknown command: ${cmd}\r\n`);
          }
          stream.write('$ ');
        });
      });
    });
  }).on('end', () => {
    console.log('[SSHD] Client disconnected');
  });
});

sshd.listen(PORT, '0.0.0.0', () => {
  console.log(`[SSHD] Test SSH server listening on 0.0.0.0:${PORT}`);
  console.log(`[SSHD] Connect with: ssh ${USER}@localhost -p ${PORT} password: ${PASS}`);
  console.log(`[SSHD] SFTP root: ${HOME}`);
});

process.on('SIGINT', () => { sshd.close(); process.exit(); });
process.on('SIGTERM', () => { sshd.close(); process.exit(); });
