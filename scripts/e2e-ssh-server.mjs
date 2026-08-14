// Temporary SSH server for end-to-end browser testing. Starts an ssh2 Server
// on 127.0.0.1:<random port> with password auth and writes the port to
// .freebuff/e2e-ssh-port.txt so the test harness can discover it.
import ssh2 from 'ssh2';
const { Server: SshServer } = ssh2;
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import SftpServer from 'ssh2-sftp-server';

const USER = 'tester';
const PASS = 'probe-pass-123';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const server = new SshServer(
  { hostKeys: [privateKey.export({ type: 'pkcs1', format: 'pem' })] },
  (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === USER && ctx.password === PASS) ctx.accept();
      else ctx.reject(['password']);
    });
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        session.on('sftp', (sftpAccept) => {
          // Serve a real SFTP root so the browser's file manager can be exercised.
          const rootDir = join(process.cwd(), '.freebuff', 'e2e-sftp-root');
          mkdirSync(rootDir, { recursive: true });
          const sftpServer = new SftpServer(sftpAccept(), { root: rootDir });
          sftpServer.on?.('error', () => {});
        });
        session.on('pty', (accept2) => accept2 && accept2());
        session.on('shell', (accept2) => {
          const stream = accept2();
          stream.write('Welcome to the e2e SSH server!\r\n$ ');
          let buf = '';
          stream.on('data', (d) => {
            buf += String(d);
            // Handle \r (enter) as command terminator; echo a canned reply.
            if (buf.includes('\r') || buf.includes('\n')) {
              const cmd = buf.replace(/[\r\n]/g, '').trim();
              buf = '';
              if (cmd === 'exit' || cmd === 'logout') {
                stream.exit(0);
                stream.end();
                return;
              }
              stream.write(`e2e-ok: ${cmd}\r\n$ `);
            }
          });
        });
        session.on('exec', (accept2) => {
          const stream = accept2();
          stream.write('e2e-exec-ok\n');
          stream.exit(0);
          stream.end();
        });
      });
    });
  },
);
server.on('error', (e) => { console.error('[e2e-ssh]', e.message); });
server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  writeFileSync(join(process.cwd(), '.freebuff', 'e2e-ssh-port.txt'), String(port), 'utf8');
  console.log(`[e2e-ssh] listening on 127.0.0.1:${port}`);
});
